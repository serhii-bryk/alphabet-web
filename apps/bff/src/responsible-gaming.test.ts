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

const coolOffSettings = {
  periods: [
    { id: 1, text: '24 hours', date_selector: false },
    { id: 3, text: 'Pick a date', date_selector: true },
  ],
  reasons: [{ id: 10, text: 'Need a break' }],
};

const selfExclusionSettings = {
  periods: [{ id: 2, text: '6 months', date_selector: false }],
};

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
  if (path.endsWith('/player/login')) return Response.json(loginResponse);
  if (path.endsWith('/profile')) return Response.json(profileResponse);
  if (path.endsWith('/realityCheckSettings')) return Response.json({ values: [0, 30, 60] });
  if (path.endsWith('/coolOffSettings')) return Response.json(coolOffSettings);
  if (path.endsWith('/selfexclusionSettings')) return Response.json(selfExclusionSettings);
  if (path.endsWith('/reality-check') && method === 'GET') return Response.json({ value: 30 });
  if (path.endsWith('/exclusion') && method === 'POST') {
    const body = JSON.parse(String(init?.body)) as { period_id?: number; reason_id?: number };
    if (body.period_id === 2) {
      return Response.json({
        type: 'self_exclusion',
        period: '6 months',
        reason: null,
        status: 'SelfExclusion',
        expires_at: null,
        created_at: '2026-10-15T12:00:00.000Z',
      });
    }
    return Response.json({
      type: 'cooloff',
      period: '24 hours',
      reason: body.reason_id === 10 ? 'Need a break' : null,
      status: 'CoolOff',
      expires_at: '2026-10-16T12:00:00.000Z',
      created_at: '2026-10-15T12:00:00.000Z',
    });
  }
  if (path.endsWith('/logins')) {
    return Response.json({
      logins: [
        {
          login_at: '2026-10-15T10:00:00.000Z',
          ip_address: '203.0.113.8',
          browser: 'SecretBrowser',
        },
      ],
    });
  }
  return new Response('unexpected', { status: 500 });
}

describe('responsible gaming routes', () => {
  it('lets a guest read the catalog on both mounts', async () => {
    const { app, fetcher } = makeApp(platformRespond);
    const bare = await app.request('/responsible-gaming/catalog');
    const prefixed = await app.request('/api/responsible-gaming/catalog');
    const body = await bare.json();

    expect(bare.status).toBe(200);
    expect(prefixed.status).toBe(200);
    expect(body).toEqual(await prefixed.json());
    expect(body).toEqual({
      realityCheckIntervals: [0, 30, 60],
      coolOffPeriods: [
        { id: 1, text: '24 hours', dateSelector: false },
        { id: 3, text: 'Pick a date', dateSelector: true },
      ],
      coolOffReasons: [{ id: 10, text: 'Need a break' }],
      selfExclusionPeriods: [{ id: 2, text: '6 months', dateSelector: false }],
    });
    expect(JSON.stringify(body)).not.toContain('date_selector');
    expect(bare.headers.get('cache-control')).toBe('no-store');
    const paths = fetcher.mock.calls.map((call) => new URL(String(call[0])).pathname);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/casino/realityCheckSettings',
        '/api/v1/casino/coolOffSettings',
        '/api/v1/casino/selfexclusionSettings',
      ]),
    );
    expect(paths.some((path) => path.includes('/player/'))).toBe(false);
  });

  it('requires a session for reality check and exclusion', async () => {
    const { app, fetcher } = makeApp(platformRespond);
    const reality = await app.request('/api/responsible-gaming/reality-check?playerId=99');
    const coolOff = await app.request('/responsible-gaming/cool-off?playerId=99', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ periodId: 1, playerId: 99 }),
    });
    const selfExclusion = await app.request('/api/responsible-gaming/self-exclusion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ periodId: 2 }),
    });

    for (const response of [reality, coolOff, selfExclusion]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: 'session_ended', message: 'Your session has ended' },
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('clears the session cookie after cool-off and does not send a self-exclusion reason', async () => {
    const { app, fetcher } = makeApp(platformRespond);
    const cookie = await login(app);
    const coolOff = await app.request('/api/responsible-gaming/cool-off?playerId=99', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ periodId: 1, playerId: 99 }),
    });
    const selfExclusion = await app.request('/responsible-gaming/self-exclusion?playerId=99', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ periodId: 2, reasonId: 10, playerId: 99 }),
    });

    expect(coolOff.status).toBe(200);
    expect(await coolOff.json()).toEqual({
      kind: 'cool_off',
      periodText: '24 hours',
      reasonText: null,
      status: 'CoolOff',
      expiresAt: '2026-10-16T12:00:00.000Z',
      createdAt: '2026-10-15T12:00:00.000Z',
      sessionEnded: true,
    });
    expect(coolOff.headers.get('set-cookie')).toContain('brand_session=');
    expect(coolOff.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(selfExclusion.status).toBe(200);
    expect(await selfExclusion.json()).toMatchObject({
      kind: 'self_exclusion',
      reasonText: null,
      sessionEnded: true,
    });
    expect(selfExclusion.headers.get('set-cookie')).toContain('Max-Age=0');

    const exclusionCalls = fetcher.mock.calls.filter((call) => String(call[0]).includes('/exclusion'));
    expect(exclusionCalls).toHaveLength(2);
    expect(String(exclusionCalls[0]?.[0])).toBe('https://platform.example/api/v1/player/42/exclusion');
    expect(exclusionCalls[0]?.[1]?.body).toBe('{"period_id":1}');
    expect(String(exclusionCalls[1]?.[0])).not.toContain('/player/99/');
    expect(exclusionCalls[1]?.[1]?.body).toBe('{"period_id":2}');
    expect(String(exclusionCalls[1]?.[1]?.body)).not.toContain('reason_id');
  });

  it('rejects a foreign origin before calling Platform', async () => {
    const { app, fetcher } = makeApp(platformRespond);
    const cookie = await login(app);
    const callsAfterLogin = fetcher.mock.calls.length;
    const response = await app.request('/api/responsible-gaming/cool-off', {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      body: JSON.stringify({ periodId: 1 }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: 'responsible_gaming_unavailable', message: 'Responsible gaming is unavailable' },
    });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(fetcher.mock.calls.length).toBe(callsAfterLogin);
  });

  it('does not call Platform exclusion when the period asks for a custom date', async () => {
    const { app, fetcher } = makeApp(platformRespond);
    const cookie = await login(app);
    const response = await app.request('/api/responsible-gaming/cool-off', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ periodId: 3 }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'invalid_period', message: 'Invalid period' },
    });
    expect(fetcher.mock.calls.some((call) => String(call[0]).includes('/exclusion'))).toBe(false);
    expect(fetcher.mock.calls.some((call) => String(call[0]).includes('/coolOffSettings'))).toBe(true);
  });

  it('returns login_at and leaves ip and browser off the JSON', async () => {
    const { app, fetcher } = makeApp(platformRespond);
    const cookie = await login(app);
    const response = await app.request('/api/responsible-gaming/session?playerId=99', {
      headers: { cookie },
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      startedAt: '2026-10-15T10:00:00.000Z',
      source: 'platform_login',
    });
    expect(text).not.toContain('ip_address');
    expect(text).not.toContain('203.0.113.8');
    expect(text).not.toContain('browser');
    expect(text).not.toContain('SecretBrowser');

    const loginCall = fetcher.mock.calls.find((call) => String(call[0]).includes('/logins'));
    const loginUrl = new URL(String(loginCall?.[0]));
    expect(loginUrl.pathname).toBe('/api/v1/player/42/logins');
    expect(loginUrl.search).toBe('?limit=1');
    expect((loginCall?.[1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('clears the session cookie when Platform reports the account is restricted', async () => {
    const { app } = makeApp(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/player/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      if (path.endsWith('/reality-check') && (init?.method ?? 'GET') === 'GET') {
        return Response.json({ error: 'Account is currently self-excluded.', code: 'player_has_excluded' }, { status: 403 });
      }
      return new Response('unexpected', { status: 500 });
    });
    const cookie = await login(app);
    const response = await app.request('/api/responsible-gaming/reality-check', { headers: { cookie } });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: 'account_restricted', message: 'This account is restricted' },
    });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('clears the session cookie when Platform reports the account is restricted', async () => {
    const { app } = makeApp(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/player/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      if (path.endsWith('/reality-check')) {
        return Response.json(
          { error: 'Account is currently self-excluded.', code: 'player_has_excluded' },
          { status: 403 },
        );
      }
      return new Response('unexpected', { status: 500 });
    });
    const cookie = await login(app);
    const response = await app.request('/api/responsible-gaming/reality-check', { headers: { cookie } });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: 'account_restricted', message: 'This account is restricted' },
    });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('keeps the account session when the login row is missing', async () => {
    const { app } = makeApp(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/player/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      if (path.endsWith('/logins')) return Response.json({ logins: [] }, { status: 200 });
      void init;
      return new Response('unexpected', { status: 500 });
    });
    const cookie = await login(app);
    const response = await app.request('/responsible-gaming/session', { headers: { cookie } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ startedAt: null, source: 'unavailable' });
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
