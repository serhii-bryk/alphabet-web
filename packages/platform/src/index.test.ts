import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformClient } from './index.js';
import type { PlatformClientError } from './index.js';

const game = {
  id: 12,
  provider_id: 3,
  provider_name: 'Provider',
  provider_category_id: null,
  provider_game_id: 'provider-12',
  name: 'Game',
  slug: 'game',
  type: 'slots',
  provider_game_type: null,
  icon: 'https://cdn.example/game.png',
  rtp: '96.2',
  volatility: null,
  is_active: 1,
  demo_play_enabled: 1,
  created_at: null,
  updated_at: null,
  provider: {
    id: 3,
    code: 'provider',
    name: 'Provider',
    display_name: 'Provider',
    grouped_code: null,
  },
  categories: [
    { id: 8, slug: 'slots', full_slug: 'casino/slots', name: 'Slots', parent_id: null },
  ],
};

const page = {
  current_page: 1,
  data: [game],
  first_page_url: 'https://platform.example/api/v1/games?page=1',
  from: 1,
  last_page: 1,
  last_page_url: 'https://platform.example/api/v1/games?page=1',
  links: [{ url: null, label: 'Previous', active: false }],
  next_page_url: null,
  path: 'https://platform.example/api/v1/games',
  per_page: 20,
  prev_page_url: null,
  to: 1,
  total: 1,
};

describe('createPlatformClient', () => {
  it('signs the pathname and validates the games response', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return Response.json(page);
    });
    const client = createPlatformClient({
      baseUrl: 'https://platform.example/api/v1/',
      apiKey: 'key',
      apiSecret: 'secret',
      fetch: fetcher,
      now: () => 1_700_000_000_000,
    });

    const result = await client.getGames({ page: 2, perPage: 40, search: 'roulette' });

    expect(result.data[0]?.id).toBe(12);
    expect(fetcher).toHaveBeenCalledOnce();
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe(
      'https://platform.example/api/v1/games?page=2&per_page=40&search=roulette',
    );
    const bodyHash = createHash('sha256').update('').digest('hex');
    const expected = createHmac('sha256', 'secret')
      .update(`GET\n/api/v1/games\n1700000000\n${bodyHash}`)
      .digest('base64');
    expect(init?.headers).toEqual({
      'X-API-KEY': 'key',
      'X-TIMESTAMP': '1700000000',
      'X-SIGNATURE': expected,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects an invalid wire response without exposing it', async () => {
    const client = createPlatformClient({
      baseUrl: 'https://platform.example/api/v1',
      apiKey: 'key',
      apiSecret: 'secret',
      fetch: async () => Response.json({ data: [] }),
    });

    await expect(client.getGames()).rejects.toEqual(
      expect.objectContaining<Partial<PlatformClientError>>({
        code: 'invalid_response',
        message: 'Platform response was invalid',
      }),
    );
  });

  it('turns a timed-out request into a safe request failure', async () => {
    const client = createPlatformClient({
      baseUrl: 'https://platform.example/api/v1',
      apiKey: 'key',
      apiSecret: 'secret',
      timeoutMs: 1,
      fetch: async (input, init) => {
        void input;
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      },
    });

    await expect(client.getProviders()).rejects.toEqual(
      expect.objectContaining<Partial<PlatformClientError>>({
        code: 'request_failed',
        message: 'Platform request failed',
      }),
    );
  });

  it('excludes every query parameter from the signed path', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json(page);
    });
    const client = createPlatformClient({
      baseUrl: 'https://platform.example/api/v1',
      apiKey: 'key',
      apiSecret: 'secret',
      fetch: fetcher,
      now: () => 1_700_000_000_000,
    });

    await client.getGames({
      page: 4,
      perPage: 25,
      search: 'live roulette',
      category: 'tables',
      provider: 'studio',
      groupedProvider: 'studio group',
      type: 'live-casino',
    });

    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe(
      'https://platform.example/api/v1/games?page=4&per_page=25&search=live+roulette&category=tables&provider=studio&grouped_provider=studio+group&type=live-casino',
    );
    const bodyHash = createHash('sha256').update('').digest('hex');
    expect((init?.headers as Record<string, string>)['X-SIGNATURE']).toBe(
      createHmac('sha256', 'secret')
        .update(`GET\n/api/v1/games\n1700000000\n${bodyHash}`)
        .digest('base64'),
    );
  });

  it.each([
    ['providers', '/api/v1/games/providers'],
    ['categories', '/api/v1/games/categories'],
  ] as const)('signs the %s endpoint pathname', async (resource, pathname) => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json([]);
    });
    const client = createPlatformClient({
      baseUrl: 'https://platform.example/api/v1/',
      apiKey: 'key',
      apiSecret: 'secret',
      fetch: fetcher,
      now: () => 1_700_000_000_000,
    });

    if (resource === 'providers') await client.getProviders();
    else await client.getCategories();

    const [input, init] = fetcher.mock.calls[0]!;
    expect(new URL(String(input)).pathname).toBe(pathname);
    const bodyHash = createHash('sha256').update('').digest('hex');
    expect((init?.headers as Record<string, string>)['X-SIGNATURE']).toBe(
      createHmac('sha256', 'secret')
        .update(`GET\n${pathname}\n1700000000\n${bodyHash}`)
        .digest('base64'),
    );
  });

  it('redacts network and HTTP response details', async () => {
    const networkClient = createPlatformClient({
      baseUrl: 'https://platform.example/api/v1',
      apiKey: 'key',
      apiSecret: 'secret',
      fetch: async () => {
        throw new Error('socket details and secret payload');
      },
    });
    const httpClient = createPlatformClient({
      baseUrl: 'https://platform.example/api/v1',
      apiKey: 'key',
      apiSecret: 'secret',
      fetch: async () => new Response('sensitive upstream body', { status: 503 }),
    });

    await expect(networkClient.getCategories()).rejects.toMatchObject({
      code: 'request_failed',
      message: 'Platform request failed',
    });
    await expect(httpClient.getCategories()).rejects.toMatchObject({
      code: 'request_failed',
      message: 'Platform request failed',
    });
  });
});
