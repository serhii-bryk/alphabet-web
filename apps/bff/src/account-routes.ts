import { AccountError } from '@brand/domain';
import type { AccountUseCases, PlayerSession, RefreshIfNeededResult } from '@brand/domain';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  applyResolvedSession,
  resolvePlayerSession,
  type AuthRouteDependencies,
} from './auth-routes.js';
import { clearSessionCookieHeader, cookieIsSecure } from './session-cookie.js';

const accountMessages = {
  session_ended: 'Your session has ended',
  account_unavailable: 'Account is unavailable',
} as const;

const profileResponseSchema = z.object({
  playerId: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  currency: z.string().nullable(),
  countryCode: z.string().nullable(),
  emailVerified: z.boolean(),
});

const balanceResponseSchema = z.object({
  balance: z.number(),
  currency: z.string(),
});

const accountErrorSchema = z.object({
  error: z.object({
    code: z.enum(['session_ended', 'account_unavailable']),
    message: z.string(),
  }),
});

export interface AccountRouteDependencies extends AuthRouteDependencies {
  getAccount: () => AccountUseCases;
  inflight: Map<string, Promise<RefreshIfNeededResult>>;
}

export function registerAccountRoutes(app: Hono, dependencies: AccountRouteDependencies): void {
  const secure = cookieIsSecure(dependencies.webOrigin);
  const profile = (c: Context) =>
    handleAccount(
      c,
      dependencies,
      secure,
      (session) => dependencies.getAccount().getProfile(session),
      profileResponseSchema,
    );
  const balance = (c: Context) =>
    handleAccount(
      c,
      dependencies,
      secure,
      (session) => dependencies.getAccount().getBalance(session),
      balanceResponseSchema,
    );

  app.get('/account/profile', profile);
  app.get('/api/account/profile', profile);
  app.get('/account/balance', balance);
  app.get('/api/account/balance', balance);
}

export function isAccountPath(path: string): boolean {
  return (
    path === '/account/profile' ||
    path === '/api/account/profile' ||
    path === '/account/balance' ||
    path === '/api/account/balance'
  );
}

async function handleAccount<T>(
  c: Context,
  dependencies: AccountRouteDependencies,
  secure: boolean,
  read: (session: PlayerSession) => Promise<T>,
  schema: z.ZodType<T>,
): Promise<Response> {
  c.header('Cache-Control', 'no-store');
  const resolved = await resolvePlayerSession(c, dependencies, dependencies.inflight);
  if (resolved.status === 'unavailable') return accountFailure(c, 'account_unavailable');
  if (resolved.status !== 'ready') {
    applyResolvedSession(c, resolved, dependencies, secure);
    return accountFailure(c, 'session_ended');
  }
  applyResolvedSession(c, resolved, dependencies, secure);
  try {
    return c.json(schema.parse(await read(resolved.session)));
  } catch (error) {
    if (error instanceof AccountError && error.code === 'session_ended') {
      c.header('Set-Cookie', clearSessionCookieHeader(secure));
      return accountFailure(c, 'session_ended');
    }
    return accountFailure(c, 'account_unavailable');
  }
}

function accountFailure(c: Context, code: keyof typeof accountMessages): Response {
  const status = code === 'session_ended' ? 401 : 502;
  return c.json(accountErrorSchema.parse({ error: { code, message: accountMessages[code] } }), status);
}
