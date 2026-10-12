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
  sessionID: accessToken,
};

const profileResponse = {
  profile: {
    id: 42,
    email: 'player@example.com',
    first_name: 'Test',
    last_name: 'Player',
    currency,
    country: { alpha2: 'MT', name: 'Malta' },
    email_verified: true,
    phone: 'secret-phone',
    address: 'secret-address',
    agent_id: 3,
  },
};

const launch = {
  id: 406,
  name: 'Real Game',
  slug: 'real-game',
  provider: 'Studio',
  provider_code: 'studio',
  launch_url: 'https://platform.example/game/play/ticket-123',
  session_id: 'session-secret',
};

function cookiePair(response: Response): string {
  const header = response.headers.get('set-cookie');
  if (!header) throw new Error('missing set-cookie');
  return header.split(';', 1)[0] ?? '';
}

function makeApp(
  respond: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  now: () => number = () => start,
) {
  const fetcher = vi.fn(respond);
  const app = createApp({ env, fetch: fetcher, now });
  return { app, fetcher };
}

async function login(app: ReturnType<typeof createApp>) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'player@example.com', password }),
  });
  return cookiePair(response);
}

describe('account routes', () => {
  it('returns profile and balance from the session player', async () => {
    const { app, fetcher } = makeApp(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      if (path.endsWith('/balance')) {
        return Response.json({ balance: 12.5, currency: 'EUR', address: 'secret-address' });
      }
      return new Response('unexpected', { status: 500 });
    });
    const cookie = await login(app);
    const profile = await app.request('/api/account/profile?playerId=99', { headers: { cookie } });
    const balance = await app.request('/account/balance', { headers: { cookie } });
    const profileText = await profile.text();
    const balanceText = await balance.text();

    expect(profile.status).toBe(200);
    expect(JSON.parse(profileText)).toEqual({
      playerId: '42',
      email: 'player@example.com',
      firstName: 'Test',
      lastName: 'Player',
      currency: 'EUR',
      countryCode: 'MT',
      emailVerified: true,
    });
    expect(balance.status).toBe(200);
    expect(JSON.parse(balanceText)).toEqual({ balance: 12.5, currency: 'EUR' });
    expect(`${profileText}${balanceText}`).not.toMatch(/secret-phone|secret-address|agent_id|access_token/);
    expect(profile.headers.get('cache-control')).toBe('no-store');
    const profileCall = fetcher.mock.calls.find((call) => String(call[0]).includes('/profile') && call !== fetcher.mock.calls[1]);
    expect(String(fetcher.mock.calls.map((call) => String(call[0])))).toContain('/player/42/profile');
    expect(String(fetcher.mock.calls.map((call) => String(call[0])))).not.toContain('/player/99/');
    expect(profileCall).toBeDefined();
  });

  it('returns 401 without calling Platform when the cookie is missing', async () => {
    const { app, fetcher } = makeApp(async () => Response.json(profileResponse));
    const response = await app.request('/api/account/profile');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'session_ended', message: 'Your session has ended' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refreshes before reading the profile and clears a dead session', async () => {
    let current = start;
    const { app, fetcher } = makeApp(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/refresh')) {
        return Response.json({
          access_token: 'refreshed-access-token',
          token_type: 'bearer',
          expires_in: 300,
        });
      }
      if (path.endsWith('/profile')) {
        const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
        if (authorization === 'Bearer refreshed-access-token') {
          return Response.json(
            { message: 'hidden', error: 'session_expired' },
            { status: 401 },
          );
        }
        return Response.json(profileResponse);
      }
      return new Response('unexpected', { status: 500 });
    }, () => current);
    const cookie = await login(app);
    current = start + 3_500_000;
    const response = await app.request('/api/account/profile', { headers: { cookie } });
    const text = await response.text();
    expect(response.status).toBe(401);
    expect(JSON.parse(text)).toEqual({
      error: { code: 'session_ended', message: 'Your session has ended' },
    });
    expect(text).not.toContain('authenticated');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    const refresh = fetcher.mock.calls.find((call) => String(call[0]).includes('/refresh'));
    const profile = [...fetcher.mock.calls].reverse().find((call) => String(call[0]).includes('/profile'));
    expect(refresh).toBeDefined();
    expect((profile?.[1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer refreshed-access-token',
    );
  });
});

describe('real game launch', () => {
  it('launches with the session token and does not require a body', async () => {
    const { app, fetcher } = makeApp(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      if (path.endsWith('/player/game/launch')) return Response.json(launch);
      return new Response('unexpected', { status: 500 });
    });
    const cookie = await login(app);
    const response = await app.request('/api/games/406/launch/real?playerId=99', {
      method: 'POST',
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      launchUrl: 'https://platform.example/game/play/ticket-123',
      mode: 'real',
    });
    expect(text).not.toMatch(/session_id|provider_code|session-secret|private/);
    const launchCall = fetcher.mock.calls.find((call) => String(call[0]).includes('/player/game/launch'));
    expect(launchCall?.[1]?.body).toBe('{"game_id":"406","play_mode":"real"}');
    expect((launchCall?.[1]?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${accessToken}`,
    );
  });

  it('requires a session and rejects a foreign origin before calling Platform', async () => {
    const { app, fetcher } = makeApp(async () => Response.json(launch));
    const missing = await app.request('/api/games/406/launch/real', { method: 'POST' });
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({
      error: { code: 'auth_required', message: 'Sign in to play for real money' },
    });
    expect(fetcher).not.toHaveBeenCalled();

    const forbidden = await app.request('/games/406/launch/real', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({
      error: { code: 'launch_unavailable', message: 'Game launch is unavailable' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('clears the cookie when real launch reports an ended session', async () => {
    const { app } = makeApp(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      return Response.json(
        { message: 'hidden upstream', error: 'game_launch_authentication_required' },
        { status: 401 },
      );
    });
    const cookie = await login(app);
    const response = await app.request('/api/games/406/launch/real', {
      method: 'POST',
      headers: { cookie },
    });
    const text = await response.text();
    expect(response.status).toBe(401);
    expect(JSON.parse(text)).toEqual({
      error: { code: 'auth_required', message: 'Sign in to play for real money' },
    });
    expect(text).not.toContain('hidden upstream');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('keeps the cookie when the game is unavailable', async () => {
    const { app } = makeApp(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      return Response.json({ message: 'hidden', error: 'game_unavailable' }, { status: 403 });
    });
    const cookie = await login(app);
    const response = await app.request('/api/games/406/launch/real', {
      method: 'POST',
      headers: { cookie },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: 'game_unavailable', message: 'This game is unavailable' },
    });
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
