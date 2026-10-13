import { PersonalizationError, type PersonalizationUseCases, type PlayerSession, type PlayedListQuery, type RefreshIfNeededResult } from '@brand/domain';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { applyResolvedSession, resolvePlayerSession, type AuthRouteDependencies } from './auth-routes.js';
import { clearSessionCookieHeader, cookieIsSecure, mutationOriginAllowed } from './session-cookie.js';

const messages = {
  session_ended: 'Your session has ended',
  personalization_unavailable: 'Personalization is unavailable',
  invalid_game_id: 'Invalid game id',
  invalid_query: 'Invalid personalization query',
} as const;

const errorSchema = z.object({
  error: z.object({
    code: z.enum([
      'session_ended',
      'personalization_unavailable',
      'invalid_game_id',
      'invalid_query',
    ]),
    message: z.string(),
  }),
});

const providerSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  displayName: z.string(),
  groupedCode: z.string().nullable(),
});

const categorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  fullSlug: z.string().optional(),
  name: z.string(),
  parentId: z.string().nullable(),
  sortOrder: z.number().optional(),
});

const gameSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  kind: z.enum(['casino', 'live']),
  imageUrl: z.string().nullable(),
  provider: providerSchema.nullable(),
  categories: z.array(categorySchema),
  demoPlayEnabled: z.boolean(),
  active: z.boolean(),
  rtp: z.string().nullable(),
  volatility: z.string().nullable(),
  gameType: z.string().nullable(),
  listedAt: z.string().nullable(),
  played: z.number().int().nonnegative().optional(),
  rounds: z.number().int().nonnegative().optional(),
  lastPlayed: z.string().nullable().optional(),
});

const favoritesResponseSchema = z.object({
  games: z.array(gameSchema),
});

const playedResponseSchema = z.object({
  games: z.array(gameSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    perPage: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    lastPage: z.number().int().nonnegative(),
    from: z.number().int().nullable(),
    to: z.number().int().nullable(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});

const favoriteMutationSchema = z.object({
  gameId: z.string().regex(/^[1-9]\d{0,15}$/),
});

const gameIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,15}$/)
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value) && value > 0);

const favoriteBodySchema = z
  .object({
    gameId: z.string().regex(/^[1-9]\d{0,15}$/),
  })
  .transform((value) => Number(value.gameId))
  .refine((value) => Number.isSafeInteger(value) && value > 0);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    if (year === undefined || month === undefined || day === undefined) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  });

const playedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    page: z.coerce.number().int().positive().optional(),
    order: z.enum(['asc', 'desc']).optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
  })
  .refine((value) => value.startDate === undefined || value.endDate === undefined || value.endDate >= value.startDate)
  .transform((value) => ({
    page: value.page,
    limit: value.limit,
    order: value.order ?? 'desc',
    startDate: value.startDate,
    endDate: value.endDate,
  }));

const mostPlayedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    page: z.coerce.number().int().positive().optional(),
    order: z.enum(['asc', 'desc']).optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    played: z.coerce.number().int().min(1).optional(),
    rounds: z.coerce.number().int().min(1).optional(),
  })
  .refine((value) => value.startDate === undefined || value.endDate === undefined || value.endDate >= value.startDate)
  .transform((value) => ({
    page: value.page,
    limit: value.limit,
    order: value.order ?? 'desc',
    startDate: value.startDate,
    endDate: value.endDate,
    played: value.played,
    rounds: value.rounds,
  }));

export interface PersonalizationRouteDependencies extends AuthRouteDependencies {
  getPersonalization: () => PersonalizationUseCases;
  inflight: Map<string, Promise<RefreshIfNeededResult>>;
}

export function registerPersonalizationRoutes(app: Hono, dependencies: PersonalizationRouteDependencies): void {
  const list = (c: Context) =>
    handleRead(c, dependencies, favoritesResponseSchema, (session) =>
      dependencies.getPersonalization().listFavorites(session),
    );
  const add = (c: Context) => handleAdd(c, dependencies);
  const remove = (c: Context) => handleRemove(c, dependencies);
  const lastPlayed = (c: Context) =>
    handlePlayed(c, dependencies, playedQuerySchema, (session, query) =>
      dependencies.getPersonalization().lastPlayed(session, query),
    );
  const mostPlayed = (c: Context) =>
    handlePlayed(c, dependencies, mostPlayedQuerySchema, (session, query) =>
      dependencies.getPersonalization().mostPlayed(session, query),
    );

  app.get('/player/favorites', list);
  app.get('/api/player/favorites', list);
  app.post('/player/favorites', add);
  app.post('/api/player/favorites', add);
  app.delete('/player/favorites/:gameId', remove);
  app.delete('/api/player/favorites/:gameId', remove);
  app.get('/player/last-played', lastPlayed);
  app.get('/api/player/last-played', lastPlayed);
  app.get('/player/most-played', mostPlayed);
  app.get('/api/player/most-played', mostPlayed);
}

export function isPersonalizationPath(path: string): boolean {
  return (
    path === '/player/favorites' ||
    path === '/api/player/favorites' ||
    path === '/player/last-played' ||
    path === '/api/player/last-played' ||
    path === '/player/most-played' ||
    path === '/api/player/most-played' ||
    /^\/(?:api\/)?player\/favorites\/[^/]+$/.test(path)
  );
}

async function handleRead<T>(
  c: Context,
  dependencies: PersonalizationRouteDependencies,
  schema: z.ZodType<T>,
  read: (session: PlayerSession) => Promise<T>,
): Promise<Response> {
  const ready = await openSession(c, dependencies);
  if (ready instanceof Response) return ready;
  try {
    return c.json(schema.parse(await read(ready)));
  } catch (error) {
    return failureFrom(c, dependencies, error);
  }
}

async function handlePlayed(
  c: Context,
  dependencies: PersonalizationRouteDependencies,
  querySchema: z.ZodType<PlayedListQuery>,
  read: (session: PlayerSession, query: PlayedListQuery) => Promise<unknown>,
): Promise<Response> {
  const ready = await openSession(c, dependencies);
  if (ready instanceof Response) return ready;
  const query = querySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!query.success) return failure(c, 'invalid_query');
  try {
    return c.json(playedResponseSchema.parse(await read(ready, query.data)));
  } catch (error) {
    return failureFrom(c, dependencies, error);
  }
}

async function handleAdd(c: Context, dependencies: PersonalizationRouteDependencies): Promise<Response> {
  if (!mutationAllowed(c, dependencies)) return failure(c, 'personalization_unavailable', 403);
  const ready = await openSession(c, dependencies);
  if (ready instanceof Response) return ready;
  if (!isJsonContentType(c.req.header('content-type'))) return failure(c, 'invalid_game_id');
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return failure(c, 'invalid_game_id');
  }
  const gameId = favoriteBodySchema.safeParse(payload);
  if (!gameId.success) return failure(c, 'invalid_game_id');
  try {
    return c.json(
      favoriteMutationSchema.parse(await dependencies.getPersonalization().addFavorite(ready, gameId.data)),
    );
  } catch (error) {
    return failureFrom(c, dependencies, error);
  }
}

async function handleRemove(c: Context, dependencies: PersonalizationRouteDependencies): Promise<Response> {
  if (!mutationAllowed(c, dependencies)) return failure(c, 'personalization_unavailable', 403);
  const ready = await openSession(c, dependencies);
  if (ready instanceof Response) return ready;
  const gameId = gameIdSchema.safeParse(c.req.param('gameId'));
  if (!gameId.success) return failure(c, 'invalid_game_id');
  try {
    return c.json(
      favoriteMutationSchema.parse(
        await dependencies.getPersonalization().removeFavorite(ready, gameId.data),
      ),
    );
  } catch (error) {
    return failureFrom(c, dependencies, error);
  }
}

async function openSession(
  c: Context,
  dependencies: PersonalizationRouteDependencies,
): Promise<PlayerSession | Response> {
  c.header('Cache-Control', 'no-store');
  const secure = cookieIsSecure(dependencies.webOrigin);
  const resolved = await resolvePlayerSession(c, dependencies, dependencies.inflight);
  if (resolved.status === 'unavailable') return failure(c, 'personalization_unavailable');
  if (resolved.status !== 'ready') {
    applyResolvedSession(c, resolved, dependencies, secure);
    return failure(c, 'session_ended');
  }
  applyResolvedSession(c, resolved, dependencies, secure);
  return resolved.session;
}

function failureFrom(
  c: Context,
  dependencies: PersonalizationRouteDependencies,
  error: unknown,
): Response {
  if (error instanceof PersonalizationError && error.code === 'session_ended') {
    c.header('Set-Cookie', clearSessionCookieHeader(cookieIsSecure(dependencies.webOrigin)));
    return failure(c, 'session_ended');
  }
  if (error instanceof PersonalizationError && error.code === 'invalid_game_id') {
    return failure(c, 'invalid_game_id');
  }
  return failure(c, 'personalization_unavailable');
}

function failure(
  c: Context,
  code: keyof typeof messages,
  status: 400 | 401 | 403 | 502 = code === 'session_ended' ? 401 : code === 'personalization_unavailable' ? 502 : 400,
): Response {
  c.header('Cache-Control', 'no-store');
  return c.json(errorSchema.parse({ error: { code, message: messages[code] } }), status);
}

function mutationAllowed(c: Context, dependencies: PersonalizationRouteDependencies): boolean {
  return mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin);
}

function isJsonContentType(header: string | undefined): boolean {
  if (!header) return false;
  return header.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}
