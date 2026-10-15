import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogGame } from '@brand/contracts';
import {
  createDebouncedSearch,
  createGameSearchCache,
  createLatestGate,
  GLOBAL_SEARCH_CACHE_MS,
  GLOBAL_SEARCH_DEBOUNCE_MS,
  loadGameSearch,
} from './game-search';

const game = (id: string): CatalogGame => ({
  id,
  slug: id,
  title: id,
  kind: 'casino',
  imageUrl: null,
  provider: null,
  categories: [],
  demoPlayEnabled: true,
  active: true,
  rtp: null,
  volatility: null,
  gameType: null,
  listedAt: null,
});

describe('debounced search', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits 280ms and keeps only the latest query', () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const debounced = createDebouncedSearch(GLOBAL_SEARCH_DEBOUNCE_MS);
    debounced.push('ab', (query) => calls.push(query));
    debounced.push('abc', (query) => calls.push(query));
    vi.advanceTimersByTime(279);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['abc']);
    expect(GLOBAL_SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(250);
    expect(GLOBAL_SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(300);
  });

  it('aborts the request that was already sent', () => {
    vi.useFakeTimers();
    let aborted = false;
    const debounced = createDebouncedSearch(0);
    debounced.push('ab', (_query, signal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
    });
    vi.advanceTimersByTime(0);
    debounced.push('abcd', () => undefined);
    expect(aborted).toBe(true);
  });
});

describe('loadGameSearch', () => {
  it('skips short queries and ignores a stale response', async () => {
    const cache = createGameSearchCache();
    const gate = createLatestGate();
    const fetchGames = vi.fn();
    const skipped = await loadGameSearch({
      query: 'ا',
      signal: new AbortController().signal,
      requestId: gate.issue(),
      isCurrent: gate.isCurrent,
      cache,
      fetchGames,
    });
    expect(skipped.status).toBe('skipped');
    expect(fetchGames).not.toHaveBeenCalled();

    let resolveOld: (value: { games: CatalogGame[] }) => void = () => undefined;
    fetchGames.mockImplementation((query: string) => {
      if (query === 'old') return new Promise((resolve) => {
        resolveOld = resolve;
      });
      return Promise.resolve({ games: [game('new')] });
    });
    const first = gate.issue();
    const old = loadGameSearch({
      query: 'old',
      signal: new AbortController().signal,
      requestId: first,
      isCurrent: gate.isCurrent,
      cache,
      fetchGames,
    });
    const second = gate.issue();
    const newer = await loadGameSearch({
      query: 'newer',
      signal: new AbortController().signal,
      requestId: second,
      isCurrent: gate.isCurrent,
      cache,
      fetchGames,
    });
    resolveOld({ games: [game('old')] });
    expect((await old).status).toBe('stale');
    expect(newer).toEqual({ status: 'ready', games: [game('new')] });
  });

  it('reuses a short-lived result and treats abort as a non-error', async () => {
    const cache = createGameSearchCache();
    const gate = createLatestGate();
    const fetchGames = vi.fn(async () => ({ games: [game('mega')] }));
    const requestId = gate.issue();
    const first = await loadGameSearch({
      query: 'Mega',
      signal: new AbortController().signal,
      requestId,
      isCurrent: gate.isCurrent,
      now: 1_000,
      cache,
      fetchGames,
    });
    const second = await loadGameSearch({
      query: 'mega',
      signal: new AbortController().signal,
      requestId,
      isCurrent: gate.isCurrent,
      now: 2_000,
      cache,
      fetchGames,
    });
    expect(first.status).toBe('ready');
    expect(second.status).toBe('cached');
    expect(fetchGames).toHaveBeenCalledTimes(1);

    const expired = await loadGameSearch({
      query: 'mega',
      signal: new AbortController().signal,
      requestId,
      isCurrent: gate.isCurrent,
      now: 1_000 + GLOBAL_SEARCH_CACHE_MS + 1,
      cache,
      fetchGames,
    });
    expect(expired.status).toBe('ready');
    expect(fetchGames).toHaveBeenCalledTimes(2);

    const controller = new AbortController();
    const pending = loadGameSearch({
      query: 'other',
      signal: controller.signal,
      requestId: gate.issue(),
      isCurrent: gate.isCurrent,
      cache: createGameSearchCache(),
      fetchGames: (_query, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    });
    controller.abort();
    expect(await pending).toEqual({ status: 'aborted', games: [] });
  });
});
