import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthErrorCode } from '@brand/contracts';
import { ExternalAuthError, toAuthSession } from '@brand/domain';
import type { ExternalAuthUseCases } from '@brand/domain';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  boundedMaxAge,
  clearOnboardingCookieHeader,
  clearPendingCookieHeader,
  externalAuthReturnUrl,
  onboardingCookieHeader,
  openOnboarding,
  openPendingAuth,
  pendingCookieHeader,
  readOnboardingCookie,
  readPendingCookie,
  safeReturnPath,
  sealOnboarding,
  sealPendingAuth,
} from './external-auth-state.js';
import {
  cookieIsSecure,
  firstForwardedIp,
  loginBrowser,
  loginDomain,
  mutationOriginAllowed,
  sealSession,
  sessionCookieHeader,
  sessionMaxAgeSeconds,
} from './session-cookie.js';

const messages = {
  external_auth_rejected: 'Sign-in was not accepted',
  external_auth_unavailable: 'This sign-in method is unavailable',
  external_auth_cancelled: 'Sign-in was cancelled',
  external_auth_expired: 'This sign-in expired. Start again',
  external_auth_mismatch: 'This sign-in does not match this browser. Start again',
  invalid_return_url: 'This sign-in return address is not registered',
  account_restricted: 'This account is restricted',
  onboarding_expired: 'This sign-up expired. Start the sign-in again',
  onboarding_unavailable: 'There is no sign-up in progress',
  invalid_onboarding: 'Check the highlighted details and try again',
  email_already_registered: 'An account with this email already exists',
  auth_unavailable: 'Sign-in is unavailable',
} as const satisfies Partial<Record<AuthErrorCode, string>>;

type ExternalCode = keyof typeof messages;

const methodSchema = z.object({
  method: z.string().regex(/^[a-z0-9_-]{1,64}$/),
  next: z.string().max(200).optional(),
});

const finishSchema = z
  .object({
    ticket: z.string().regex(/^[\x21-\x7E]{8,128}$/).optional(),
    clientState: z.string().regex(/^[\x21-\x7E]{16,512}$/).optional(),
    error: z.string().regex(/^[a-z_]{1,64}$/).optional(),
  })
  .strict();

const valuesSchema = z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), z.string().max(255));

const callbackErrors: Record<string, ExternalCode> = {
  authentication_cancelled: 'external_auth_cancelled',
  authentication_expired: 'external_auth_expired',
  authentication_failed: 'external_auth_rejected',
  invalid_authentication_state: 'external_auth_mismatch',
  invalid_login_method_authentication: 'external_auth_rejected',
  login_method_unavailable: 'external_auth_unavailable',
  external_login_email_already_exists: 'email_already_registered',
  registration_not_allowed: 'external_auth_unavailable',
  player_has_excluded: 'account_restricted',
  player_login_unavailable: 'account_restricted',
};

const terminalOnboarding = new Set<ExternalCode>([
  'onboarding_expired',
  'onboarding_unavailable',
  'external_auth_unavailable',
  'account_restricted',
]);

export interface ExternalAuthRouteDependencies {
  getExternalAuth: () => ExternalAuthUseCases;
  secret: string | undefined;
  webOrigin: string | undefined;
  now: () => number;
}

export function registerExternalAuthRoutes(app: Hono, dependencies: ExternalAuthRouteDependencies): void {
  const methods = (c: Context) => handleMethods(c, dependencies);
  const start = (c: Context) => handleStart(c, dependencies);
  const finish = (c: Context) => handleFinish(c, dependencies);
  const onboarding = (c: Context) => handleOnboardingRead(c, dependencies);
  const complete = (c: Context) => handleOnboardingComplete(c, dependencies);

  app.get('/auth/methods', methods);
  app.get('/api/auth/methods', methods);
  app.get('/auth/providers', methods);
  app.get('/api/auth/providers', methods);
  app.post('/auth/external/start', start);
  app.post('/api/auth/external/start', start);
  app.post('/auth/external/finish', finish);
  app.post('/api/auth/external/finish', finish);
  app.get('/auth/onboarding', onboarding);
  app.get('/api/auth/onboarding', onboarding);
  app.post('/auth/onboarding', complete);
  app.post('/api/auth/onboarding', complete);
}

export function isExternalAuthPath(path: string): boolean {
  return (
    path === '/auth/methods' ||
    path === '/api/auth/methods' ||
    path === '/auth/providers' ||
    path === '/api/auth/providers' ||
    path === '/auth/external/start' ||
    path === '/api/auth/external/start' ||
    path === '/auth/external/finish' ||
    path === '/api/auth/external/finish' ||
    path === '/auth/onboarding' ||
    path === '/api/auth/onboarding'
  );
}

async function handleMethods(c: Context, dependencies: ExternalAuthRouteDependencies): Promise<Response> {
  try {
    const methods = await dependencies.getExternalAuth().listMethods();
    return json({ methods });
  } catch (error) {
    logExternalFailure(error);
    return json({ methods: [] });
  }
}

async function handleStart(c: Context, dependencies: ExternalAuthRouteDependencies): Promise<Response> {
  if (!mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin)) {
    return failure('auth_unavailable', [], 403);
  }
  if (!dependencies.secret) return failure('external_auth_unavailable');
  const returnUrl = externalAuthReturnUrl(dependencies.webOrigin);
  if (!returnUrl) return failure('invalid_return_url');
  const payload = await readJson(c);
  const parsed = methodSchema.safeParse(payload);
  if (!parsed.success) return failure('external_auth_unavailable');

  const clientState = randomBytes(32).toString('hex');
  try {
    const started = await dependencies.getExternalAuth().start({
      method: parsed.data.method,
      returnUrl,
      clientState,
      ipNumber: firstForwardedIp(c.req.header('x-forwarded-for')),
      browser: loginBrowser(c.req.header('user-agent')),
      domain: loginDomain(dependencies.webOrigin),
    });
    if (started.redirectUrl.includes(started.authenticationId)) {
      return failure('external_auth_unavailable');
    }
    const secure = cookieIsSecure(dependencies.webOrigin);
    const sealed = sealPendingAuth(
      {
        authenticationId: started.authenticationId,
        clientState,
        next: safeReturnPath(parsed.data.next),
        method: parsed.data.method,
      },
      dependencies.secret,
    );
    return json(
      { redirectUrl: started.redirectUrl },
      200,
      [pendingCookieHeader(sealed, boundedMaxAge(started.expiresIn, 300, 600), secure)],
    );
  } catch (error) {
    logExternalFailure(error);
    return failure(errorCode(error), clearCookies(dependencies));
  }
}

async function handleFinish(c: Context, dependencies: ExternalAuthRouteDependencies): Promise<Response> {
  if (!mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin)) {
    return failure('auth_unavailable', [], 403);
  }
  if (!dependencies.secret) return failure('external_auth_unavailable', clearCookies(dependencies));
  const payload = await readJson(c);
  const parsed = finishSchema.safeParse(payload);
  const secure = cookieIsSecure(dependencies.webOrigin);
  const pending = openPendingAuth(readPendingCookie(c.req.header('cookie')) ?? '', dependencies.secret);
  const cleared = [clearPendingCookieHeader(secure)];
  if (!parsed.success || !pending || !parsed.data.clientState || !statesMatch(pending.clientState, parsed.data.clientState)) {
    return failure('external_auth_mismatch', cleared);
  }
  if (parsed.data.error) {
    return failure(callbackErrors[parsed.data.error] ?? 'external_auth_rejected', cleared);
  }
  if (!parsed.data.ticket) return failure('external_auth_rejected', cleared);

  try {
    const result = await dependencies.getExternalAuth().exchange({
      ticket: parsed.data.ticket,
      authenticationId: pending.authenticationId,
    });
    if (result.status === 'onboarding_required') {
      const expiresAt = new Date(dependencies.now() + result.onboarding.expiresIn * 1000).toISOString();
      const sealed = sealOnboarding(
        {
          token: result.onboarding.token,
          requiredFields: result.onboarding.requiredFields,
          prefill: result.onboarding.prefill,
          next: pending.next,
          expiresAt,
          method: pending.method,
        },
        dependencies.secret,
      );
      return json(
        {
          status: 'onboarding_required',
          requiredFields: result.onboarding.requiredFields,
          prefill: result.onboarding.prefill,
          expiresAt,
          next: pending.next,
          method: pending.method,
        },
        200,
        [
          ...cleared,
          onboardingCookieHeader(sealed, boundedMaxAge(result.onboarding.expiresIn, 1800, 1800), secure),
        ],
      );
    }
    return sessionJson(result.session, pending.next, dependencies, [...cleared, clearOnboardingCookieHeader(secure)]);
  } catch (error) {
    logExternalFailure(error);
    return failure(errorCode(error), cleared);
  }
}

async function handleOnboardingRead(
  c: Context,
  dependencies: ExternalAuthRouteDependencies,
): Promise<Response> {
  const pending = readOnboarding(c, dependencies);
  if (pending.status === 'expired') return failure('onboarding_expired', clearOnboarding(dependencies));
  if (pending.status !== 'ready') return failure('onboarding_unavailable', clearOnboarding(dependencies));
  return json({
    requiredFields: pending.value.requiredFields,
    prefill: pending.value.prefill,
    expiresAt: pending.value.expiresAt,
    next: pending.value.next,
    ...(pending.value.method ? { method: pending.value.method } : {}),
  });
}

async function handleOnboardingComplete(
  c: Context,
  dependencies: ExternalAuthRouteDependencies,
): Promise<Response> {
  if (!mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin)) {
    return failure('auth_unavailable', [], 403);
  }
  const pending = readOnboarding(c, dependencies);
  if (pending.status === 'expired') return failure('onboarding_expired', clearOnboarding(dependencies));
  if (pending.status !== 'ready' || !dependencies.secret) {
    return failure('onboarding_unavailable', clearOnboarding(dependencies));
  }
  const payload = await readJson(c);
  const parsed = z.object({ values: valuesSchema }).strict().safeParse(payload);
  if (!parsed.success) return failure('invalid_onboarding');

  try {
    const session = await dependencies.getExternalAuth().completeOnboarding({
      token: pending.value.token,
      requiredFields: googlePhoneFields(pending.value.method, pending.value.requiredFields),
      values: parsed.data.values,
    });
    return sessionJson(session, pending.value.next, dependencies, clearOnboarding(dependencies));
  } catch (error) {
    logExternalFailure(error);
    const code = errorCode(error);
    const fields = error instanceof ExternalAuthError ? error.fields : [];
    return failure(code, terminalOnboarding.has(code) ? clearOnboarding(dependencies) : [], fields);
  }
}

function googlePhoneFields(method: string | undefined, requiredFields: readonly string[]): string[] {
  if (method !== 'google') return [...requiredFields];
  const next = [...requiredFields];
  for (const field of ['phone_prefix', 'phone']) {
    if (!next.includes(field)) next.push(field);
  }
  return next;
}

function readOnboarding(
  c: Context,
  dependencies: ExternalAuthRouteDependencies,
): { status: 'missing' } | { status: 'expired' } | { status: 'ready'; value: NonNullable<ReturnType<typeof openOnboarding>> } {
  if (!dependencies.secret) return { status: 'missing' };
  const pending = openOnboarding(readOnboardingCookie(c.req.header('cookie')) ?? '', dependencies.secret);
  if (!pending) return { status: 'missing' };
  if (Date.parse(pending.expiresAt) <= dependencies.now()) return { status: 'expired' };
  return { status: 'ready', value: pending };
}

function sessionJson(
  session: Parameters<typeof toAuthSession>[0],
  next: string,
  dependencies: ExternalAuthRouteDependencies,
  cookies: string[],
): Response {
  if (!dependencies.secret) return failure('external_auth_unavailable', cookies);
  const secure = cookieIsSecure(dependencies.webOrigin);
  return json({ ...toAuthSession(session), next: safeReturnPath(next) }, 200, [
    ...cookies,
    sessionCookieHeader(
      sealSession(session, dependencies.secret),
      sessionMaxAgeSeconds(session.expiresAt, dependencies.now()),
      secure,
    ),
  ]);
}

function clearCookies(dependencies: ExternalAuthRouteDependencies): string[] {
  const secure = cookieIsSecure(dependencies.webOrigin);
  return [clearPendingCookieHeader(secure), clearOnboardingCookieHeader(secure)];
}

function clearOnboarding(dependencies: ExternalAuthRouteDependencies): string[] {
  return [clearOnboardingCookieHeader(cookieIsSecure(dependencies.webOrigin))];
}

function statesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

function errorCode(error: unknown): ExternalCode {
  if (error instanceof ExternalAuthError && error.code in messages) return error.code;
  return 'external_auth_unavailable';
}

function failure(
  code: ExternalCode,
  cookies: string[] = [],
  fieldsOrStatus: readonly string[] | number = [],
  fields: readonly string[] = [],
): Response {
  const status = typeof fieldsOrStatus === 'number' ? fieldsOrStatus : statusFor(code);
  const fieldNames = typeof fieldsOrStatus === 'number' ? fields : fieldsOrStatus;
  return json(
    {
      error: { code, message: messages[code] },
      ...(fieldNames.length > 0 ? { fields: fieldNames } : {}),
    },
    status,
    cookies,
  );
}

function statusFor(code: ExternalCode): number {
  switch (code) {
    case 'external_auth_rejected':
      return 401;
    case 'account_restricted':
      return 403;
    case 'invalid_return_url':
    case 'invalid_onboarding':
      return 422;
    case 'external_auth_expired':
    case 'onboarding_expired':
      return 410;
    case 'onboarding_unavailable':
      return 404;
    case 'email_already_registered':
      return 409;
    case 'external_auth_cancelled':
    case 'external_auth_mismatch':
      return 400;
    default:
      return 502;
  }
}

function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

async function readJson(c: Context): Promise<unknown> {
  if (!isJson(c.req.header('content-type'))) return undefined;
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function isJson(header: string | undefined): boolean {
  return header?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function logExternalFailure(error: unknown): void {
  if (!(error instanceof ExternalAuthError)) return;
  console.error(JSON.stringify({ event: 'external_auth_failure', code: error.code }));
}
