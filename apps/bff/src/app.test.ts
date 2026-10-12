import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const provider = {
  id: 7,
  code: 'studio',
  name: 'Studio',
  display_name: 'Studio Games',
  grouped_code: 'studio-group',
};

const category = {
  id: 4,
  slug: 'tables',
  name: 'Table Games',
  parent_id: null,
  sort_order: 10,
};

const game = {
  id: 42,
  provider_id: 7,
  provider_name: 'Studio',
  provider_category_id: 4,
  provider_game_id: 'studio-42',
  name: 'Live Table',
  slug: 'live-table',
  type: 'live-casino',
  provider_game_type: 'table',
  icon: 'https://cdn.example/live-table.png',
  rtp: 97,
  volatility: 'medium',
  is_active: 1,
  demo_play_enabled: 0,
  created_at: null,
  updated_at: null,
  provider,
  categories: [{ ...category, full_slug: 'live/tables' }],
};

const gamesPage = {
  current_page: 1,
  data: [game],
  first_page_url: 'https://platform.example/api/v1/games?page=1',
  from: 1,
  last_page: 1,
  last_page_url: 'https://platform.example/api/v1/games?page=1',
  links: [],
  next_page_url: null,
  path: 'https://platform.example/api/v1/games',
  per_page: 20,
  prev_page_url: null,
  to: 1,
  total: 1,
};

function makeApp() {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const pathname = new URL(String(input)).pathname;
    if (pathname.endsWith('/games/providers')) return Response.json([provider]);
    if (pathname.endsWith('/games/categories')) return Response.json([category]);
    return Response.json(gamesPage);
  });
  const app = createApp({
    env: {
      WEB_ORIGIN: 'http://localhost:3000',
      FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
      FINAL_PLATFORM_API_KEY: 'key',
      FINAL_PLATFORM_API_SECRET: 'secret',
    },
    fetch: fetcher,
    now: () => 1_700_000_000_000,
  });
  return { app, fetcher };
}

describe('catalog routes', () => {
  it('serves mapped games at the path reached by the Next rewrite', async () => {
    const { app, fetcher } = makeApp();
    const response = await app.request(
      '/catalog/games?page=1&limit=20&type=live-casino&grouped_provider=studio-group',
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      games: [
        {
          id: '42',
          slug: 'live-table',
          title: 'Live Table',
          kind: 'live',
          imageUrl: 'https://cdn.example/live-table.png',
          provider: {
            id: '7',
            code: 'studio',
            name: 'Studio',
            displayName: 'Studio Games',
            groupedCode: 'studio-group',
          },
          categories: [
            {
              id: '4',
              slug: 'tables',
              fullSlug: 'live/tables',
              name: 'Table Games',
              parentId: null,
            },
          ],
          demoPlayEnabled: false,
          active: true,
          rtp: '97',
          volatility: 'medium',
          gameType: 'table',
          listedAt: null,
        },
      ],
      pagination: {
        page: 1,
        perPage: 20,
        total: 1,
        lastPage: 1,
        from: 1,
        to: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      '/games?page=1&per_page=20&grouped_provider=studio-group&type=live-casino',
    );
  });

  it('forwards pagination, search, type, category, and provider filters', async () => {
    const { app, fetcher } = makeApp();
    const response = await app.request(
      '/catalog/games?page=3&per_page=50&search=live+table&category=tables&provider=studio&type=live-casino',
    );

    expect(response.status).toBe(200);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://platform.example/api/v1/games?page=3&per_page=50&search=live+table&category=tables&provider=studio&type=live-casino',
    );
  });

  it('maps provider and category resources without exposing wire names', async () => {
    const { app } = makeApp();
    const [providersResponse, categoriesResponse] = await Promise.all([
      app.request('/catalog/providers'),
      app.request('/api/catalog/categories'),
    ]);
    const providersText = await providersResponse.text();
    const categoriesText = await categoriesResponse.text();

    expect(providersResponse.status).toBe(200);
    expect(JSON.parse(providersText)).toEqual({
      providers: [
        {
          id: '7',
          code: 'studio',
          name: 'Studio',
          displayName: 'Studio Games',
          groupedCode: 'studio-group',
        },
      ],
    });
    expect(categoriesResponse.status).toBe(200);
    expect(JSON.parse(categoriesText)).toEqual({
      categories: [
        {
          id: '4',
          slug: 'tables',
          name: 'Table Games',
          parentId: null,
          sortOrder: 10,
        },
      ],
    });
    expect(`${providersText}${categoriesText}`).not.toMatch(
      /display_name|grouped_code|parent_id|sort_order/,
    );
  });

  it('builds one truthful lobby section and no promotions', async () => {
    const { app } = makeApp();
    const response = await app.request('/api/catalog/lobby?type=live-casino');
    const body = (await response.json()) as {
      promotions: unknown[];
      sections: Array<{ id: string; games: unknown[] }>;
    };

    expect(response.status).toBe(200);
    expect(body.promotions).toEqual([]);
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0]).toEqual(expect.objectContaining({ id: 'games' }));
  });

  it('returns a stable query error without calling Platform', async () => {
    const { app, fetcher } = makeApp();
    const response = await app.request('/catalog/lobby?type=unknown');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'invalid_query', message: 'A valid lobby type is required' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    '/catalog/games?page=0',
    '/catalog/games?page=1.5',
    '/catalog/games?limit=101',
    '/catalog/games?limit=20&per_page=20',
    '/catalog/games?search=',
    `/catalog/games?provider=${'x'.repeat(201)}`,
    '/catalog/games?type=roulette',
  ])('rejects invalid games query %s without calling Platform', async (url) => {
    const { app, fetcher } = makeApp();
    const response = await app.request(url);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'invalid_query', message: 'Invalid catalog query' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns a valid empty games page', async () => {
    const emptyPage = {
      ...gamesPage,
      data: [],
      from: null,
      to: null,
      total: 0,
      last_page: 0,
    };
    const emptyApp = createApp({
      env: {
        FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
        FINAL_PLATFORM_API_KEY: 'key',
        FINAL_PLATFORM_API_SECRET: 'secret',
      },
      fetch: async () => Response.json(emptyPage),
    });

    const response = await emptyApp.request('/catalog/games');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      games: [],
      pagination: {
        page: 1,
        perPage: 20,
        total: 0,
        lastPage: 0,
        from: null,
        to: null,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it.each([
    ['network', async () => Promise.reject(new Error('private network details'))],
    [
      'timeout',
      async () => Promise.reject(new DOMException('private timeout details', 'TimeoutError')),
    ],
    ['invalid JSON', async () => new Response('not-json')],
    ['invalid response', async () => Response.json({ data: [] })],
  ])('returns the same safe error for %s failure', async (_failure, fetcher) => {
    const app = createApp({
      env: {
        FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
        FINAL_PLATFORM_API_KEY: 'private-key',
        FINAL_PLATFORM_API_SECRET: 'private-secret',
      },
      fetch: fetcher,
    });

    const response = await app.request('/catalog/games');
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(JSON.parse(text)).toEqual({
      error: { code: 'catalog_unavailable', message: 'Catalog is unavailable' },
    });
    expect(text).not.toMatch(/private|not-json|Platform|TimeoutError/);
  });

  it('redacts Platform failures', async () => {
    const app = createApp({
      env: {
        FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
        FINAL_PLATFORM_API_KEY: 'private-key',
        FINAL_PLATFORM_API_SECRET: 'private-secret',
      },
      fetch: async () => new Response('upstream details', { status: 500 }),
    });
    const response = await app.request('/catalog/games');
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).toContain('catalog_unavailable');
    expect(text).not.toContain('private-key');
    expect(text).not.toContain('private-secret');
    expect(text).not.toContain('upstream details');
  });
});
