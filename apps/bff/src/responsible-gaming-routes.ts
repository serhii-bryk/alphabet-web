import type { ResponsibleGamingErrorCode } from '@brand/contracts';
import {
  ResponsibleGamingError,
  type PlayerSession,
  type RefreshIfNeededResult,
  type ResponsibleGamingUseCases,
} from '@brand/domain';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { applyResolvedSession, resolvePlayerSession, type AuthRouteDependencies } from './auth-routes.js';
import { clearSessionCookieHeader, cookieIsSecure, mutationOriginAllowed } from './session-cookie.js';

const messages = {
  session_ended: 'Your session has ended',
  auth_required: 'Sign in to continue',
  responsible_gaming_unavailable: 'Responsible gaming is unavailable',
  invalid_interval: 'Invalid reality check interval',
  invalid_period: 'Invalid period',
  invalid_reason: 'Invalid reason',
  account_restricted: 'This account is restricted',
} as const satisfies Record<ResponsibleGamingErrorCode, string>;

const errorSchema = z.object({
  error: z.object({
    code: z.enum([
      'session_ended',
      'auth_required',
      'responsible_gaming_unavailable',
      'invalid_interval',
      'invalid_period',
      'invalid_reason',
      'account_restricted',
    ]),
    message: z.string(),
  }),
});

const periodSchema = z.object({
  id: z.number().int(),
  text: z.string(),
  dateSelector: z.boolean(),
});

const catalogSchema = z.object({
  realityCheckIntervals: z.array(z.number()),
  coolOffPeriods: z.array(periodSchema),
  coolOffReasons: z.array(z.object({ id: z.number().int(), text: z.string() })),
  selfExclusionPeriods: z.array(periodSchema),
});

const realityCheckSchema = z.object({
  intervalMinutes: z.number(),
});

const sessionClockSchema = z.object({
  startedAt: z.string().nullable(),
  source: z.enum(['platform_login', 'unavailable']),
});

const exclusionResultSchema = z.object({
  kind: z.enum(['cool_off', 'self_exclusion']),
  periodText: z.string(),
  reasonText: z.string().nullable(),
  status: z.string(),
  expiresAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  sessionEnded: z.literal(true),
});

const realityBodySchema = z.object({
  intervalMinutes: z.number().int().nonnegative(),
});

const coolOffBodySchema = z.object({
  periodId: z.number().int(),
  reasonId: z.number().int().optional(),
});

const selfExclusionBodySchema = z.object({
  periodId: z.number().int(),
});

export interface ResponsibleGamingRouteDependencies extends AuthRouteDependencies {
  getResponsibleGaming: () => ResponsibleGamingUseCases;
  inflight: Map<string, Promise<RefreshIfNeededResult>>;
}

export function registerResponsibleGamingRoutes(
  app: Hono,
  dependencies: ResponsibleGamingRouteDependencies,
): void {
  const catalog = (c: Context) => handleCatalog(c, dependencies);
  const readReality = (c: Context) => handleRealityRead(c, dependencies);
  const writeReality = (c: Context) => handleRealityWrite(c, dependencies);
  const session = (c: Context) => handleSessionClock(c, dependencies);
  const coolOff = (c: Context) => handleCoolOff(c, dependencies);
  const selfExclude = (c: Context) => handleSelfExclusion(c, dependencies);

  app.get('/responsible-gaming/catalog', catalog);
  app.get('/api/responsible-gaming/catalog', catalog);
  app.get('/responsible-gaming/reality-check', readReality);
  app.get('/api/responsible-gaming/reality-check', readReality);
  app.post('/responsible-gaming/reality-check', writeReality);
  app.post('/api/responsible-gaming/reality-check', writeReality);
  app.get('/responsible-gaming/session', session);
  app.get('/api/responsible-gaming/session', session);
  app.post('/responsible-gaming/cool-off', coolOff);
  app.post('/api/responsible-gaming/cool-off', coolOff);
  app.post('/responsible-gaming/self-exclusion', selfExclude);
  app.post('/api/responsible-gaming/self-exclusion', selfExclude);
}

export function isResponsibleGamingPath(path: string): boolean {
  const pathname = path.split('?')[0] ?? path;
  return /^\/(?:api\/)?responsible-gaming\/(?:catalog|reality-check|session|cool-off|self-exclusion)$/.test(
    pathname,
  );
}

async function handleCatalog(c: Context, dependencies: ResponsibleGamingRouteDependencies): Promise<Response> {
  c.header('Cache-Control', 'no-store');
  try {
    return c.json(catalogSchema.parse(await dependencies.getResponsibleGaming().catalog()));
  } catch (error) {
    return failureFrom(c, dependencies, error);
  }
}

async function handleRealityRead(c: Context, dependencies: ResponsibleGamingRouteDependencies): Promise<Response> {
  const ready = await openSession(c, dependencies);
  if (ready instanceof Response) return ready;
  try {
    return c.json(realityCheckSchema.parse(await dependencies.getResponsibleGaming().getRealityCheck(ready)));
  } catch (error) {
    return failureFrom(c, dependencies, error);
  }
}

async function handleRealityWrite(c: Context, dependencies: ResponsibleGamingRouteDependencies): Promise<Response> {
  if (!mutationAllowed(c, dependencies)) return failure(c, 'responsible_gaming_unavailable', 403);
  const ready = await openSession(c, dependencies);
  if (ready instanceof Response) return ready;
  const payload = await readJson(c);
  if (!payload.ok) return failure(c, 'invalid_interval');
  const body = realityBodySchema.safeParse(payload.value);
  if (!body.success) return failure(c, 'invalid_interval');
  try {
    return c.json(
      realityCheckSchema.parse(
        await dependencies.getResponsibleGaming().setRealityCheck(ready, body.data.intervalMinutes),
      ),
    );
  } catch (error) {
    return failureFrom(c, dependencies, error);
  }
}

async function handleSessionClock(
  c: Context,
  dependencies: ResponsibleGamingRouteDependencies,
): Promise<Response> {
  const ready = await openSession(c, dependencies);
  if (ready instanceof Response) return ready;
  try {
    return c.json(sessionClockSchema.parse(await dependencies.getResponsibleGaming().sessionClock(ready)));
  } catch (error) {
    return failureFrom(c, dependencies, error);
  }
}

async function handleCoolOff(c: Context, dependencies: ResponsibleGamingRouteDependencies): Promise<Response> {
  if (!mutationAllowed(c, dependencies)) return failure(c, 'responsible_gaming_unavailable', 403);
  const ready = await openSession(c, dependencies);
  if (ready instanceof Response) return ready;
  const payload = await readJson(c);
  if (!payload.ok) return failure(c, 'invalid_period');
  const body = coolOffBodySchema.safeParse(payload.value);
  if (!body.success) return failure(c, coolOffIssue(body.error));
  const request =
    body.data.reasonId === undefined
      ? { periodId: body.data.periodId }
      : { periodId: body.data.periodId, reasonId: body.data.reasonId };
  try {
    const result = exclusionResultSchema.parse(
      await dependencies.getResponsibleGaming().coolOff(ready, request),
    );
    return cleared(c, dependencies, result);
  } catch (error) {
    return failureFrom(c, dependencies, error);
  }
}

async function handleSelfExclusion(
  c: Context,
  dependencies: ResponsibleGamingRouteDependencies,
): Promise<Response> {
  if (!mutationAllowed(c, dependencies)) return failure(c, 'responsible_gaming_unavailable', 403);
  const ready = await openSession(c, dependencies);
  if (ready instanceof Response) return ready;
  const payload = await readJson(c);
  if (!payload.ok) return failure(c, 'invalid_period');
  const body = selfExclusionBodySchema.safeParse(payload.value);
  if (!body.success) return failure(c, 'invalid_period');
  try {
    const result = exclusionResultSchema.parse(
      await dependencies.getResponsibleGaming().selfExclude(ready, { periodId: body.data.periodId }),
    );
    return cleared(c, dependencies, result);
  } catch (error) {
    return failureFrom(c, dependencies, error);
  }
}

function cleared(c: Context, dependencies: ResponsibleGamingRouteDependencies, body: unknown): Response {
  c.header('Set-Cookie', clearSessionCookieHeader(cookieIsSecure(dependencies.webOrigin)));
  return c.json(body);
}

async function openSession(
  c: Context,
  dependencies: ResponsibleGamingRouteDependencies,
): Promise<PlayerSession | Response> {
  c.header('Cache-Control', 'no-store');
  const secure = cookieIsSecure(dependencies.webOrigin);
  const resolved = await resolvePlayerSession(c, dependencies, dependencies.inflight);
  if (resolved.status === 'unavailable') return failure(c, 'responsible_gaming_unavailable');
  if (resolved.status !== 'ready') {
    applyResolvedSession(c, resolved, dependencies, secure);
    return failure(c, 'session_ended');
  }
  applyResolvedSession(c, resolved, dependencies, secure);
  return resolved.session;
}

function failureFrom(
  c: Context,
  dependencies: ResponsibleGamingRouteDependencies,
  error: unknown,
): Response {
  if (
    error instanceof ResponsibleGamingError &&
    (error.code === 'session_ended' || error.code === 'auth_required' || error.code === 'account_restricted')
  ) {
    c.header('Set-Cookie', clearSessionCookieHeader(cookieIsSecure(dependencies.webOrigin)));
    return failure(c, error.code);
  }
  if (
    error instanceof ResponsibleGamingError &&
    (error.code === 'invalid_interval' || error.code === 'invalid_period' || error.code === 'invalid_reason')
  ) {
    return failure(c, error.code);
  }
  return failure(c, 'responsible_gaming_unavailable');
}

function failure(
  c: Context,
  code: keyof typeof messages,
  status?: 400 | 401 | 403 | 502,
): Response {
  c.header('Cache-Control', 'no-store');
  return c.json(errorSchema.parse({ error: { code, message: messages[code] } }), status ?? statusFor(code));
}

function statusFor(code: keyof typeof messages): 400 | 401 | 403 | 502 {
  if (code === 'session_ended' || code === 'auth_required') return 401;
  if (code === 'account_restricted') return 403;
  if (code === 'responsible_gaming_unavailable') return 502;
  return 400;
}

function coolOffIssue(error: z.ZodError): 'invalid_period' | 'invalid_reason' {
  const reasonIssue = error.issues.some((issue) => issue.path[0] === 'reasonId');
  const periodIssue = error.issues.some((issue) => issue.path[0] === 'periodId');
  return reasonIssue && !periodIssue ? 'invalid_reason' : 'invalid_period';
}

function mutationAllowed(c: Context, dependencies: ResponsibleGamingRouteDependencies): boolean {
  return mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin);
}

async function readJson(c: Context): Promise<{ ok: true; value: unknown } | { ok: false }> {
  if (!isJsonContentType(c.req.header('content-type'))) return { ok: false };
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

function isJsonContentType(header: string | undefined): boolean {
  if (!header) return false;
  return header.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}
