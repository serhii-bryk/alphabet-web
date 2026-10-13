import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformClient, type PlatformClientError } from './index.js';

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
  categories: [{ id: 8, slug: 'slots', full_slug: 'casino/slots', name: 'Slots', parent_id: null }],
};

function page(data: unknown[], total = 40) {
  return {
    current_page: 2,
    data,
    first_page_url: 'https://platform.example/api/v1/player/42/games/last-played?page=1',
    from: 11,
    last_page: 4,
    last_page_url: 'https://platform.example/api/v1/player/42/games/last-played?page=4',
    links: [{ url: null, label: '1', active: false }],
    next_page_url: 'https://platform.example/api/v1/player/42/games/last-played?page=3',
    path: 'https://platform.example/api/v1/player/42/games/last-played',
    per_page: 10,
    prev_page_url: 'https://platform.example/api/v1/player/42/games/last-played?page=1',
    to: 20,
    total,
  };
}

function typedFetch(respond: () => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    return respond();
  });
}

function client(fetcher: typeof fetch) {
  return createPlatformClient({
    baseUrl: 'https://platform.example/api/v1',
    apiKey: 'private-key',
    apiSecret: 'private-secret',
    fetch: fetcher,
    now: () => 1_700_000_000_000,
  });
}

function signature(method: string, pathname: string, body = '') {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', 'private-secret')
    .update(`${method}\n${pathname}\n1700000000\n${bodyHash}`)
    .digest('base64');
}

describe('player personalization client', () => {
  it('lists favorites with the player bearer and no page query', async () => {
    const fetcher = typedFetch(() => Response.json({ count: 1, items: [game] }));
    const result = await client(fetcher).listFavorites(42, 'player-token');

    expect(result.items[0]?.id).toBe(12);
    expect(result.items[0]).not.toHaveProperty('played');
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe('https://platform.example/api/v1/player/42/favorites');
    expect(init?.method).toBe('GET');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer player-token',
      'X-API-KEY': 'private-key',
      'X-SIGNATURE': signature('GET', '/api/v1/player/42/favorites'),
    });
    expect(init?.body).toBeUndefined();
  });

  it('adds a favorite as JSON and signs the body', async () => {
    const fetcher = typedFetch(() => Response.json({ game_id: 7 }));
    const result = await client(fetcher).addFavorite(42, 'player-token', 7);
    const body = '{"game_id":7}';

    expect(result).toEqual({ game_id: 7 });
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe('https://platform.example/api/v1/player/42/favorites');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(body);
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer player-token',
      'Content-Type': 'application/json',
      'X-SIGNATURE': signature('POST', '/api/v1/player/42/favorites', body),
    });
  });

  it('deletes one favorite and signs DELETE with an empty body', async () => {
    const fetcher = typedFetch(() => Response.json({ removed_game_id: 7 }));
    await client(fetcher).removeFavorite(42, 'player-token', 7);

    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe('https://platform.example/api/v1/player/42/favorites/7');
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer player-token',
      'X-SIGNATURE': signature('DELETE', '/api/v1/player/42/favorites/7'),
    });
    expect(init?.headers).not.toHaveProperty('Content-Type');
  });

  it('sends last-played and most-played query params and coerces numeric strings', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/last-played')) {
        return Response.json(page([{ ...game, played: '4', last_played: '2026-01-02T03:04:05.000Z' }], 25));
      }
      return Response.json(
        page([{ ...game, id: 9, played: '6', rounds: '11', last_played: null }], 18),
      );
    });
    const api = client(fetcher);
    const last = await api.lastPlayed(42, 'player-token', {
      page: 2,
      limit: 12,
      order: 'asc',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
    });
    const most = await api.mostPlayed(42, 'player-token', {
      page: 3,
      limit: 12,
      order: 'desc',
      played: 2,
      rounds: 5,
    });

    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://platform.example/api/v1/player/42/games/last-played?page=2&limit=12&order=asc&startDate=2026-01-01&endDate=2026-02-01',
    );
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(
      'https://platform.example/api/v1/player/42/games/most-played?page=3&limit=12&order=desc&played=2&rounds=5',
    );
    expect(last.data[0]).toMatchObject({ played: 4, last_played: '2026-01-02T03:04:05.000Z' });
    expect(last.data[0]).not.toHaveProperty('rounds');
    expect(last.total).toBe(25);
    expect(most.data[0]).toMatchObject({ id: 9, played: 6, rounds: 11, last_played: null });
    expect(most.total).toBe(18);
    const signedPath = new URL(String(fetcher.mock.calls[0]?.[0])).pathname;
    expect((fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>)['X-SIGNATURE']).toBe(
      signature('GET', signedPath),
    );
  });

  it('refuses an unsafe player id before calling Platform', async () => {
    const fetcher = typedFetch(() => Response.json({ count: 0, items: [] }));
    await expect(client(fetcher).listFavorites(0, 'player-token')).rejects.toEqual(
      expect.objectContaining<Partial<PlatformClientError>>({ code: 'request_failed' }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not return secrets when the payload is invalid', async () => {
    const fetcher = typedFetch(() =>
      Response.json({
        items: [{ id: 'nope', access_token: 'login-access-token' }],
        access_token: 'login-access-token',
        signature: 'sig-value',
        api_key: 'private-key',
      }),
    );
    await expect(client(fetcher).listFavorites(42, 'player-token')).rejects.toEqual(
      expect.objectContaining<Partial<PlatformClientError>>({
        code: 'invalid_response',
        message: 'Platform response was invalid',
      }),
    );
    try {
      await client(fetcher).listFavorites(42, 'player-token');
    } catch (error) {
      const text = JSON.stringify(error);
      expect(text).not.toContain('login-access-token');
      expect(text).not.toContain('sig-value');
      expect(text).not.toContain('private-key');
      expect(text).not.toContain('private-secret');
    }
  });
});
