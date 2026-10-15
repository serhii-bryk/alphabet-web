import { describe, expect, it, vi } from 'vitest';
import type { CatalogUseCases } from '@brand/domain';
import { createApp } from './app.js';
import { SEARCH_RATE_LIMIT } from './catalog-guard.js';

const game = {
  id: '42',
  slug: 'live-table',
  title: 'Live Table',
  kind: 'live' as const,
  imageUrl: 'https://cdn.example/live-table.png',
  provider: {
    id: '7',
    code: 'studio',
    name: 'Studio',
    displayName: 'Studio Games',
    groupedCode: 'studio-group',
  },
  categories: [{ id: '4', slug: 'tables', name: 'Table Games', parentId: null }],
  demoPlayEnabled: false,
  active: true,
  rtp: '97',
  volatility: 'medium',
  gameType: 'table',
  listedAt: null,
};

const gamesPage = {
  games: [game],
  pagination: {
    page: 1,
    perPage: 8,
    total: 1,
    lastPage: 1,
    from: 1,
    to: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

const env = {
  FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
  FINAL_PLATFORM_API_KEY: 'key',
  FINAL_PLATFORM_API_SECRET: 'secret',
};

function makeApp() {
  const listGames = vi.fn(async () => gamesPage);
  const catalog = {
    listGames,
    listProviders: async () => ({ providers: [] }),
    listCategories: async () => ({ categories: [] }),
    getLobby: async () => {
      throw new Error('unused');
    },
  } satisfies CatalogUseCases;
  const app = createApp({ catalog, env, now: () => 1_000 });
  return { app, listGames };
}

describe('catalog search protection', () => {
  it('serves a repeated public search from the short-lived cache', async () => {
    const { app, listGames } = makeApp();
    const first = await app.request('/catalog/games?search=mega&limit=8');
    const second = await app.request('/catalog/games?search=mega&limit=8');
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(listGames).toHaveBeenCalledTimes(1);
    expect(first.headers.get('cache-control')).toBe('no-store');
  });

  it('joins identical in-flight searches into one Platform read', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const listGames = vi.fn(async () => {
      await gate;
      return gamesPage;
    });
    const app = createApp({
      catalog: {
        listGames,
        listProviders: async () => ({ providers: [] }),
        listCategories: async () => ({ categories: [] }),
        getLobby: async () => {
          throw new Error('unused');
        },
      },
      env,
      now: () => 1_000,
    });
    const pending = Promise.all([
      app.request('/catalog/games?search=mega&limit=8'),
      app.request('/catalog/games?search=mega&limit=8'),
    ]);
    await vi.waitFor(() => expect(listGames).toHaveBeenCalledTimes(1));
    release();
    const [first, second] = await pending;
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(listGames).toHaveBeenCalledTimes(1);
  });

  it('rate limits search and still allows an ordinary catalog read', async () => {
    const { app, listGames } = makeApp();
    for (let index = 0; index < SEARCH_RATE_LIMIT; index += 1) {
      const response = await app.request(`/catalog/games?search=q${index}&limit=8`);
      expect(response.status).toBe(200);
    }
    const blocked = await app.request('/catalog/games?search=overflow&limit=8');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: { code: 'rate_limited', message: 'Too many search requests. Please wait a moment.' },
    });
    expect(listGames).toHaveBeenCalledTimes(SEARCH_RATE_LIMIT);

    const browse = await app.request('/catalog/games?limit=8');
    expect(browse.status).toBe(200);
    expect(listGames).toHaveBeenCalledTimes(SEARCH_RATE_LIMIT + 1);
  });
});
