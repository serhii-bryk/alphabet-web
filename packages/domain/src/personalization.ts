import type { CatalogGame, PlayerFavoritesResponse, PlayerPlayedResponse } from '@brand/contracts';
import type {
  PlatformClient,
  PlatformGame,
  PlatformMostPlayedFilters,
  PlatformPlayedFilters,
} from '@brand/platform';
import { isPlayerSessionEnded, playerIdNumber, type PlayerSession } from './auth.js';
import { mapGamesInOrder, mapPagination, type PlayedPageSource } from './game-map.js';

export class PersonalizationError extends Error {
  readonly code: 'session_ended' | 'personalization_unavailable' | 'invalid_game_id';

  constructor(code: 'session_ended' | 'personalization_unavailable' | 'invalid_game_id') {
    super(
      code === 'session_ended'
        ? 'Session ended'
        : code === 'invalid_game_id'
          ? 'Invalid game id'
          : 'Personalization unavailable',
    );
    this.name = 'PersonalizationError';
    this.code = code;
  }
}

export interface PlayedListQuery {
  page?: number;
  limit?: number;
  order?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
  played?: number;
  rounds?: number;
}

export interface PersonalizationUseCases {
  listFavorites(session: PlayerSession): Promise<PlayerFavoritesResponse>;
  addFavorite(session: PlayerSession, gameId: number): Promise<{ gameId: string }>;
  removeFavorite(session: PlayerSession, gameId: number): Promise<{ gameId: string }>;
  lastPlayed(session: PlayerSession, query: PlayedListQuery): Promise<PlayerPlayedResponse>;
  mostPlayed(session: PlayerSession, query: PlayedListQuery): Promise<PlayerPlayedResponse>;
}

export function mapFavoriteGames(items: readonly PlatformGame[]): CatalogGame[] {
  return mapGamesInOrder(items);
}

export function mapPlayedPage(page: PlayedPageSource): PlayerPlayedResponse {
  return {
    games: mapGamesInOrder(page.data),
    pagination: mapPagination(page),
  };
}

export function createPersonalizationUseCases(platform: PlatformClient): PersonalizationUseCases {
  return {
    async listFavorites(session) {
      const favorites = await readPlayer(session, (playerId, accessToken) =>
        platform.listFavorites(playerId, accessToken),
      );
      return { games: mapFavoriteGames(favorites.items) };
    },

    async addFavorite(session, gameId) {
      const id = requireGameId(gameId);
      const added = await readPlayer(session, (playerId, accessToken) =>
        platform.addFavorite(playerId, accessToken, id),
      );
      if (added.game_id !== id) throw new PersonalizationError('personalization_unavailable');
      return { gameId: String(added.game_id) };
    },

    async removeFavorite(session, gameId) {
      const id = requireGameId(gameId);
      const removed = await readPlayer(session, (playerId, accessToken) =>
        platform.removeFavorite(playerId, accessToken, id),
      );
      if (removed.removed_game_id !== id) throw new PersonalizationError('personalization_unavailable');
      return { gameId: String(removed.removed_game_id) };
    },

    async lastPlayed(session, query) {
      const page = await readPlayer(session, (playerId, accessToken) =>
        platform.lastPlayed(playerId, accessToken, playedFilters(query)),
      );
      return mapPlayedPage(page);
    },

    async mostPlayed(session, query) {
      const page = await readPlayer(session, (playerId, accessToken) =>
        platform.mostPlayed(playerId, accessToken, mostPlayedFilters(query)),
      );
      return mapPlayedPage(page);
    },
  };
}

function playedFilters(query: PlayedListQuery): PlatformPlayedFilters {
  return {
    order: query.order ?? 'desc',
    ...(query.page !== undefined ? { page: query.page } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
    ...(query.startDate !== undefined ? { startDate: query.startDate } : {}),
    ...(query.endDate !== undefined ? { endDate: query.endDate } : {}),
  };
}

function mostPlayedFilters(query: PlayedListQuery): PlatformMostPlayedFilters {
  return {
    ...playedFilters(query),
    ...(query.played !== undefined ? { played: query.played } : {}),
    ...(query.rounds !== undefined ? { rounds: query.rounds } : {}),
  };
}

function requireGameId(gameId: number): number {
  if (!Number.isSafeInteger(gameId) || gameId <= 0) {
    throw new PersonalizationError('invalid_game_id');
  }
  return gameId;
}

async function readPlayer<T>(
  session: PlayerSession,
  read: (playerId: number, accessToken: string) => Promise<T>,
): Promise<T> {
  const playerId = playerIdNumber(session.playerId);
  if (playerId === undefined) throw new PersonalizationError('session_ended');
  try {
    return await read(playerId, session.accessToken);
  } catch (error) {
    if (error instanceof PersonalizationError) throw error;
    if (isPlayerSessionEnded(error)) throw new PersonalizationError('session_ended');
    throw new PersonalizationError('personalization_unavailable');
  }
}
