import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const start = 1_700_000_000_000;
const password = 'correct-horse-battery';
const accessToken = 'login-access-token';
const currency = { id: 2, name: 'Euro', code: 'EUR', symbol: '€' };

const env = {
  WEB_ORIGIN: 'http://localhost:3000',
  FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
  FINAL_PLATFORM_API_KEY: 'private-key',
  FINAL_PLATFORM_API_SECRET: 'private-secret',
  SESSION_SECRET: 's'.repeat(32),
};

const loginResponse = {
  profile: { id: 42, email: 'player@example.com', currency },
  partner_id: 7,
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: 3600,
  signature: 'login-signature',
};

const profileResponse = {
  profile: {
    id: 42,
    email: 'player@example.com',
    first_name: 'Test',
    last_name: 'Player',
    currency,
    country: { alpha2: 'MT' },
    email_verified: true,
  },
};

function wireGame(id: number, type: 'slots' | 'live-casino' | null = 'slots') {
  return {
    id,
    provider_id: 3,
    provider_name: 'Provider',
    provider_category_id: null,
    provider_game_id: `studio-secret-${id}`,
    name: `Game ${id}`,
    slug: `game-${id}`,
    type,
    provider_game_type: null,
    icon: null,
    rtp: null,
    volatility: null,
    is_active: 1,
    demo_play_enabled: 0,
    created_at: null,
    updated_at: null,
    provider: null,
    categories: [],
    access_token: accessToken,
    signature: 'wire-signature',
    api_key: 'private-key',
  };
}

function playedPage(data: unknown[]) {
  return {
    current_page: 2,
    data,
    first_page_url: 'https://platform.example/api/v1/games?page=1',
    from: 11,
    last_page: 4,
    last_page_url: 'https://platform.example/api/v1/games?page=4',
    links: [],
    next_page_url: 'https://platform.example/api/v1/games?page=3',
    path: 'https://platform.example/api/v1/games',
    per_page: 10,
    prev_page_url: 'https://platform.example/api/v1/games?page=1',
    to: 20,
    total: 37,
  };
}

function makeApp(respond: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const fetcher = vi.fn(respond);
  const app = createApp({ env, fetch: fetcher, now: () => start });
  return { app, fetcher };
}

function cookiePair(response: Response): string {
  const header = response.headers.get('set-cookie');
  if (!header) throw new Error('missing set-cookie');
  return header.split(';', 1)[0] ?? '';
}

async function login(app: ReturnType<typeof createApp>) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'player@example.com', password }),
  });
  return cookiePair(response);
}

async function platformRespond(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(input));
  const path = url.pathname;
  const method = init?.method ?? 'GET';
  if (path.endsWith('/login')) return Response.json(loginResponse);
  if (path.endsWith('/profile')) return Response.json(profileResponse);
  if (path.endsWith('/favorites') && method === 'POST') return Response.json({ game_id: 12 });
  if (path.endsWith('/favorites/12') && method === 'DELETE') return Response.json({ removed_game_id: 12 });
  if (path.endsWith('/favorites')) {
    return Response.json({
      count: 2,
      items: [wireGame(30), wireGame(31, null), wireGame(12)],
    });
  }
  if (path.endsWith('/last-played')) {
    return Response.json(
      playedPage([
        { ...wireGame(30), played: '4', last_played: '2026-04-01T00:00:00.000Z' },
        { ...wireGame(31, null), played: '1', last_played: null },
        { ...wireGame(12), played: '2', last_played: null },
      ]),
    );
  }
  if (path.endsWith('/most-played')) {
    return Response.json(
      playedPage([{ ...wireGame(12), played: '8', rounds: '15', last_played: '2026-04-02T00:00:00.000Z' }]),
    );
  }
  return new Response('unexpected', { status: 500 });
}

describe('player personalization routes', () => {
  it('returns 401 session_ended without a cookie and does not call Platform', async () => {
    const { app, fetcher } = makeApp(async () => Response.json({ count: 0, items: [] }));
    const response = await app.request('/api/player/favorites?playerId=99');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'session_ended', message: 'Your session has ended' },
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ignores a browser player id and returns the favorites contract for the session player', async () => {
    const { app, fetcher } = makeApp(platformRespond);
    const cookie = await login(app);
    const response = await app.request('/api/player/favorites?playerId=99', { headers: { cookie } });
    const text = await response.text();
    const added = await app.request('/player/favorites?playerId=99', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: '12', playerId: '99' }),
    });
    const removed = await app.request('/api/player/favorites/12?playerId=99', {
      method: 'DELETE',
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      games: [expect.objectContaining({ id: '30', title: 'Game 30' }), expect.objectContaining({ id: '12' })],
    });
    expect(JSON.parse(text).games).toHaveLength(2);
    expect(text).not.toMatch(/access_token|private-key|private-secret|signature|studio-secret|provider_game_id|playerId/);
    expect(added.status).toBe(200);
    expect(await added.json()).toEqual({ gameId: '12' });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ gameId: '12' });

    const urls = fetcher.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/player/42/favorites'))).toBe(true);
    expect(urls.some((url) => url.includes('/player/99'))).toBe(false);
    const post = fetcher.mock.calls.find((call) => call[1]?.method === 'POST' && String(call[0]).endsWith('/favorites'));
    expect(post?.[1]?.body).toBe('{"game_id":12}');
    expect((post?.[1]?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((post?.[1]?.headers as Record<string, string>).Authorization).toBe(`Bearer ${accessToken}`);
    const deleted = fetcher.mock.calls.find((call) => call[1]?.method === 'DELETE');
    expect(String(deleted?.[0])).toBe('https://platform.example/api/v1/player/42/favorites/12');
  });

  it('returns last-played and most-played pages with real pagination and coerced stats', async () => {
    const { app, fetcher } = makeApp(platformRespond);
    const cookie = await login(app);
    const last = await app.request('/player/last-played?page=2&limit=10', { headers: { cookie } });
    const most = await app.request('/api/player/most-played?page=2&played=2&rounds=3&startDate=2026-01-01&endDate=2026-02-01', {
      headers: { cookie },
    });
    const lastBody = await last.json();
    const mostBody = await most.json();

    expect(last.status).toBe(200);
    expect(lastBody.games.map((game: { id: string }) => game.id)).toEqual(['30', '12']);
    expect(lastBody.games[0]).toMatchObject({ played: 4, lastPlayed: '2026-04-01T00:00:00.000Z' });
    expect(lastBody.games[0]).not.toHaveProperty('rounds');
    expect(lastBody.pagination).toEqual({
      page: 2,
      perPage: 10,
      total: 37,
      lastPage: 4,
      from: 11,
      to: 20,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(mostBody.games[0]).toMatchObject({ id: '12', played: 8, rounds: 15, lastPlayed: '2026-04-02T00:00:00.000Z' });
    expect(JSON.stringify(lastBody) + JSON.stringify(mostBody)).not.toMatch(
      /access_token|private-key|private-secret|studio-secret|signature/,
    );

    const lastUrl = String(fetcher.mock.calls.find((call) => String(call[0]).includes('/last-played'))?.[0]);
    const mostUrl = String(fetcher.mock.calls.find((call) => String(call[0]).includes('/most-played'))?.[0]);
    expect(lastUrl).toContain('/player/42/games/last-played?');
    expect(lastUrl).toContain('page=2');
    expect(lastUrl).toContain('limit=10');
    expect(lastUrl).toContain('order=desc');
    expect(lastUrl).not.toContain('playerId');
    expect(mostUrl).toContain('order=desc');
    expect(mostUrl).toContain('played=2');
    expect(mostUrl).toContain('rounds=3');
    expect(mostUrl).toContain('startDate=2026-01-01');
    expect(mostUrl).toContain('endDate=2026-02-01');
  });

  it('clears the cookie when Platform says the player session ended', async () => {
    const { app } = makeApp(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      return Response.json({ message: 'hidden', error: 'session_expired', access_token: accessToken }, { status: 401 });
    });
    const cookie = await login(app);
    const response = await app.request('/api/player/favorites', { headers: { cookie } });
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(JSON.parse(text)).toEqual({
      error: { code: 'session_ended', message: 'Your session has ended' },
    });
    expect(text).not.toMatch(/access_token|private-key|signature/);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rejects an invalid played query', async () => {
    const { app, fetcher } = makeApp(platformRespond);
    const cookie = await login(app);
    const response = await app.request('/api/player/last-played?order=sideways&limit=101', { headers: { cookie } });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'invalid_query', message: 'Invalid personalization query' },
    });
    expect(fetcher.mock.calls.some((call) => String(call[0]).includes('/last-played'))).toBe(false);
  });
});
