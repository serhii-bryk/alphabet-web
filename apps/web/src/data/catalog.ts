import type {
  CatalogCategory,
  CatalogGameFilters,
  CatalogGamesResponse,
  CatalogLobbyResponse,
  PlatformGameType,
} from '@brand/contracts';

const DEFAULT_BFF_URL = 'http://localhost:4000';
const MAX_FILTER_LENGTH = 200;

export type CatalogSearchParams = Record<string, string | string[] | undefined>;

export class CatalogUnavailableError extends Error {
  constructor() {
    super('Catalog is unavailable');
    this.name = 'CatalogUnavailableError';
  }
}

export function getCategoryFilterValue(category: CatalogCategory): string {
  return category.slug;
}

function scalar(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_FILTER_LENGTH ? trimmed : undefined;
}

export function parseCatalogFilters(searchParams: CatalogSearchParams): CatalogGameFilters {
  const pageValue = scalar(searchParams.page);
  const page = pageValue && /^\d+$/.test(pageValue) ? Number(pageValue) : undefined;

  return {
    page: page && Number.isSafeInteger(page) && page > 0 ? page : undefined,
    search: scalar(searchParams.search),
    category: scalar(searchParams.category),
    provider: scalar(searchParams.provider),
    groupedProvider: scalar(searchParams.group),
  };
}

export function toCatalogQuery(filters: CatalogGameFilters): string {
  const query = new URLSearchParams();
  if (filters.page) query.set('page', String(filters.page));
  if (filters.perPage) query.set('limit', String(filters.perPage));
  if (filters.search) query.set('search', filters.search);
  if (filters.category) query.set('category', filters.category);
  if (filters.provider) query.set('provider', filters.provider);
  if (filters.groupedProvider) query.set('grouped_provider', filters.groupedProvider);
  if (filters.type) query.set('type', filters.type);
  return query.toString();
}

export function resolveBffBaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.NETLIFY === 'true') {
    const site = siteOrigin(env.DEPLOY_PRIME_URL) ?? siteOrigin(env.URL);
    if (site) return `${site}/api`;
  }
  const configured = env.BFF_INTERNAL_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  return DEFAULT_BFF_URL;
}

function siteOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

async function requestCatalog<T>(path: string, filters: CatalogGameFilters): Promise<T> {
  const baseUrl = resolveBffBaseUrl();
  const query = toCatalogQuery(filters);

  try {
    const response = await fetch(`${baseUrl}${path}${query ? `?${query}` : ''}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new CatalogUnavailableError();
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof CatalogUnavailableError) throw error;
    throw new CatalogUnavailableError();
  }
}

export function getCatalogLobby(
  type: PlatformGameType,
  filters: CatalogGameFilters = {},
): Promise<CatalogLobbyResponse> {
  return requestCatalog<CatalogLobbyResponse>('/catalog/lobby', { ...filters, type });
}

export function searchCatalogGames(
  filters: CatalogGameFilters = {},
): Promise<CatalogGamesResponse> {
  return requestCatalog<CatalogGamesResponse>('/catalog/games', filters);
}
