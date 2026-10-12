import type {
  CatalogCategoriesResponse,
  CatalogCategory,
  CatalogGame,
  CatalogGameFilters,
  CatalogGamesResponse,
  CatalogLobbyResponse,
  CatalogProvider,
  CatalogProvidersResponse,
  GameLaunchErrorCode,
  GameLaunchResponse,
  PlatformGameType,
} from '@brand/contracts';
import { PlatformClientError } from '@brand/platform';
import type {
  PlatformCategory,
  PlatformClient,
  PlatformGame,
  PlatformGameLaunch,
  PlatformGamesPage,
  PlatformProvider,
} from '@brand/platform';
import { isPlayerSessionEnded } from './auth.js';

export { isPlayerSessionEnded };

export function mapProvider(provider: PlatformProvider): CatalogProvider {
  return {
    id: String(provider.id),
    code: provider.code,
    name: provider.name,
    displayName: provider.display_name,
    groupedCode: provider.grouped_code,
  };
}

export function mapCategory(category: PlatformCategory): CatalogCategory {
  return {
    id: String(category.id),
    slug: category.slug,
    name: category.name,
    parentId: category.parent_id === null ? null : String(category.parent_id),
    sortOrder: category.sort_order,
  };
}

function catalogText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function catalogMetric(value: number | string | null): string | null {
  if (value === null) return null;
  return catalogText(String(value));
}

export function mapGame(game: PlatformGame): CatalogGame | null {
  if (game.type === null) {
    return null;
  }

  return {
    id: String(game.id),
    slug: game.slug,
    title: game.name,
    kind: game.type === 'live-casino' ? 'live' : 'casino',
    imageUrl: game.icon,
    provider: game.provider ? mapProvider(game.provider) : null,
    categories: game.categories.map((category) => ({
      id: String(category.id),
      slug: category.slug,
      fullSlug: category.full_slug,
      name: category.name,
      parentId: category.parent_id === null ? null : String(category.parent_id),
    })),
    demoPlayEnabled: game.demo_play_enabled === 1,
    active: game.is_active === 1,
    rtp: catalogMetric(game.rtp),
    volatility: catalogMetric(game.volatility),
    gameType: catalogText(game.provider_game_type),
    listedAt: catalogText(game.created_at),
  };
}

export function mapGamesPage(page: PlatformGamesPage): CatalogGamesResponse {
  return {
    games: page.data.flatMap((game) => {
      const mapped = mapGame(game);
      return mapped ? [mapped] : [];
    }),
    pagination: {
      page: page.current_page,
      perPage: page.per_page,
      total: page.total,
      lastPage: page.last_page,
      from: page.from,
      to: page.to,
      hasNextPage: page.next_page_url !== null,
      hasPreviousPage: page.prev_page_url !== null,
    },
  };
}

export interface CatalogUseCases {
  listGames(filters?: CatalogGameFilters): Promise<CatalogGamesResponse>;
  listProviders(): Promise<CatalogProvidersResponse>;
  listCategories(): Promise<CatalogCategoriesResponse>;
  getLobby(type: PlatformGameType, filters?: CatalogGameFilters): Promise<CatalogLobbyResponse>;
}

export function createCatalogUseCases(platform: PlatformClient): CatalogUseCases {
  return {
    async listGames(filters = {}) {
      return mapGamesPage(await platform.getGames(filters));
    },
    async listProviders() {
      const providers = await platform.getProviders();
      return { providers: providers.map(mapProvider) };
    },
    async listCategories() {
      const categories = await platform.getCategories();
      return { categories: categories.map(mapCategory) };
    },
    async getLobby(type, filters = {}) {
      const [games, providers, categories] = await Promise.all([
        platform.getGames({ ...filters, type }),
        platform.getProviders(),
        platform.getCategories(),
      ]);
      const mappedGames = mapGamesPage(games);
      return {
        promotions: [],
        categories: categories.map(mapCategory),
        sections: [{ id: 'games', title: 'Games', games: mappedGames.games }],
        providers: providers.map(mapProvider),
        pagination: mappedGames.pagination,
      };
    },
  };
}

export class GameLaunchError extends Error {
  readonly code: Exclude<GameLaunchErrorCode, 'invalid_game_id'>;
  readonly sessionEnded: boolean;

  constructor(
    code: Exclude<GameLaunchErrorCode, 'invalid_game_id'>,
    options: { sessionEnded?: boolean } = {},
  ) {
    super(`Game launch failed: ${code}`);
    this.name = 'GameLaunchError';
    this.code = code;
    this.sessionEnded = options.sessionEnded ?? false;
  }
}

export function mapGameLaunchFailure(error: unknown): GameLaunchError {
  if (error instanceof PlatformClientError && error.code === 'request_failed') {
    if (error.status === 403) return new GameLaunchError('demo_unavailable');
    if (error.status === 404 || error.status === 405) return new GameLaunchError('game_not_found');
  }
  return new GameLaunchError('launch_unavailable');
}

export function mapRealLaunchFailure(error: unknown): GameLaunchError {
  if (error instanceof PlatformClientError && error.code === 'request_failed') {
    const platformCode = error.platformCode;
    if (error.status === 401) return new GameLaunchError('auth_required');
    if (
      error.status === 404 &&
      (platformCode === 'token_invalid' || platformCode === 'token_missing')
    ) {
      return new GameLaunchError('auth_required');
    }
    if (error.status === 403) return new GameLaunchError('game_unavailable');
    if (error.status === 405 || (error.status === 404 && platformCode === 'game_not_found')) {
      return new GameLaunchError('game_not_found');
    }
  }
  return new GameLaunchError('launch_unavailable');
}

export interface GameLaunchUseCases {
  launchDemo(gameId: string): Promise<GameLaunchResponse>;
  launchReal(gameId: string, accessToken: string): Promise<GameLaunchResponse>;
}

export { AccountError, createAccountUseCases } from './account.js';
export type { AccountUseCases } from './account.js';
export { AuthError, createAuthUseCases, toAuthSession } from './auth.js';
export type { AuthUseCases, LoginCommand, PlayerSession, RefreshIfNeededResult } from './auth.js';
export { createRegistrationUseCases, RegistrationError } from './registration.js';
export {
  createMemoryPaymentIntentStore,
  createPaymentUseCases,
  formatPaymentAmount,
  isTestDepositEnabled,
  parsePaymentAmount,
  PaymentError,
  resolveTestMaxAmount,
  testDepositMethodId,
} from './payments.js';
export type {
  PaymentActor,
  PaymentCustomer,
  PaymentIntentRecord,
  PaymentIntentStore,
  PaymentProvider,
  PaymentUseCases,
  PaymentsRuntimeConfig,
  ProviderPaymentMethod,
} from './payments.js';
export type {
  EmailVerificationGateway,
  RegistrationCreated,
  RegistrationUseCases,
  ResendVerificationResult,
  VerifyTokenResult,
} from './registration.js';
export { createSportsLaunchUseCases, normalizeSportsPath, SportsLaunchError } from './sports.js';
export type { SportsLaunchInput, SportsLaunchUseCases } from './sports.js';

export function createGameLaunchUseCases(platform: PlatformClient): GameLaunchUseCases {
  return {
    async launchDemo(gameId) {
      let launch: PlatformGameLaunch;
      try {
        launch = await platform.launchDemoGame(gameId);
      } catch (error) {
        throw mapGameLaunchFailure(error);
      }
      return { launchUrl: launch.launch_url, mode: 'demo' };
    },
    async launchReal(gameId, accessToken) {
      try {
        const launch = await platform.launchRealGame(gameId, accessToken);
        return { launchUrl: launch.launch_url, mode: 'real' };
      } catch (error) {
        if (isPlayerSessionEnded(error)) {
          throw new GameLaunchError('auth_required', { sessionEnded: true });
        }
        throw mapRealLaunchFailure(error);
      }
    },
  };
}
