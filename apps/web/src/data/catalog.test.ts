import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CatalogUnavailableError,
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

  it('uses the function runtime URL when Netlify build variables are absent', async () => {
    vi.stubEnv('NETLIFY', '');
    vi.stubEnv('DEPLOY_PRIME_URL', '');
    vi.stubEnv('BFF_INTERNAL_URL', 'http://localhost:4000');
    vi.stubEnv('URL', 'https://alphabet.netlify.app/');
    vi.stubEnv('SITE_ID', '1d01c0c0-4554-4747-93b8-34ce3448ab95');
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

    expect(resolveBffBaseUrl()).toBe('https://alphabet.netlify.app/api');
    expect(fetcher).toHaveBeenCalledWith(
      'https://alphabet.netlify.app/api/catalog/lobby?type=slots',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('logs a failed lobby fetch without secrets or the response body', async () => {
    vi.stubEnv('NETLIFY', '');
    vi.stubEnv('DEPLOY_PRIME_URL', '');
    vi.stubEnv('URL', 'https://alphabet.netlify.app');
    vi.stubEnv('SITE_ID', 'site-secret-should-not-log');
    vi.stubEnv('BFF_INTERNAL_URL', 'http://localhost:4000');
    const failure = new TypeError('fetch failed');
    failure.cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4000 bearer super-secret-token'), {
      code: 'ECONNREFUSED',
    });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw failure;
    }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(getCatalogLobby('slots')).rejects.toBeInstanceOf(CatalogUnavailableError);

      const line = spy.mock.calls.map((call) => String(call[0])).find((entry) => entry.includes('[catalog-ssr]'));
      expect(line).toContain('https://alphabet.netlify.app/api/catalog/lobby?type=slots');
      expect(line).toContain('"cache":"no-store"');
      expect(line).toContain('"status":null');
      expect(line).toContain('ECONNREFUSED');
      expect(line).toContain('SITE_ID');
      expect(line).not.toContain('site-secret-should-not-log');
      expect(line).not.toContain('super-secret-token');
    } finally {
      spy.mockRestore();
    }
  });

  it('logs a lobby HTTP status and error code without the response body', async () => {
    vi.stubEnv('NETLIFY', 'true');
    vi.stubEnv('URL', 'https://alphabet.netlify.app');
    vi.stubEnv('DEPLOY_PRIME_URL', '');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: 'catalog_unavailable', message: 'secret-body' } }), {
          status: 502,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(getCatalogLobby('slots')).rejects.toBeInstanceOf(CatalogUnavailableError);

      const line = spy.mock.calls.map((call) => String(call[0])).find((entry) => entry.includes('[catalog-ssr]'));
      expect(line).toContain('"status":502');
      expect(line).toContain('"errorCode":"catalog_unavailable"');
      expect(line).toContain('"netlifyFlag":true');
      expect(line).not.toContain('secret-body');
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps the local BFF when URL is set without Netlify runtime markers', () => {
    vi.stubEnv('NETLIFY', '');
    vi.stubEnv('SITE_ID', '');
    vi.stubEnv('SITE_NAME', '');
    vi.stubEnv('URL', 'https://alphabet.netlify.app');
    vi.stubEnv('BFF_INTERNAL_URL', 'http://127.0.0.1:4000');

    expect(resolveBffBaseUrl()).toBe('http://127.0.0.1:4000');
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
