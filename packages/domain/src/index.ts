import type {
  CatalogCategoriesResponse,
  CatalogGameFilters,
  CatalogGamesResponse,
  CatalogLobbyResponse,
  CatalogProvidersResponse,
  GameLaunchErrorCode,
  GameLaunchResponse,
  PlatformGameType,
} from '@brand/contracts';
import { PlatformClientError } from '@brand/platform';
import type { PlatformClient, PlatformGameLaunch } from '@brand/platform';
import { isPlayerSessionEnded } from './auth.js';
import { createCatalogScanCache, loadCatalogGames } from './catalog-filter.js';
import { mapCategory, mapGamesPage, mapProvider } from './game-map.js';

export { isPlayerSessionEnded };
export { mapCategory, mapGame, mapGamesPage, mapProvider } from './game-map.js';

export interface CatalogUseCases {
  listGames(filters?: CatalogGameFilters): Promise<CatalogGamesResponse>;
  listProviders(): Promise<CatalogProvidersResponse>;
  listCategories(): Promise<CatalogCategoriesResponse>;
  getLobby(type: PlatformGameType, filters?: CatalogGameFilters): Promise<CatalogLobbyResponse>;
}

export function createCatalogUseCases(platform: PlatformClient): CatalogUseCases {
  const cache = createCatalogScanCache();
  const gamesFor = (filters: CatalogGameFilters = {}) =>
    loadCatalogGames(platform, filters, cache).then(mapGamesPage);

  return {
    listGames(filters = {}) {
      return gamesFor(filters);
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
        gamesFor({ ...filters, type }),
        platform.getProviders(),
        platform.getCategories(),
      ]);
      return {
        promotions: [],
        categories: categories.map(mapCategory),
        sections: [{ id: 'games', title: 'Games', games: games.games }],
        providers: providers.map(mapProvider),
        pagination: games.pagination,
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
export {
  createPersonalizationUseCases,
  mapFavoriteGames,
  mapPlayedPage,
  PersonalizationError,
} from './personalization.js';
export type { PersonalizationUseCases, PlayedListQuery } from './personalization.js';

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
