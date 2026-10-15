import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCatalogLobby,
  getCategoryFilterValue,
  parseCatalogFilters,
  resolveBffBaseUrl,
  toCatalogQuery,
} from './catalog';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('catalog data access', () => {
  it('sanitizes route filters and ignores ambiguous values', () => {
    expect(
      parseCatalogFilters({
        page: '2',
        search: '  roulette  ',
        category: ['slots', 'tables'],
        provider: 'studio',
        group: ' evolution ',
      }),
    ).toEqual({
      page: 2,
      search: 'roulette',
      category: undefined,
      provider: 'studio',
      groupedProvider: 'evolution',
    });
  });

  it('uses the internal BFF and forces the requested lobby type', async () => {
    vi.stubEnv('BFF_INTERNAL_URL', 'http://bff.internal:4000');
    const fetcher = vi.fn(async () =>
      Response.json({
        promotions: [],
        categories: [],
        sections: [{ id: 'games', title: 'Games', games: [] }],
        providers: [],
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
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    await getCatalogLobby('slots', { type: 'live-casino', search: 'cards' });

    expect(fetcher).toHaveBeenCalledWith(
      'http://bff.internal:4000/catalog/lobby?search=cards&type=slots',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('calls this deploy at /api when Netlify is serving the site', async () => {
    vi.stubEnv('NETLIFY', 'true');
    vi.stubEnv('BFF_INTERNAL_URL', 'http://localhost:4000');
    vi.stubEnv('DEPLOY_PRIME_URL', 'https://deploy-preview--alphabet.netlify.app/');
    const fetcher = vi.fn(async () =>
      Response.json({
        promotions: [],
        categories: [],
        sections: [{ id: 'games', title: 'Games', games: [] }],
        providers: [],
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
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    await getCatalogLobby('slots');

    expect(resolveBffBaseUrl()).toBe('https://deploy-preview--alphabet.netlify.app/api');
    expect(fetcher).toHaveBeenCalledWith(
      'https://deploy-preview--alphabet.netlify.app/api/catalog/lobby?type=slots',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('encodes supported BFF query parameters', () => {
    expect(
      toCatalogQuery({
        page: 3,
        perPage: 40,
        groupedProvider: 'live group',
        type: 'live-casino',
      }),
    ).toBe('page=3&limit=40&grouped_provider=live+group&type=live-casino');
  });

  it('uses category slug rather than nested full slug for Platform filtering', () => {
    expect(
      getCategoryFilterValue({
        id: 'category-1',
        slug: 'tables',
        fullSlug: 'live/tables',
        name: 'Tables',
        parentId: 'live',
      }),
    ).toBe('tables');
  });
});
