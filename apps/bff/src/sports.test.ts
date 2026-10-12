import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const start = 1_700_000_000_000;
const password = 'correct-horse-battery';
const accessToken = 'player-access-token';
const ticket = 'a'.repeat(64);
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
};

const profileResponse = {
  profile: { id: 42, email: 'player@example.com', currency },
};

function sportsResponse(playMode: 'DEMO' | 'REAL') {
  return {
    url: `https://platform.example/sports/play/${ticket}`,
    ticket,
    expires_at: '2026-10-09T16:00:00.000Z',
    play_mode: playMode,
    provider_code: 'hidden-provider',
  };
}

function makeApp(
  respond: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = async () =>
    Response.json(sportsResponse('DEMO')),
) {
  const fetcher = vi.fn(respond);
  const app = createApp({ env, fetch: fetcher, now: () => start });
  return { app, fetcher };
}

function sportsCalls(fetcher: ReturnType<typeof vi.fn>) {
  return fetcher.mock.calls.filter((call) => String(call[0]).includes('/sports/request-launch-ticket'));
}

async function login(app: ReturnType<typeof createApp>) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ email: 'player@example.com', password }),
  });
  const header = response.headers.get('set-cookie');
  if (!header) throw new Error('missing session cookie');
  return header.split(';', 1)[0] ?? '';
}

describe('sports launch route', () => {
  it('launches a guest sportsbook without a player bearer', async () => {
    const { app, fetcher } = makeApp();
    const response = await app.request('/api/sports/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ locale: 'en' }),
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(text)).toEqual({
      launchUrl: `https://platform.example/sports/play/${ticket}`,
      expiresAt: '2026-10-09T16:00:00.000Z',
      mode: 'demo',
    });
    expect(text).not.toMatch(/ticket|provider_code|hidden-provider|private/);
    const call = sportsCalls(fetcher)[0];
    expect(call?.[1]?.body).toBe('{"lang":"en"}');
    expect(Object.keys((call?.[1]?.headers ?? {}) as object).map((name) => name.toLowerCase())).not.toContain(
      'authorization',
    );
  });

  it('launches an authenticated sportsbook with the session token', async () => {
    const { app, fetcher } = makeApp(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      return Response.json(sportsResponse('REAL'));
    });
    const cookie = await login(app);
    const response = await app.request('/api/sports/launch', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie,
      },
      body: JSON.stringify({ locale: 'en', path: '/bet-history' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: 'real' });
    const call = sportsCalls(fetcher)[0];
    expect(call?.[1]?.body).toBe('{"lang":"en","path":"/bet-history"}');
    expect((call?.[1]?.headers as Record<string, string>).Authorization).toBe(`Bearer ${accessToken}`);
  });

  it('does not fall back to a guest launch when the player session is rejected', async () => {
    const { app, fetcher } = makeApp(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      return Response.json({ error: 'token_invalid', message: 'hidden upstream' }, { status: 401 });
    });
    const cookie = await login(app);
    const response = await app.request('/sports/launch', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie,
      },
      body: JSON.stringify({ locale: 'en' }),
    });
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(JSON.parse(text)).toEqual({
      error: { code: 'auth_required', message: 'Sign in again to open the sportsbook' },
    });
    expect(text).not.toMatch(/token_invalid|hidden upstream|guest/);
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect(sportsCalls(fetcher)).toHaveLength(1);
    expect((sportsCalls(fetcher)[0]?.[1]?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${accessToken}`,
    );
  });

  it('returns an auth error for a broken session cookie and does not launch as a guest', async () => {
    const { app, fetcher } = makeApp();
    const response = await app.request('/api/sports/launch', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: 'brand_session=not-a-session',
      },
      body: JSON.stringify({ locale: 'en' }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'auth_required' } });
    expect(sportsCalls(fetcher)).toHaveLength(0);
  });

  it('passes Arabic through as the sportsbook language', async () => {
    const { app, fetcher } = makeApp();
    const response = await app.request('/api/sports/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'ar' }),
    });

    expect(response.status).toBe(200);
    expect(sportsCalls(fetcher)[0]?.[1]?.body).toBe('{"lang":"ar"}');
  });

  it.each(['https://evil.example/live', '//evil.example/live', '/live?x=1', '/live#top', 'live'])(
    'rejects sportsbook path %s before calling platform',
    async (path) => {
      const { app, fetcher } = makeApp();
      const response = await app.request('/api/sports/launch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: 'en', path }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'invalid_sports_path' } });
      expect(sportsCalls(fetcher)).toHaveLength(0);
    },
  );
});
