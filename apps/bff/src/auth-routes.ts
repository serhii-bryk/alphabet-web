import { createHash } from 'node:crypto';
import type { AuthErrorCode } from '@brand/contracts';
import { AuthError, toAuthSession } from '@brand/domain';
import type { AuthUseCases, PlayerSession, RefreshIfNeededResult } from '@brand/domain';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  clearSessionCookieHeader,
  cookieIsSecure,
  firstForwardedIp,
  loginBrowser,
  loginDomain,
  mutationOriginAllowed,
  openSession,
  readCookie,
  sealSession,
  sessionCookieHeader,
  sessionMaxAgeSeconds,
} from './session-cookie.js';

const authMessages = {
  invalid_credentials: 'The email or password is incorrect',
  invalid_login: 'Enter a valid email and password',
  account_restricted: 'This account is restricted',
  auth_unavailable: 'Sign-in is unavailable',
  session_ended: 'Your session has ended',
} as const satisfies Record<AuthErrorCode, string>;

const loginBodySchema = z.object({
  email: z.string().trim().toLowerCase().max(255).pipe(z.email()),
  password: z.string().min(8).max(255),
});

const authSessionResponseSchema = z.object({
  authenticated: z.literal(true),
  playerId: z.string(),
  email: z.string(),
  currency: z.string().nullable(),
  expiresAt: z.iso.datetime(),
});

const guestSessionSchema = z.object({
  authenticated: z.literal(false),
});

const authErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      'invalid_credentials',
      'invalid_login',
      'account_restricted',
      'auth_unavailable',
      'session_ended',
    ]),
    message: z.string(),
  }),
});

export interface AuthRouteDependencies {
  getAuth: () => AuthUseCases;
  secret: string | undefined;
  webOrigin: string | undefined;
  now: () => number;
  inflight?: Map<string, Promise<RefreshIfNeededResult>>;
}

export type ResolvedPlayerSession =
  | { status: 'guest' }
  | { status: 'cleared' }
  | { status: 'unavailable' }
  | { status: 'ready'; session: PlayerSession; replaced: boolean };

export function registerAuthRoutes(app: Hono, dependencies: AuthRouteDependencies): Map<
  string,
  Promise<RefreshIfNeededResult>
> {
  const secure = cookieIsSecure(dependencies.webOrigin);
  const inflight = dependencies.inflight ?? new Map<string, Promise<RefreshIfNeededResult>>();

  const login = (c: Context) => handleLogin(c, dependencies, secure);
  const logout = (c: Context) => handleLogout(c, dependencies, secure);
  const session = (c: Context) => handleSession(c, dependencies, secure, inflight);

  app.post('/auth/login', login);
  app.post('/api/auth/login', login);
  app.post('/auth/logout', logout);
  app.post('/api/auth/logout', logout);
  app.get('/session', session);
  app.get('/api/session', session);
  return inflight;
}

export function isAuthPath(path: string): boolean {
  return (
    path === '/session' ||
    path === '/api/session' ||
    path === '/auth/login' ||
    path === '/api/auth/login' ||
    path === '/auth/logout' ||
    path === '/api/auth/logout'
  );
}

async function handleLogin(
  c: Context,
  dependencies: AuthRouteDependencies,
  secure: boolean,
): Promise<Response> {
  c.header('Cache-Control', 'no-store');
  if (!mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin)) {
    return originRejected(c);
  }
  if (!dependencies.secret) return authFailure(c, 'auth_unavailable');

  if (!isJsonContentType(c.req.header('content-type'))) {
    return authFailure(c, 'invalid_login');
  }

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return authFailure(c, 'invalid_login');
  }

  const parsed = loginBodySchema.safeParse(payload);
  if (!parsed.success) return authFailure(c, 'invalid_login');

  try {
    const session = await dependencies.getAuth().login({
      email: parsed.data.email,
      password: parsed.data.password,
      ipNumber: firstForwardedIp(c.req.header('x-forwarded-for')),
      browser: loginBrowser(c.req.header('user-agent')),
      domain: loginDomain(dependencies.webOrigin),
    });
    const body = authSessionResponseSchema.parse(toAuthSession(session));
    c.header(
      'Set-Cookie',
      sessionCookieHeader(
        sealSession(session, dependencies.secret),
        sessionMaxAgeSeconds(session.expiresAt, dependencies.now()),
        secure,
      ),
    );
    return c.json(body);
  } catch (error) {
    return authFailure(c, loginFailureCode(error));
  }
}

async function handleLogout(
  c: Context,
  dependencies: AuthRouteDependencies,
  secure: boolean,
): Promise<Response> {
  c.header('Cache-Control', 'no-store');
  if (!mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin)) {
    return originRejected(c);
  }
  if (!dependencies.secret) return authFailure(c, 'auth_unavailable');

  const sealed = readCookie(c.req.header('cookie'));
  const session = sealed ? openSession(sealed, dependencies.secret) : undefined;
  if (session) {
    try {
      await dependencies.getAuth().logout(session);
    } catch {
      // Local logout still succeeds. Do not retry.
    }
  }
  if (sealed) {
    c.header('Set-Cookie', clearSessionCookieHeader(secure));
  }
  return c.json(guestSessionSchema.parse({ authenticated: false }));
}

export async function resolvePlayerSession(
  c: Context,
  dependencies: AuthRouteDependencies,
  inflight: Map<string, Promise<RefreshIfNeededResult>>,
): Promise<ResolvedPlayerSession> {
  if (!dependencies.secret) return { status: 'unavailable' };

  const sealed = readCookie(c.req.header('cookie'));
  if (!sealed) return { status: 'guest' };

  const session = openSession(sealed, dependencies.secret);
  if (!session) return { status: 'cleared' };

  // Key is a hash of the access token. Do not log it.
  const key = createHash('sha256').update(session.accessToken).digest('hex');
  let result: RefreshIfNeededResult;
  try {
    result = await shareRefresh(inflight, key, () => dependencies.getAuth().refreshIfNeeded(session));
  } catch {
    return { status: 'unavailable' };
  }

  if (result.action === 'clear') return { status: 'cleared' };
  if (result.action === 'replace') return { status: 'ready', session: result.session, replaced: true };
  return { status: 'ready', session: result.session, replaced: false };
}

export function applyResolvedSession(
  c: Context,
  resolved: ResolvedPlayerSession,
  dependencies: AuthRouteDependencies,
  secure: boolean,
): void {
  if (!dependencies.secret) return;
  if (resolved.status === 'cleared') {
    c.header('Set-Cookie', clearSessionCookieHeader(secure));
    return;
  }
  if (resolved.status === 'ready' && resolved.replaced) {
    c.header(
      'Set-Cookie',
      sessionCookieHeader(
        sealSession(resolved.session, dependencies.secret),
        sessionMaxAgeSeconds(resolved.session.expiresAt, dependencies.now()),
        secure,
      ),
    );
  }
}

async function handleSession(
  c: Context,
  dependencies: AuthRouteDependencies,
  secure: boolean,
  inflight: Map<string, Promise<RefreshIfNeededResult>>,
): Promise<Response> {
  c.header('Cache-Control', 'no-store');
  const resolved = await resolvePlayerSession(c, dependencies, inflight);
  if (resolved.status === 'unavailable') return authFailure(c, 'auth_unavailable');
  if (resolved.status === 'ready') {
    applyResolvedSession(c, resolved, dependencies, secure);
    return c.json(authSessionResponseSchema.parse(toAuthSession(resolved.session)));
  }
  applyResolvedSession(c, resolved, dependencies, secure);
  return c.json(guestSessionSchema.parse({ authenticated: false }));
}

function shareRefresh(
  inflight: Map<string, Promise<RefreshIfNeededResult>>,
  key: string,
  run: () => Promise<RefreshIfNeededResult>,
): Promise<RefreshIfNeededResult> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = Promise.resolve()
    .then(run)
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

function loginFailureCode(
  error: unknown,
): 'invalid_credentials' | 'invalid_login' | 'auth_unavailable' | 'account_restricted' {
  if (error instanceof AuthError && error.code === 'invalid_credentials') return 'invalid_credentials';
  if (error instanceof AuthError && error.code === 'invalid_login') return 'invalid_login';
  if (error instanceof AuthError && error.code === 'account_restricted') return 'account_restricted';
  return 'auth_unavailable';
}

function originRejected(c: Context): Response {
  return c.json(
    authErrorSchema.parse({
      error: { code: 'auth_unavailable', message: authMessages.auth_unavailable },
    }),
    403,
  );
}

function authFailure(
  c: Context,
  code: 'invalid_credentials' | 'invalid_login' | 'auth_unavailable' | 'account_restricted',
): Response {
  const status =
    code === 'account_restricted'
      ? 403
      : code === 'invalid_credentials'
        ? 401
        : code === 'invalid_login'
          ? 400
          : 502;
  return c.json(
    authErrorSchema.parse({ error: { code, message: authMessages[code] } }),
    status,
  );
}

function isJsonContentType(header: string | undefined): boolean {
  if (!header) return false;
  const mediaType = header.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json';
}
