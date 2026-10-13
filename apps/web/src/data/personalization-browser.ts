import type {
  CatalogCategory,
  CatalogGame,
  CatalogPagination,
  CatalogProvider,
  PlayerFavoritesResponse,
  PlayerPlayedResponse,
} from '@brand/contracts';
import { hasErrorCode, isAbortError, isRecord, readJson } from './browser-json';

export type PersonalizationErrorCode = 'session_ended' | 'personalization_unavailable';

export class PersonalizationRequestError extends Error {
  readonly code: PersonalizationErrorCode;

  constructor(code: PersonalizationErrorCode) {
    super(code === 'session_ended' ? 'Session ended' : 'Personalization unavailable');
    this.name = 'PersonalizationRequestError';
    this.code = code;
  }
}

export interface PlayedRequest {
  page?: number;
  limit?: number;
}

const unavailable = () => new PersonalizationRequestError('personalization_unavailable');

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', ...init.headers },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw unavailable();
  }
}

function fail(response: Response, body: unknown): never {
  if (response.status === 401 || hasErrorCode(body, 'session_ended')) {
    throw new PersonalizationRequestError('session_ended');
  }
  throw unavailable();
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null || typeof value === 'string') return value;
  return undefined;
}

function parseProvider(value: unknown): CatalogProvider | null | undefined {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.code !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.displayName !== 'string' ||
    (value.groupedCode !== null && typeof value.groupedCode !== 'string')
  ) {
    return undefined;
  }
  return {
    id: value.id,
    code: value.code,
    name: value.name,
    displayName: value.displayName,
    groupedCode: value.groupedCode,
  };
}

function parseCategories(value: unknown): CatalogCategory[] | null {
  if (!Array.isArray(value)) return null;
  const categories: CatalogCategory[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.slug !== 'string' ||
      typeof item.name !== 'string' ||
      (item.parentId !== null && typeof item.parentId !== 'string')
    ) {
      return null;
    }
    const category: CatalogCategory = {
      id: item.id,
      slug: item.slug,
      name: item.name,
      parentId: item.parentId,
    };
    if (item.fullSlug !== undefined) {
      if (typeof item.fullSlug !== 'string') return null;
      category.fullSlug = item.fullSlug;
    }
    if (item.sortOrder !== undefined) {
      if (typeof item.sortOrder !== 'number') return null;
      category.sortOrder = item.sortOrder;
    }
    categories.push(category);
  }
  return categories;
}

function optionalCount(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

export function parseCatalogGame(value: unknown): CatalogGame | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.slug !== 'string' ||
    typeof value.title !== 'string' ||
    (value.kind !== 'casino' && value.kind !== 'live') ||
    (value.imageUrl !== null && typeof value.imageUrl !== 'string') ||
    typeof value.demoPlayEnabled !== 'boolean' ||
    typeof value.active !== 'boolean'
  ) {
    return null;
  }
  const provider = parseProvider(value.provider);
  const categories = parseCategories(value.categories);
  const rtp = nullableString(value.rtp);
  const volatility = nullableString(value.volatility);
  const gameType = nullableString(value.gameType);
  const listedAt = nullableString(value.listedAt);
  if (provider === undefined || !categories || rtp === undefined || volatility === undefined || gameType === undefined || listedAt === undefined) {
    return null;
  }
  const game: CatalogGame = {
    id: value.id,
    slug: value.slug,
    title: value.title,
    kind: value.kind,
    imageUrl: value.imageUrl,
    provider,
    categories,
    demoPlayEnabled: value.demoPlayEnabled,
    active: value.active,
    rtp,
    volatility,
    gameType,
    listedAt,
  };
  const played = optionalCount(value.played);
  const rounds = optionalCount(value.rounds);
  if (Number.isNaN(played) || Number.isNaN(rounds)) return null;
  if (played !== undefined) game.played = played;
  if (rounds !== undefined) game.rounds = rounds;
  if (value.lastPlayed !== undefined) {
    const lastPlayed = nullableString(value.lastPlayed);
    if (lastPlayed === undefined) return null;
    game.lastPlayed = lastPlayed;
  }
  return game;
}

function parsePagination(value: unknown): CatalogPagination | null {
  if (
    !isRecord(value) ||
    typeof value.page !== 'number' ||
    typeof value.perPage !== 'number' ||
    typeof value.total !== 'number' ||
    typeof value.lastPage !== 'number' ||
    (value.from !== null && typeof value.from !== 'number') ||
    (value.to !== null && typeof value.to !== 'number') ||
    typeof value.hasNextPage !== 'boolean' ||
    typeof value.hasPreviousPage !== 'boolean'
  ) {
    return null;
  }
  return {
    page: value.page,
    perPage: value.perPage,
    total: value.total,
    lastPage: value.lastPage,
    from: value.from,
    to: value.to,
    hasNextPage: value.hasNextPage,
    hasPreviousPage: value.hasPreviousPage,
  };
}

function parseGames(value: unknown): CatalogGame[] | null {
  if (!isRecord(value) || !Array.isArray(value.games)) return null;
  const games: CatalogGame[] = [];
  for (const item of value.games) {
    const game = parseCatalogGame(item);
    if (!game) return null;
    games.push(game);
  }
  return games;
}

export function parseFavorites(value: unknown): PlayerFavoritesResponse | null {
  const games = parseGames(value);
  return games ? { games } : null;
}

export function parsePlayedPage(value: unknown): PlayerPlayedResponse | null {
  const games = parseGames(value);
  if (!games || !isRecord(value)) return null;
  const pagination = parsePagination(value.pagination);
  return pagination ? { games, pagination } : null;
}

export async function fetchFavorites(signal?: AbortSignal): Promise<PlayerFavoritesResponse> {
  const response = await send('/api/player/favorites', { method: 'GET', signal });
  const body = await readJson(response);
  const favorites = response.status === 200 ? parseFavorites(body) : null;
  if (!favorites) fail(response, body);
  return favorites;
}

export async function fetchLastPlayed(params: PlayedRequest, signal?: AbortSignal): Promise<PlayerPlayedResponse> {
  return fetchPlayed('/api/player/last-played', params, signal);
}

export async function fetchMostPlayed(params: PlayedRequest, signal?: AbortSignal): Promise<PlayerPlayedResponse> {
  return fetchPlayed('/api/player/most-played', params, signal);
}

async function fetchPlayed(path: string, params: PlayedRequest, signal?: AbortSignal): Promise<PlayerPlayedResponse> {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  const suffix = query.size > 0 ? `?${query}` : '';
  const response = await send(`${path}${suffix}`, { method: 'GET', signal });
  const body = await readJson(response);
  const page = response.status === 200 ? parsePlayedPage(body) : null;
  if (!page) fail(response, body);
  return page;
}

export async function addFavorite(gameId: string): Promise<void> {
  const response = await send('/api/player/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gameId }),
  });
  const body = await readJson(response);
  if (response.status === 200 && isRecord(body) && body.gameId === gameId) return;
  fail(response, body);
}

export async function removeFavorite(gameId: string): Promise<void> {
  const response = await send(`/api/player/favorites/${encodeURIComponent(gameId)}`, { method: 'DELETE' });
  const body = await readJson(response);
  if (response.status === 200 && isRecord(body) && body.gameId === gameId) return;
  fail(response, body);
}
