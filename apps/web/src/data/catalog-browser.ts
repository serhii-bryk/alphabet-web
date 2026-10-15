import type { CatalogCategoriesResponse, CatalogGamesResponse, CatalogProvidersResponse } from '@brand/contracts';

const META_TTL_MS = 60_000;

export interface SearchCatalogMeta {
  providers: CatalogProvidersResponse['providers'];
  categories: CatalogCategoriesResponse['categories'];
}

let metaPromise: Promise<SearchCatalogMeta> | null = null;
let metaAt = 0;

export async function searchCatalogInBrowser(
  search: string,
  signal?: AbortSignal,
  limit = 8,
): Promise<CatalogGamesResponse> {
  try {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 20);
    const query = new URLSearchParams({ limit: String(bounded) });
    const normalizedSearch = search.trim().slice(0, 200);
    if (normalizedSearch) query.set('search', normalizedSearch);
    const response = await fetch(`/api/catalog/games?${query}`, {
      headers: { accept: 'application/json' },
      signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Catalog unavailable');
    return (await response.json()) as CatalogGamesResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Catalog unavailable');
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error('Catalog unavailable');
  return (await response.json()) as T;
}

export function loadSearchCatalogMeta(): Promise<SearchCatalogMeta> {
  if (metaPromise && Date.now() - metaAt < META_TTL_MS) return metaPromise;
  metaAt = Date.now();
  metaPromise = Promise.all([
    fetch('/api/catalog/providers', { headers: { accept: 'application/json' }, cache: 'no-store' }).then((response) =>
      readJson<CatalogProvidersResponse>(response),
    ),
    fetch('/api/catalog/categories', { headers: { accept: 'application/json' }, cache: 'no-store' }).then((response) =>
      readJson<CatalogCategoriesResponse>(response),
    ),
  ])
    .then(([providers, categories]) => ({
      providers: providers.providers,
      categories: categories.categories,
    }))
    .catch((error: unknown) => {
      metaPromise = null;
      throw error;
    });
  return metaPromise;
}
