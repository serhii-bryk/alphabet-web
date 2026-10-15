import type { CatalogGame } from '@brand/contracts';
import { searchCatalogInBrowser } from '@/data/catalog-browser';
import { GLOBAL_SEARCH_GAME_LIMIT, GLOBAL_SEARCH_MIN_LENGTH, searchQueryLength } from '@/components/search-index';

export const GLOBAL_SEARCH_DEBOUNCE_MS = 280;
export const GLOBAL_SEARCH_CACHE_MS = 20_000;

export interface GameSearchCache {
  read(key: string, now: number): CatalogGame[] | undefined;
  write(key: string, games: CatalogGame[], now: number): void;
}

export function createGameSearchCache(ttlMs = GLOBAL_SEARCH_CACHE_MS, maxEntries = 24): GameSearchCache {
  const entries = new Map<string, { at: number; games: CatalogGame[] }>();
  return {
    read(key, now) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now - hit.at > ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return hit.games;
    },
    write(key, games, now) {
      if (entries.has(key)) entries.delete(key);
      entries.set(key, { at: now, games });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}

export const sharedGameSearchCache = createGameSearchCache();

export function gameSearchKey(query: string): string {
  return query.trim().slice(0, 200).toLocaleLowerCase();
}

export function createLatestGate() {
  let current = 0;
  return {
    issue() {
      current += 1;
      return current;
    },
    isCurrent(id: number) {
      return id === current;
    },
  };
}

export function createDebouncedSearch(wait = GLOBAL_SEARCH_DEBOUNCE_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  return {
    push(query: string, run: (query: string, signal: AbortSignal) => void) {
      if (timer !== undefined) clearTimeout(timer);
      controller?.abort();
      const next = new AbortController();
      controller = next;
      timer = setTimeout(() => {
        timer = undefined;
        if (!next.signal.aborted) run(query, next.signal);
      }, wait);
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      controller?.abort();
    },
  };
}

export type GameSearchStatus = 'skipped' | 'cached' | 'ready' | 'stale' | 'aborted' | 'error';

export async function loadGameSearch(options: {
  query: string;
  signal: AbortSignal;
  requestId: number;
  isCurrent: (id: number) => boolean;
  now?: number;
  cache?: GameSearchCache;
  fetchGames?: (query: string, signal: AbortSignal) => Promise<{ games: CatalogGame[] }>;
}): Promise<{ status: GameSearchStatus; games: CatalogGame[] }> {
  const trimmed = options.query.trim().slice(0, 200);
  if (searchQueryLength(trimmed) < GLOBAL_SEARCH_MIN_LENGTH) return { status: 'skipped', games: [] };
  const cache = options.cache ?? sharedGameSearchCache;
  const now = options.now ?? Date.now();
  const key = gameSearchKey(trimmed);
  const cached = cache.read(key, now);
  if (cached) return { status: 'cached', games: cached };
  const fetchGames =
    options.fetchGames ??
    ((query: string, signal: AbortSignal) =>
      searchCatalogInBrowser(query, signal, GLOBAL_SEARCH_GAME_LIMIT).then((result) => ({ games: result.games })));
  try {
    const result = await fetchGames(trimmed, options.signal);
    if (options.signal.aborted) return { status: 'aborted', games: [] };
    if (!options.isCurrent(options.requestId)) return { status: 'stale', games: [] };
    cache.write(key, result.games, now);
    return { status: 'ready', games: result.games };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { status: 'aborted', games: [] };
    if (!options.isCurrent(options.requestId)) return { status: 'stale', games: [] };
    return { status: 'error', games: [] };
  }
}
