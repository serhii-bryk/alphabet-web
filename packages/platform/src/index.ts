import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';

const platformEnvSchema = z.object({
  FINAL_PLATFORM_API_URL: z
    .url()
    .refine((value) => new URL(value).pathname.replace(/\/+$/, '').endsWith('/api/v1'), {
      message: 'FINAL_PLATFORM_API_URL must include the /api/v1 path',
    }),
  FINAL_PLATFORM_API_KEY: z.string().min(1),
  FINAL_PLATFORM_API_SECRET: z.string().min(1),
});

const nullableNumberSchema = z.union([z.number(), z.string()]).nullable();
const timeoutSchema = z.number().int().min(1).max(30_000).default(10_000);

export const platformProviderSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  display_name: z.string(),
  grouped_code: z.string().nullable(),
});

export const platformCategorySchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  parent_id: z.number().int().nullable(),
  sort_order: z.number(),
});

const aggregateCountSchema = z.preprocess((value) => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^(?:0|[1-9]\d{0,15})$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : value;
  }
  return value;
}, z.number().int().nonnegative());

const platformGameCategorySchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  full_slug: z.string(),
  name: z.string(),
  parent_id: z.number().int().nullable(),
});

export const platformGameSchema = z.object({
  id: z.number().int(),
  provider_id: z.number().int(),
  provider_name: z.string().nullable(),
  provider_category_id: z.number().int().nullable(),
  provider_game_id: z.string(),
  name: z.string(),
  slug: z.string(),
  type: z.enum(['slots', 'live-casino']).nullable(),
  provider_game_type: z.string().nullable(),
  icon: z.string().nullable(),
  rtp: nullableNumberSchema,
  volatility: nullableNumberSchema,
  is_active: z.union([z.literal(0), z.literal(1)]),
  demo_play_enabled: z.union([z.literal(0), z.literal(1)]),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  provider: platformProviderSchema.nullable(),
  categories: z.array(platformGameCategorySchema),
  played: aggregateCountSchema.optional(),
  rounds: aggregateCountSchema.optional(),
  last_played: z.string().nullable().optional(),
});

const platformLastPlayedGameSchema = platformGameSchema.extend({
  played: aggregateCountSchema,
  last_played: z.string().nullable(),
});

const platformMostPlayedGameSchema = platformLastPlayedGameSchema.extend({
  rounds: aggregateCountSchema,
});

const paginatorLinkSchema = z.object({
  url: z.string().nullable(),
  label: z.string(),
  active: z.boolean(),
});

function platformPageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    current_page: z.number().int().positive(),
    data: z.array(item),
    first_page_url: z.string(),
    from: z.number().int().nullable(),
    last_page: z.number().int().nonnegative(),
    last_page_url: z.string(),
    links: z.array(paginatorLinkSchema),
    next_page_url: z.string().nullable(),
    path: z.string(),
    per_page: z.number().int().positive(),
    prev_page_url: z.string().nullable(),
    to: z.number().int().nullable(),
    total: z.number().int().nonnegative(),
  });
}

export const platformGamesPageSchema = platformPageSchema(platformGameSchema);
export const platformFavoritesSchema = z.object({
  count: z.number().int().nonnegative(),
  items: z.array(platformGameSchema),
});
export const platformFavoriteAddedSchema = z.object({
  game_id: z.number().int().positive(),
});
export const platformFavoriteRemovedSchema = z.object({
  removed_game_id: z.number().int().positive(),
});
export const platformLastPlayedPageSchema = platformPageSchema(platformLastPlayedGameSchema);
export const platformMostPlayedPageSchema = platformPageSchema(platformMostPlayedGameSchema);

const finiteNumberSchema = z.number().refine((value) => Number.isFinite(value));

const platformRealityCheckSettingsSchema = z.object({
  values: z.array(finiteNumberSchema),
});

const platformRealityCheckSchema = z.object({
  value: finiteNumberSchema,
});

const platformResponsiblePeriodSchema = z.object({
  id: z.number().int(),
  text: z.string(),
  date_selector: z.boolean(),
});

const platformResponsibleReasonSchema = z.object({
  id: z.number().int(),
  text: z.string(),
});

const platformCoolOffSettingsSchema = z.object({
  periods: z.array(platformResponsiblePeriodSchema),
  reasons: z.array(platformResponsibleReasonSchema),
});

const platformSelfExclusionSettingsSchema = z.object({
  periods: z.array(platformResponsiblePeriodSchema),
});

const platformExclusionSchema = z.object({
  type: z.enum(['cooloff', 'self_exclusion']),
  period: z.string(),
  reason: z.string().nullable(),
  status: z.enum(['CoolOff', 'SelfExclusion']),
  expires_at: z.string().nullable(),
  created_at: z.string().nullable(),
});

// Partner login rows include ip_address and browser. Only login_at leaves this client.
const platformPlayerLoginsSchema = z.object({
  logins: z.array(
    z.object({
      login_at: z.string().min(1),
    }),
  ),
});

export const platformProvidersSchema = z.array(platformProviderSchema);
export const platformCategoriesSchema = z.array(platformCategorySchema);

export const platformGameLaunchSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  provider: z.string(),
  provider_code: z.string(),
  launch_url: z.string(),
  session_id: z.string().nullable(),
});

export const platformSportsLaunchSchema = z.object({
  url: z.string(),
  ticket: z.string(),
  expires_at: z.string(),
  play_mode: z.enum(['REAL', 'DEMO']),
  provider_code: z.string(),
});

export type PlatformGame = z.infer<typeof platformGameSchema>;
export type PlatformGameLaunch = z.infer<typeof platformGameLaunchSchema>;
export type PlatformSportsLaunch = z.infer<typeof platformSportsLaunchSchema>;
export type PlatformGamesPage = z.infer<typeof platformGamesPageSchema>;
export type PlatformFavorites = z.infer<typeof platformFavoritesSchema>;
export type PlatformFavoriteAdded = z.infer<typeof platformFavoriteAddedSchema>;
export type PlatformFavoriteRemoved = z.infer<typeof platformFavoriteRemovedSchema>;
export type PlatformLastPlayedPage = z.infer<typeof platformLastPlayedPageSchema>;
export type PlatformMostPlayedPage = z.infer<typeof platformMostPlayedPageSchema>;
export type PlatformProvider = z.infer<typeof platformProviderSchema>;
export type PlatformCategory = z.infer<typeof platformCategorySchema>;
export type PlatformRealityCheckSettings = z.infer<typeof platformRealityCheckSettingsSchema>;
export type PlatformRealityCheck = z.infer<typeof platformRealityCheckSchema>;
export type PlatformResponsiblePeriod = z.infer<typeof platformResponsiblePeriodSchema>;
export type PlatformCoolOffSettings = z.infer<typeof platformCoolOffSettingsSchema>;
export type PlatformSelfExclusionSettings = z.infer<typeof platformSelfExclusionSettingsSchema>;
export type PlatformExclusion = z.infer<typeof platformExclusionSchema>;
export type PlatformPlayerLogins = z.infer<typeof platformPlayerLoginsSchema>;

export interface PlatformExclusionInput {
  period_id: number;
  reason_id?: number;
}

export interface PlatformPlayedFilters {
  page?: number;
  limit?: number;
  order?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
}

export interface PlatformMostPlayedFilters extends PlatformPlayedFilters {
  played?: number;
  rounds?: number;
}

export interface PlatformGameFilters {
  page?: number;
  perPage?: number;
  search?: string;
  category?: string;
  provider?: string;
  groupedProvider?: string;
  type?: 'slots' | 'live-casino';
}

const platformCurrencySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  code: z.string().min(1),
  symbol: z.string(),
});

const platformCountrySchema = z.object({
  alpha2: z.string().min(1),
});

const platformRegistrationCountrySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  name_common: z.string(),
  alpha2: z.string().length(2),
  alpha3: z.string().length(3),
});

const platformRegistrationCurrencySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  code: z.string().length(3),
  symbol: z.string(),
});

export const platformCountriesResponseSchema = z.object({
  data: z.array(platformRegistrationCountrySchema),
});

export const platformCurrenciesResponseSchema = z.object({
  data: z.array(platformRegistrationCurrencySchema),
});

const platformAuthProfileSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().min(1),
  currency: platformCurrencySchema.nullable(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  country: platformCountrySchema.nullable().optional(),
  email_verified: z.boolean().optional(),
  phone: z.string().nullable().optional(),
  phone_prefix: z.string().nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
});

export const platformLoginResponseSchema = z.object({
  profile: platformAuthProfileSchema,
  partner_id: z.number().int(),
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive(),
});

export const platformProfileResponseSchema = z.object({
  profile: platformAuthProfileSchema,
});

export const platformRefreshResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive(),
});

export const platformLogoutResponseSchema = z.object({
  message: z.string(),
  sessions_ended: z.number().int().nonnegative(),
});

export const platformRegisterResponseSchema = z.object({
  profile: platformAuthProfileSchema,
});

export const platformActivateEmailResponseSchema = platformLoginResponseSchema.extend({
  email_verified_at: z.string(),
});

const platformBalanceWireSchema = z.object({
  balance: z.number(),
  currency: z.string().min(1),
  address: z.string().nullable(),
});

const stablePlatformCode = /^[a-z][a-z0-9_]{0,63}$/;

export type PlatformLoginResponse = Omit<
  z.infer<typeof platformLoginResponseSchema>,
  'partner_id'
>;
export type PlatformProfileResponse = z.infer<typeof platformProfileResponseSchema>;
export type PlatformRefreshResponse = z.infer<typeof platformRefreshResponseSchema>;
export type PlatformLogoutResponse = z.infer<typeof platformLogoutResponseSchema>;
export type PlatformRegistrationCountry = z.infer<typeof platformRegistrationCountrySchema>;
export type PlatformRegistrationCurrency = z.infer<typeof platformRegistrationCurrencySchema>;
export type PlatformRegisterResponse = z.infer<typeof platformRegisterResponseSchema>;
export type PlatformActivateEmailResponse = z.infer<typeof platformActivateEmailResponseSchema>;
export interface PlatformBalance {
  balance: number;
  currency: string;
}

const platformDepositWireSchema = z
  .object({
    type: z.string(),
    balance: z.number(),
    amount: z.number(),
    currency: z.string(),
    address: z.string().nullable().optional(),
    transaction_id: z.union([z.string(), z.number()]).optional(),
  })
  .transform(({ balance, amount, currency }) => ({ balance, amount, currency }));

const platformWithdrawalRequestSchema = z.object({
  hash: z.uuid(),
  status: z.string(),
  amount: z.number(),
  currency: z.string(),
});

const platformWithdrawalActionSchema = z.object({
  hash: z.uuid(),
  status: z.string(),
});

export type PlatformDepositResult = z.infer<typeof platformDepositWireSchema>;
export type PlatformWithdrawalRequest = z.infer<typeof platformWithdrawalRequestSchema>;
export type PlatformWithdrawalAction = z.infer<typeof platformWithdrawalActionSchema>;

export interface PlatformDepositInput {
  playerId: number;
  amount: number;
  currency: string;
  transactionReference: string;
  ip?: string;
}

export interface PlatformWithdrawalRequestInput {
  playerId: number;
  amount: number;
  currency: string;
  transactionReference: string;
  ip?: string;
}

export interface PlatformLoginInput {
  email: string;
  password: string;
  ipNumber?: string;
  browser?: string;
  domain?: string;
}

export interface PlatformRegistrationInput {
  email: string;
  first_name: string;
  last_name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  phone_prefix: string;
  phone: string;
  date_of_birth: string;
  password: string;
  currency: string;
}

export interface PlatformActivationInput {
  playerId: number;
  ipNumber?: string;
  browser?: string;
  domain?: string;
}

export interface PlatformClient {
  getRegistrationCountries(): Promise<PlatformRegistrationCountry[]>;
  getRegistrationCurrencies(): Promise<PlatformRegistrationCurrency[]>;
  register(input: PlatformRegistrationInput): Promise<PlatformRegisterResponse>;
  activateEmail(input: PlatformActivationInput): Promise<PlatformActivateEmailResponse>;
  getGames(filters?: PlatformGameFilters): Promise<PlatformGamesPage>;
  getProviders(): Promise<PlatformProvider[]>;
  getCategories(): Promise<PlatformCategory[]>;
  launchDemoGame(gameId: string): Promise<PlatformGameLaunch>;
  login(input: PlatformLoginInput): Promise<PlatformLoginResponse>;
  refresh(playerId: number, accessToken: string): Promise<PlatformRefreshResponse>;
  logout(playerId: number, accessToken: string): Promise<PlatformLogoutResponse>;
  getProfile(playerId: number, accessToken: string): Promise<PlatformProfileResponse>;
  getBalance(playerId: number, accessToken: string): Promise<PlatformBalance>;
  launchRealGame(gameId: string, accessToken: string): Promise<PlatformGameLaunch>;
  requestSportsLaunchTicket(input: {
    lang?: string;
    path?: string;
    accessToken?: string;
  }): Promise<PlatformSportsLaunch>;
  deposit(input: PlatformDepositInput): Promise<PlatformDepositResult>;
  requestWithdrawal(input: PlatformWithdrawalRequestInput): Promise<PlatformWithdrawalRequest>;
  approveWithdrawal(hash: string): Promise<PlatformWithdrawalAction>;
  confirmWithdrawal(hash: string): Promise<PlatformWithdrawalAction>;
  rollbackWithdrawal(hash: string): Promise<PlatformWithdrawalAction>;
  listFavorites(playerId: number, accessToken: string): Promise<PlatformFavorites>;
  addFavorite(playerId: number, accessToken: string, gameId: number): Promise<PlatformFavoriteAdded>;
  removeFavorite(playerId: number, accessToken: string, gameId: number): Promise<PlatformFavoriteRemoved>;
  lastPlayed(
    playerId: number,
    accessToken: string,
    filters?: PlatformPlayedFilters,
  ): Promise<PlatformLastPlayedPage>;
  mostPlayed(
    playerId: number,
    accessToken: string,
    filters?: PlatformMostPlayedFilters,
  ): Promise<PlatformMostPlayedPage>;
  getRealityCheckSettings(): Promise<PlatformRealityCheckSettings>;
  getPlayerRealityCheck(playerId: number, accessToken: string): Promise<PlatformRealityCheck>;
  setPlayerRealityCheck(
    playerId: number,
    accessToken: string,
    value: number,
  ): Promise<PlatformRealityCheck>;
  getCoolOffSettings(): Promise<PlatformCoolOffSettings>;
  getSelfExclusionSettings(): Promise<PlatformSelfExclusionSettings>;
  excludePlayer(
    playerId: number,
    accessToken: string,
    input: PlatformExclusionInput,
  ): Promise<PlatformExclusion>;
  /** HMAC only. The result never includes ip_address or browser. */
  getPlayerLogins(playerId: number, limit: number): Promise<PlatformPlayerLogins>;
}

export class PlatformClientError extends Error {
  readonly code: 'request_failed' | 'invalid_response';
  /** HTTP status of a non-ok Platform response; undefined for network, timeout, or parsing failures. */
  readonly status: number | undefined;
  /** Stable Platform `code` when the error JSON included one. Never the upstream message. */
  readonly platformCode: string | undefined;

  constructor(
    code: 'request_failed' | 'invalid_response',
    status?: number,
    platformCode?: string,
  ) {
    super(code === 'request_failed' ? 'Platform request failed' : 'Platform response was invalid');
    this.name = 'PlatformClientError';
    this.code = code;
    this.status = status;
    this.platformCode = platformCode;
  }
}

export interface CreatePlatformClientOptions {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  timeoutMs?: number;
}

export function readPlatformConfig(
  env: Record<string, string | undefined>,
): Omit<CreatePlatformClientOptions, 'fetch' | 'now' | 'timeoutMs'> {
  const parsed = platformEnvSchema.parse(env);
  return {
    baseUrl: parsed.FINAL_PLATFORM_API_URL,
    apiKey: parsed.FINAL_PLATFORM_API_KEY,
    apiSecret: parsed.FINAL_PLATFORM_API_SECRET,
  };
}

export function createPlatformClient(options: CreatePlatformClientOptions): PlatformClient {
  const parsed = platformEnvSchema.parse({
    FINAL_PLATFORM_API_URL: options.baseUrl,
    FINAL_PLATFORM_API_KEY: options.apiKey,
    FINAL_PLATFORM_API_SECRET: options.apiSecret,
  });
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = timeoutSchema.parse(options.timeoutMs);
  const baseUrl = parsed.FINAL_PLATFORM_API_URL.replace(/\/+$/, '');
  const baseOrigin = new URL(baseUrl).origin;

  async function request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    schema: z.ZodType<T>,
    requestOptions: { query?: URLSearchParams; json?: unknown; accessToken?: string } = {},
  ): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    if (requestOptions.query) {
      url.search = requestOptions.query.toString();
    }

    const body = requestOptions.json === undefined ? undefined : JSON.stringify(requestOptions.json);
    const timestamp = Math.floor(now() / 1000).toString();
    const bodyHash = createHash('sha256')
      .update(body ?? '')
      .digest('hex');
    const payload = `${method}\n${url.pathname}\n${timestamp}\n${bodyHash}`;
    const signature = createHmac('sha256', parsed.FINAL_PLATFORM_API_SECRET)
      .update(payload)
      .digest('base64');

    const headers: Record<string, string> = {
      'X-API-KEY': parsed.FINAL_PLATFORM_API_KEY,
      'X-TIMESTAMP': timestamp,
      'X-SIGNATURE': signature,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (requestOptions.accessToken) {
      headers.Authorization = `Bearer ${requestOptions.accessToken}`;
    }

    const registrationAttempt = method === 'POST' && path === '/player/register';
    let response: Response;
    try {
      response = await fetcher(url, {
        method,
        signal: AbortSignal.timeout(timeoutMs),
        headers,
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      if (registrationAttempt) {
        logRegistrationDiagnostic({
          status: null,
          code: null,
          classification: 'transport_failure',
          contentType: null,
        });
      }
      throw new PlatformClientError('request_failed');
    }

    if (!response.ok) {
      const platformCode = await readPlatformCode(response);
      if (registrationAttempt) {
        logRegistrationDiagnostic({
          status: response.status,
          code: platformCode ?? null,
          classification: classifyRegistrationFailure(response.status, platformCode),
          contentType: safeContentType(response),
        });
      }
      throw new PlatformClientError('request_failed', response.status, platformCode);
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      if (registrationAttempt) {
        logRegistrationDiagnostic({
          status: response.status,
          code: null,
          classification: 'unexpected_success_response_shape',
          contentType: safeContentType(response),
        });
      }
      throw new PlatformClientError('invalid_response');
    }

    const result = schema.safeParse(responseBody);
    if (!result.success) {
      if (registrationAttempt) {
        logRegistrationDiagnostic({
          status: response.status,
          code: null,
          classification: 'unexpected_success_response_shape',
          contentType: safeContentType(response),
        });
      }
      throw new PlatformClientError('invalid_response');
    }
    return result.data;
  }

  return {
    async getRegistrationCountries() {
      return (await request('GET', '/countries', platformCountriesResponseSchema)).data;
    },
    async getRegistrationCurrencies() {
      return (await request('GET', '/currencies', platformCurrenciesResponseSchema)).data;
    },
    register(input) {
      return request('POST', '/player/register', platformRegisterResponseSchema, { json: input });
    },
    async activateEmail(input) {
      const query = new URLSearchParams();
      if (input.domain) query.set('domain', input.domain);
      if (input.ipNumber) query.set('ip_number', input.ipNumber);
      if (input.browser) query.set('browser', input.browser);
      const result = await request(
        'GET',
        playerActionPath(input.playerId, 'activateEmail'),
        platformActivateEmailResponseSchema,
        { query },
      );
      return result;
    },
    getGames(filters = {}) {
      const query = new URLSearchParams();
      if (filters.page !== undefined) query.set('page', String(filters.page));
      if (filters.perPage !== undefined) query.set('per_page', String(filters.perPage));
      if (filters.search !== undefined) query.set('search', filters.search);
      if (filters.category !== undefined) query.set('category', filters.category);
      if (filters.provider !== undefined) query.set('provider', filters.provider);
      if (filters.groupedProvider !== undefined) {
        query.set('grouped_provider', filters.groupedProvider);
      }
      if (filters.type !== undefined) query.set('type', filters.type);
      return request('GET', '/games', platformGamesPageSchema, { query });
    },
    getProviders() {
      return request('GET', '/games/providers', platformProvidersSchema);
    },
    getCategories() {
      return request('GET', '/games/categories', platformCategoriesSchema);
    },
    async launchDemoGame(gameId) {
      return launchGame(gameId, 'demo');
    },
    async launchRealGame(gameId, accessToken) {
      return launchGame(gameId, 'real', requireAccessToken(accessToken));
    },
    async requestSportsLaunchTicket(input) {
      const json: Record<string, string> = {};
      if (input.lang !== undefined) json.lang = input.lang;
      if (input.path !== undefined) json.path = input.path;
      const ticket = await request(
        'POST',
        '/sports/request-launch-ticket',
        platformSportsLaunchSchema,
        {
          json,
          ...(input.accessToken === undefined
            ? {}
            : { accessToken: requireAccessToken(input.accessToken) }),
        },
      );
      if (!isSportsPlayUrl(ticket.url) || !Number.isFinite(Date.parse(ticket.expires_at))) {
        throw new PlatformClientError('invalid_response');
      }
      if (input.accessToken === undefined && ticket.play_mode !== 'DEMO') {
        throw new PlatformClientError('invalid_response');
      }
      if (input.accessToken !== undefined && ticket.play_mode !== 'REAL') {
        throw new PlatformClientError('invalid_response');
      }
      return ticket;
    },
    async login(input) {
      const json: Record<string, string> = {
        email: input.email,
        password: input.password,
      };
      if (input.ipNumber) json.ip_number = input.ipNumber;
      if (input.browser) json.browser = input.browser;
      if (input.domain) json.domain = input.domain;
      const result = await request('POST', '/player/login', platformLoginResponseSchema, { json });
      return {
        profile: result.profile,
        access_token: result.access_token,
        token_type: result.token_type,
        expires_in: result.expires_in,
      };
    },
    refresh(playerId, accessToken) {
      return request('POST', playerActionPath(playerId, 'refresh'), platformRefreshResponseSchema, {
        accessToken: requireAccessToken(accessToken),
      });
    },
    logout(playerId, accessToken) {
      return request('POST', playerActionPath(playerId, 'logout'), platformLogoutResponseSchema, {
        accessToken: requireAccessToken(accessToken),
      });
    },
    getProfile(playerId, accessToken) {
      return request('GET', playerActionPath(playerId, 'profile'), platformProfileResponseSchema, {
        accessToken: requireAccessToken(accessToken),
      });
    },
    async getBalance(playerId, accessToken) {
      const result = await request(
        'GET',
        playerActionPath(playerId, 'balance'),
        platformBalanceWireSchema,
        { accessToken: requireAccessToken(accessToken) },
      );
      return { balance: result.balance, currency: result.currency };
    },
    deposit(input) {
      return request('POST', '/transactions/deposit', platformDepositWireSchema, {
        json: transactionBody(input),
      });
    },
    requestWithdrawal(input) {
      return request('POST', '/transactions/withdraw/request', platformWithdrawalRequestSchema, {
        json: transactionBody(input),
      });
    },
    approveWithdrawal(hash) {
      return request('POST', '/transactions/withdraw/approve', platformWithdrawalActionSchema, {
        json: { hash: requireWithdrawalHash(hash) },
      });
    },
    confirmWithdrawal(hash) {
      return request('POST', '/transactions/withdraw/confirm', platformWithdrawalActionSchema, {
        json: { hash: requireWithdrawalHash(hash) },
      });
    },
    rollbackWithdrawal(hash) {
      return request('POST', '/transactions/withdraw/rollback', platformWithdrawalActionSchema, {
        json: { hash: requireWithdrawalHash(hash) },
      });
    },
    async listFavorites(playerId, accessToken) {
      return request('GET', playerCollectionPath(playerId, 'favorites'), platformFavoritesSchema, {
        accessToken: requireAccessToken(accessToken),
      });
    },
    async addFavorite(playerId, accessToken, gameId) {
      return request('POST', playerCollectionPath(playerId, 'favorites'), platformFavoriteAddedSchema, {
        accessToken: requireAccessToken(accessToken),
        json: { game_id: requireFavoriteGameId(gameId) },
      });
    },
    async removeFavorite(playerId, accessToken, gameId) {
      return request(
        'DELETE',
        `${playerCollectionPath(playerId, 'favorites')}/${requireFavoriteGameId(gameId)}`,
        platformFavoriteRemovedSchema,
        { accessToken: requireAccessToken(accessToken) },
      );
    },
    async lastPlayed(playerId, accessToken, filters = {}) {
      return request(
        'GET',
        playerCollectionPath(playerId, 'games/last-played'),
        platformLastPlayedPageSchema,
        {
          accessToken: requireAccessToken(accessToken),
          query: playedQuery(filters),
        },
      );
    },
    async mostPlayed(playerId, accessToken, filters = {}) {
      return request(
        'GET',
        playerCollectionPath(playerId, 'games/most-played'),
        platformMostPlayedPageSchema,
        {
          accessToken: requireAccessToken(accessToken),
          query: playedQuery(filters),
        },
      );
    },
    getRealityCheckSettings() {
      return request('GET', '/casino/realityCheckSettings', platformRealityCheckSettingsSchema);
    },
    getPlayerRealityCheck(playerId, accessToken) {
      return request('GET', playerResourcePath(playerId, 'reality-check'), platformRealityCheckSchema, {
        accessToken: requireAccessToken(accessToken),
      });
    },
    setPlayerRealityCheck(playerId, accessToken, value) {
      return request('POST', playerResourcePath(playerId, 'reality-check'), platformRealityCheckSchema, {
        accessToken: requireAccessToken(accessToken),
        json: { value: requireRealityMinutes(value) },
      });
    },
    getCoolOffSettings() {
      return request('GET', '/casino/coolOffSettings', platformCoolOffSettingsSchema);
    },
    getSelfExclusionSettings() {
      return request('GET', '/casino/selfexclusionSettings', platformSelfExclusionSettingsSchema);
    },
    excludePlayer(playerId, accessToken, input) {
      const json: PlatformExclusionInput = {
        period_id: requireSelectionId(input.period_id),
      };
      if (input.reason_id !== undefined) {
        json.reason_id = requireSelectionId(input.reason_id);
      }
      return request('POST', playerResourcePath(playerId, 'exclusion'), platformExclusionSchema, {
        accessToken: requireAccessToken(accessToken),
        json,
      });
    },
    getPlayerLogins(playerId, limit) {
      if (!Number.isSafeInteger(limit) || limit < 1) {
        throw new PlatformClientError('request_failed');
      }
      const query = new URLSearchParams();
      query.set('limit', String(limit));
      return request('GET', playerResourcePath(playerId, 'logins'), platformPlayerLoginsSchema, { query });
    },
  };

  async function launchGame(
    gameId: string,
    playMode: 'demo' | 'real',
    accessToken?: string,
  ): Promise<PlatformGameLaunch> {
    const launch = await request('POST', '/player/game/launch', platformGameLaunchSchema, {
      json: { game_id: gameId, play_mode: playMode },
      ...(accessToken === undefined ? {} : { accessToken }),
    });
    if (!isPlatformLaunchUrl(launch.launch_url)) {
      throw new PlatformClientError('invalid_response');
    }
    return launch;
  }

  function requirePlayerId(playerId: number): number {
    if (!Number.isSafeInteger(playerId) || playerId <= 0) {
      throw new PlatformClientError('request_failed');
    }
    return playerId;
  }

  function requireFavoriteGameId(gameId: number): number {
    if (!Number.isSafeInteger(gameId) || gameId <= 0) {
      throw new PlatformClientError('request_failed');
    }
    return gameId;
  }

  function playerActionPath(
    playerId: number,
    action: 'refresh' | 'logout' | 'profile' | 'balance' | 'activateEmail',
  ): string {
    return `/player/${requirePlayerId(playerId)}/${action}`;
  }

  function playerCollectionPath(playerId: number, suffix: 'favorites' | 'games/last-played' | 'games/most-played'): string {
    return `/player/${requirePlayerId(playerId)}/${suffix}`;
  }

  function playerResourcePath(
    playerId: number,
    resource: 'reality-check' | 'exclusion' | 'logins',
  ): string {
    return `/player/${requirePlayerId(playerId)}/${resource}`;
  }

  function requireSelectionId(id: number): number {
    if (!Number.isSafeInteger(id)) {
      throw new PlatformClientError('request_failed');
    }
    return id;
  }

  function requireRealityMinutes(value: number): number {
    if (!Number.isFinite(value)) {
      throw new PlatformClientError('request_failed');
    }
    return value;
  }

  function playedQuery(filters: PlatformMostPlayedFilters): URLSearchParams {
    const query = new URLSearchParams();
    if (filters.page !== undefined) query.set('page', String(filters.page));
    if (filters.limit !== undefined) query.set('limit', String(filters.limit));
    if (filters.order !== undefined) query.set('order', filters.order);
    if (filters.startDate !== undefined) query.set('startDate', filters.startDate);
    if (filters.endDate !== undefined) query.set('endDate', filters.endDate);
    if (filters.played !== undefined) query.set('played', String(filters.played));
    if (filters.rounds !== undefined) query.set('rounds', String(filters.rounds));
    return query;
  }

  function requireAccessToken(accessToken: string): string {
    if (accessToken.length === 0) {
      throw new PlatformClientError('request_failed');
    }
    return accessToken;
  }

  function transactionBody(input: PlatformDepositInput | PlatformWithdrawalRequestInput) {
    if (!Number.isSafeInteger(input.playerId) || input.playerId <= 0) {
      throw new PlatformClientError('request_failed');
    }
    if (!Number.isFinite(input.amount) || input.amount < 0.01) {
      throw new PlatformClientError('request_failed');
    }
    if (!/^[A-Za-z]{3}$/.test(input.currency) || input.transactionReference.length === 0) {
      throw new PlatformClientError('request_failed');
    }
    const body: {
      player_id: number;
      amount: number;
      currency: string;
      transaction_reference: string;
      ip?: string;
    } = {
      player_id: input.playerId,
      amount: input.amount,
      currency: input.currency,
      transaction_reference: input.transactionReference,
    };
    if (input.ip) body.ip = input.ip;
    return body;
  }

  function requireWithdrawalHash(hash: string): string {
    if (!z.uuid().safeParse(hash).success) {
      throw new PlatformClientError('request_failed');
    }
    return hash;
  }

  function isSportsPlayUrl(value: string): boolean {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
      return false;
    }
    return url.origin === baseOrigin && /^\/sports\/play\/[A-Za-z0-9_-]{16,128}$/.test(url.pathname);
  }

  function isPlatformLaunchUrl(value: string): boolean {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    return url.protocol === 'https:' && url.origin === baseOrigin;
  }
}

async function readPlatformCode(response: Response): Promise<string | undefined> {
  try {
    return extractPlatformCode(await response.json());
  } catch {
    return undefined;
  }
}

function extractPlatformCode(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const topLevel = readStableCode(record.code);
  if (topLevel) return topLevel;
  const error = record.error;
  const errorCode = readStableCode(error);
  if (errorCode) return errorCode;
  if (typeof error === 'object' && error !== null) {
    return readStableCode((error as Record<string, unknown>).code);
  }
  return undefined;
}

function readStableCode(value: unknown): string | undefined {
  return typeof value === 'string' && stablePlatformCode.test(value) ? value : undefined;
}

function classifyRegistrationFailure(status: number, code: string | undefined): string {
  if (status === 401) return 'auth';
  if (status === 403) return 'authorization';
  if (
    status === 409 &&
    (code === 'player_already_exists' || code === 'player_username_already_exists')
  ) {
    return 'duplicate_account';
  }
  if (code === 'invalid_player_country') return 'unsupported_country';
  if (status === 422) return 'validation';
  if (status >= 500) return 'platform_5xx';
  return 'unexpected_upstream_failure';
}

function safeContentType(response: Response): string | null {
  const media = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(media) ? media : null;
}

function logRegistrationDiagnostic(diagnostic: {
  status: number | null;
  code: string | null;
  classification: string;
  contentType: string | null;
}): void {
  console.error(
    JSON.stringify({
      event: 'registration_failure',
      status: diagnostic.status,
      code: diagnostic.code,
      classification: diagnostic.classification,
      contentType: diagnostic.contentType,
    }),
  );
}
