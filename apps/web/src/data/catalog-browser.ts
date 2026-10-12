import type { CatalogGamesResponse } from '@brand/contracts';

export async function searchCatalogInBrowser(
  search: string,
  signal?: AbortSignal,
): Promise<CatalogGamesResponse> {
  try {
    const query = new URLSearchParams({ limit: '40' });
    const normalizedSearch = search.trim();
    if (normalizedSearch) query.set('search', normalizedSearch);
    const response = await fetch(`/api/catalog/games?${query}`, {
      headers: { accept: 'application/json' },
      signal,
    });
    if (!response.ok) throw new Error('Catalog unavailable');
    return (await response.json()) as CatalogGamesResponse;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Catalog unavailable');
  }
}
