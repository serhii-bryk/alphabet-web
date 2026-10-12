import type { SportsLaunchErrorCode } from '@brand/contracts';
import type { RefreshIfNeededResult, SportsLaunchUseCases } from '@brand/domain';
import { SportsLaunchError } from '@brand/domain';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { applyResolvedSession, resolvePlayerSession, type AuthRouteDependencies } from './auth-routes.js';
import { clearSessionCookieHeader, cookieIsSecure, mutationOriginAllowed } from './session-cookie.js';

const sportsLaunchBodySchema = z
  .object({
    locale: z.enum(['en', 'ar']).optional(),
    path: z.string().max(255).optional(),
  })
  .strict();

const sportsLaunchResponseSchema = z.object({
  launchUrl: z.url({ protocol: /^https$/ }),
  expiresAt: z.iso.datetime(),
  mode: z.enum(['demo', 'real']),
});

const sportsLaunchErrors = {
  invalid_sports_request: { status: 400, message: 'Sportsbook request is invalid' },
  invalid_sports_path: { status: 400, message: 'That sports page cannot be opened' },
  auth_required: { status: 401, message: 'Sign in again to open the sportsbook' },
  sports_unavailable: { status: 502, message: 'Sportsbook is unavailable' },
} as const satisfies Record<SportsLaunchErrorCode, { status: number; message: string }>;

const errorBody = (code: SportsLaunchErrorCode, message: string) => ({ error: { code, message } });

export function isSportsLaunchPath(path: string): boolean {
  const pathname = path.split('?')[0] ?? path;
  return pathname === '/sports/launch' || pathname === '/api/sports/launch';
}

export interface SportsRouteDependencies extends AuthRouteDependencies {
  getSports: () => SportsLaunchUseCases;
  inflight: Map<string, Promise<RefreshIfNeededResult>>;
}

export function registerSportsRoutes(app: Hono, dependencies: SportsRouteDependencies) {
  const launch = async (c: Context) => {
    c.header('Cache-Control', 'no-store');
    const fail = (code: SportsLaunchErrorCode) => {
      const { status, message } = sportsLaunchErrors[code];
      return c.json(errorBody(code, message), status);
    };

    if (!mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin)) {
      return fail('sports_unavailable');
    }

    let body: unknown = {};
    const raw = await c.req.text();
    if (raw.trim() !== '') {
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        return fail('invalid_sports_request');
      }
    }
    const parsed = sportsLaunchBodySchema.safeParse(body);
    if (!parsed.success) return fail('invalid_sports_request');

    const input = {
      ...(parsed.data.locale === undefined ? {} : { lang: parsed.data.locale }),
      ...(parsed.data.path === undefined ? {} : { path: parsed.data.path }),
    };
    const resolved = await resolvePlayerSession(c, dependencies, dependencies.inflight);
    const secure = cookieIsSecure(dependencies.webOrigin);
    if (resolved.status === 'unavailable') return fail('sports_unavailable');
    if (resolved.status === 'cleared') {
      applyResolvedSession(c, resolved, dependencies, secure);
      return fail('auth_required');
    }

    try {
      const launchResult =
        resolved.status === 'ready'
          ? await dependencies.getSports().launchAuthenticated(input, resolved.session.accessToken)
          : await dependencies.getSports().launchGuest(input);
      if (resolved.status === 'ready') {
        applyResolvedSession(c, resolved, dependencies, secure);
      }
      return c.json(sportsLaunchResponseSchema.parse(launchResult));
    } catch (error) {
      if (error instanceof SportsLaunchError && error.sessionEnded) {
        c.header('Set-Cookie', clearSessionCookieHeader(secure));
      }
      return fail(error instanceof SportsLaunchError ? error.code : 'sports_unavailable');
    }
  };

  app.post('/sports/launch', launch);
  app.post('/api/sports/launch', launch);
}
