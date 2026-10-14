import { fileURLToPath } from 'node:url';
import type { GameLaunchErrorCode } from '@brand/contracts';
import type { AccountUseCases, AuthUseCases, CatalogUseCases, GameLaunchUseCases, PaymentIntentStore, PaymentUseCases, PersonalizationUseCases, RefreshIfNeededResult, RegistrationUseCases, SportsLaunchUseCases } from '@brand/domain';
import {
  createAccountUseCases,
  createAuthUseCases,
  createCatalogUseCases,
  createGameLaunchUseCases,
  createPaymentUseCases,
  createPersonalizationUseCases,
  createRegistrationUseCases,
  createSportsLaunchUseCases,
  GameLaunchError,
} from '@brand/domain';
import type { PlatformClient } from '@brand/platform';
import { createPlatformClient, readPlatformConfig } from '@brand/platform';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { isAccountPath, registerAccountRoutes } from './account-routes.js';
import { isPersonalizationPath, registerPersonalizationRoutes } from './personalization-routes.js';
import {
  applyResolvedSession,
  isAuthPath,
  readTelegramBotId,
  registerAuthRoutes,
  resolvePlayerSession,
} from './auth-routes.js';
import { createFinalpayClient } from './finalpay.js';
import { createFilePaymentIntentStore } from './payment-intents.js';
import { isPaymentCallbackPath, isPaymentPath, registerPaymentRoutes } from './payment-routes.js';
import { readPaymentsConfig } from './payments-config.js';
import {
  isRegistrationPath,
  registerRegistrationRoutes,
} from './registration-routes.js';
import {
  clearSessionCookieHeader,
  cookieIsSecure,
  mutationOriginAllowed,
  readSessionSecret,
} from './session-cookie.js';
import { isSportsLaunchPath, registerSportsRoutes } from './sports-routes.js';
import { readSupportChannels } from './support/channels.js';
import { createSupportAiProvider, readSupportAiConfig, type SupportAiProvider } from './support/provider.js';
import { isSupportPath, registerSupportRoutes, supportSecretValues } from './support-routes.js';

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

const paginationSchema = z.object({
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  lastPage: z.number().int().nonnegative(),
  from: z.number().int().nullable(),
  to: z.number().int().nullable(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

const gamesResponseSchema = z.object({
  games: z.array(gameSchema),
  pagination: paginationSchema,
});

const providersResponseSchema = z.object({ providers: z.array(providerSchema) });
const categoriesResponseSchema = z.object({ categories: z.array(categorySchema) });
const lobbyResponseSchema = z.object({
  promotions: z.tuple([]),
  categories: z.array(categorySchema),
  sections: z.array(
    z.object({
      id: z.literal('games'),
      title: z.literal('Games'),
      games: z.array(gameSchema),
    }),
  ),
  providers: z.array(providerSchema),
  pagination: paginationSchema,
});

const optionalText = z.string().trim().min(1).max(200).optional();
const querySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    per_page: z.coerce.number().int().positive().max(100).optional(),
    search: optionalText,
    category: optionalText,
    provider: optionalText,
    grouped_provider: optionalText,
    type: z.enum(['slots', 'live-casino']).optional(),
  })
  .refine((value) => value.limit === undefined || value.per_page === undefined)
  .transform((value) => ({
    page: value.page,
    perPage: value.per_page ?? value.limit,
    search: value.search,
    category: value.category,
    provider: value.provider,
    groupedProvider: value.grouped_provider,
    type: value.type,
  }));

const gameIdSchema = z.string().regex(/^[1-9]\d{0,11}$/);
const gameLaunchResponseSchema = z.object({
  launchUrl: z.url({ protocol: /^https$/ }),
  mode: z.literal('demo'),
});
const realLaunchResponseSchema = z.object({
  launchUrl: z.url({ protocol: /^https$/ }),
  mode: z.literal('real'),
});

const gameLaunchErrors = {
  invalid_game_id: { status: 400, message: 'Invalid game id' },
  game_not_found: { status: 404, message: 'Game not found' },
  demo_unavailable: { status: 422, message: 'Demo play is not available for this game' },
  game_unavailable: { status: 403, message: 'This game is unavailable' },
  auth_required: { status: 401, message: 'Sign in to play for real money' },
  launch_unavailable: { status: 502, message: 'Game launch is unavailable' },
} as const satisfies Record<GameLaunchErrorCode, { status: number; message: string }>;

const errorBody = (code: string, message: string) => ({ error: { code, message } });

function isRealLaunchPath(path: string): boolean {
  const pathname = path.split('?')[0] ?? path;
  return /^\/(?:api\/)?games\/[^/]+\/launch\/real$/.test(pathname);
}

function parseQuery(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams);
}

export interface CreateAppOptions {
  catalog?: CatalogUseCases;
  gameLaunch?: GameLaunchUseCases;
  sportsLaunch?: SportsLaunchUseCases;
  registration?: RegistrationUseCases;
  auth?: AuthUseCases;
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  intentStore?: PaymentIntentStore;
  payments?: PaymentUseCases;
  supportAi?: SupportAiProvider | null;
}

export function createApp(options: CreateAppOptions = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  let platform: PlatformClient | undefined;
  const getPlatform = () =>
    (platform ??= createPlatformClient({
      ...readPlatformConfig(env),
      fetch: options.fetch,
      now,
    }));
  const catalog = options.catalog ?? createCatalogUseCases(getPlatform());
  const gameLaunch = options.gameLaunch ?? createGameLaunchUseCases(getPlatform());
  const sportsLaunch = options.sportsLaunch ?? createSportsLaunchUseCases(getPlatform());
  let auth: AuthUseCases | undefined;
  const getAuth = () => (auth ??= options.auth ?? createAuthUseCases(getPlatform(), { now }));
  let account: AccountUseCases | undefined;
  const getAccount = () => (account ??= createAccountUseCases(getPlatform()));
  let registration: RegistrationUseCases | undefined;
  const getRegistration = () =>
    (registration ??=
      options.registration ??
      createRegistrationUseCases(getPlatform(), {
        now,
        defaultCountry: env.DEFAULT_REGISTRATION_COUNTRY,
        defaultCurrency: env.DEFAULT_REGISTRATION_CURRENCY,
      }));
  const inflight = new Map<string, Promise<RefreshIfNeededResult>>();
  const webOrigin = env.WEB_ORIGIN ?? 'http://localhost:3000';
  const sessionDependencies = {
    getAuth,
    secret: readSessionSecret(env),
    webOrigin,
    now,
    telegramBotId: readTelegramBotId(env),
    inflight,
  };
  const app = new Hono();

  app.use('*', cors({ origin: webOrigin }));
  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/status', (c) => c.json({ service: 'bff', status: 'ready' }));

  const catalogRoutes = new Hono();

  catalogRoutes.get('/games', async (c) => {
    const query = querySchema.safeParse(parseQuery(c.req.url));
    if (!query.success) {
      return c.json(errorBody('invalid_query', 'Invalid catalog query'), 400);
    }
    return c.json(gamesResponseSchema.parse(await catalog.listGames(query.data)));
  });

  catalogRoutes.get('/providers', async (c) => {
    return c.json(providersResponseSchema.parse(await catalog.listProviders()));
  });

  catalogRoutes.get('/categories', async (c) => {
    return c.json(categoriesResponseSchema.parse(await catalog.listCategories()));
  });

  catalogRoutes.get('/lobby', async (c) => {
    const query = querySchema.safeParse(parseQuery(c.req.url));
    if (!query.success || query.data.type === undefined) {
      return c.json(errorBody('invalid_query', 'A valid lobby type is required'), 400);
    }
    const { type, ...filters } = query.data;
    return c.json(lobbyResponseSchema.parse(await catalog.getLobby(type, filters)));
  });

  app.route('/catalog', catalogRoutes);
  app.route('/api/catalog', catalogRoutes);

  const gameRoutes = new Hono();

  gameRoutes.post('/:gameId/launch/demo', async (c) => {
    c.header('Cache-Control', 'no-store');
    const launchError = (code: GameLaunchErrorCode) => {
      const { status, message } = gameLaunchErrors[code];
      return c.json(errorBody(code, message), status);
    };

    const gameId = gameIdSchema.safeParse(c.req.param('gameId'));
    if (!gameId.success) {
      return launchError('invalid_game_id');
    }

    try {
      return c.json(gameLaunchResponseSchema.parse(await gameLaunch.launchDemo(gameId.data)));
    } catch (error) {
      return launchError(error instanceof GameLaunchError ? error.code : 'launch_unavailable');
    }
  });

  gameRoutes.post('/:gameId/launch/real', async (c) => {
    c.header('Cache-Control', 'no-store');
    const launchError = (code: GameLaunchErrorCode) => {
      const { status, message } = gameLaunchErrors[code];
      return c.json(errorBody(code, message), status);
    };

    const gameId = gameIdSchema.safeParse(c.req.param('gameId'));
    if (!gameId.success) return launchError('invalid_game_id');
    if (!mutationOriginAllowed(c.req.header('origin'), webOrigin)) {
      return c.json(errorBody('launch_unavailable', gameLaunchErrors.launch_unavailable.message), 403);
    }

    const resolved = await resolvePlayerSession(c, sessionDependencies, inflight);
    const secure = cookieIsSecure(webOrigin);
    if (resolved.status === 'unavailable') return launchError('launch_unavailable');
    if (resolved.status !== 'ready') {
      applyResolvedSession(c, resolved, sessionDependencies, secure);
      return launchError('auth_required');
    }
    applyResolvedSession(c, resolved, sessionDependencies, secure);

    try {
      return c.json(
        realLaunchResponseSchema.parse(
          await gameLaunch.launchReal(gameId.data, resolved.session.accessToken),
        ),
      );
    } catch (error) {
      if (error instanceof GameLaunchError && error.sessionEnded) {
        c.header('Set-Cookie', clearSessionCookieHeader(secure));
      }
      return launchError(error instanceof GameLaunchError ? error.code : 'launch_unavailable');
    }
  });

  app.route('/games', gameRoutes);
  app.route('/api/games', gameRoutes);

  registerSportsRoutes(app, { ...sessionDependencies, getSports: () => sportsLaunch, inflight });
  registerAuthRoutes(app, sessionDependencies);
  registerAccountRoutes(app, { ...sessionDependencies, getAccount, inflight });
  let personalization: PersonalizationUseCases | undefined;
  const getPersonalization = () =>
    (personalization ??= createPersonalizationUseCases(getPlatform()));
  registerPersonalizationRoutes(app, { ...sessionDependencies, getPersonalization, inflight });
  const paymentsConfig = readPaymentsConfig(env);
  let payments: PaymentUseCases | undefined;
  const getPayments = () => {
    if (payments) return payments;
    payments =
      options.payments ??
      createPaymentUseCases(
        getPlatform(),
        createFinalpayClient(paymentsConfig, options.fetch),
        options.intentStore ??
          createFilePaymentIntentStore(
            fileURLToPath(new URL('../data/payment-intents.json', import.meta.url)),
          ),
        {
          providerConfigured: paymentsConfig.providerConfigured,
          testMode: paymentsConfig.testMode,
          testMaxAmount: paymentsConfig.testMaxAmount,
          mockMode: paymentsConfig.mockMode,
        },
        { now },
      );
    return payments;
  };
  registerPaymentRoutes(app, {
    ...sessionDependencies,
    getPayments,
    paymentsConfig,
    inflight,
  });
  registerRegistrationRoutes(app, {
    getRegistration,
    getAuth,
    secret: sessionDependencies.secret,
    webOrigin,
    now,
  });
  const supportConfig = options.supportAi === undefined ? readSupportAiConfig(env) : null;
  const supportAi =
    options.supportAi !== undefined
      ? options.supportAi
      : supportConfig
        ? createSupportAiProvider(supportConfig, options.fetch ?? globalThis.fetch)
        : null;
  registerSupportRoutes(app, {
    webOrigin,
    ai: supportAi,
    channels: readSupportChannels(env),
    testDepositAvailable: paymentsConfig.testMode,
    secrets: supportSecretValues(env),
  });

  app.onError((_error, c) => {
    if (isRegistrationPath(c.req.path)) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'registration_unavailable',
            message: 'Registration is temporarily unavailable. Please try again.',
          },
        }),
        {
          status: 502,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        },
      );
    }
    if (isPaymentCallbackPath(c.req.path)) {
      return new Response(JSON.stringify({ status: 'FAIL' }), {
        status: 503,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    if (isPaymentPath(c.req.path)) {
      return new Response(
        JSON.stringify({
          error: { code: 'provider_unavailable', message: 'Payments are temporarily unavailable' },
        }),
        {
          status: 502,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        },
      );
    }
    if (isPersonalizationPath(c.req.path)) {
      return new Response(
        JSON.stringify({
          error: { code: 'personalization_unavailable', message: 'Personalization is unavailable' },
        }),
        {
          status: 502,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        },
      );
    }
    if (isAccountPath(c.req.path)) {
      return new Response(
        JSON.stringify({
          error: { code: 'account_unavailable', message: 'Account is unavailable' },
        }),
        {
          status: 502,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        },
      );
    }
    if (isSportsLaunchPath(c.req.path)) {
      return new Response(
        JSON.stringify({
          error: { code: 'sports_unavailable', message: 'Sportsbook is unavailable' },
        }),
        {
          status: 502,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        },
      );
    }
    if (isRealLaunchPath(c.req.path)) {
      return new Response(
        JSON.stringify(errorBody('launch_unavailable', 'Game launch is unavailable')),
        {
          status: 502,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        },
      );
    }
    if (isSupportPath(c.req.path)) {
      return new Response(
        JSON.stringify({
          error: { code: 'support_unavailable', message: 'Support chat is unavailable right now.' },
        }),
        {
          status: 502,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        },
      );
    }
    if (isAuthPath(c.req.path)) {
      return new Response(
        JSON.stringify({
          error: { code: 'auth_unavailable', message: 'Sign-in is unavailable' },
        }),
        {
          status: 502,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        },
      );
    }
    return new Response(JSON.stringify(errorBody('catalog_unavailable', 'Catalog is unavailable')), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  });

  return app;
}
