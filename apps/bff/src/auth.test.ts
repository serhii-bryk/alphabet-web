import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const start = 1_700_000_000_000;
const secret = 's'.repeat(32);
const password = 'correct-horse-battery';
const accessToken = 'login-access-token';

const currency = { id: 2, name: 'Euro', code: 'EUR', symbol: '€' };

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
    country: { id: 1, name: 'Malta', alpha2: 'MT' },
    email_verified: true,
    phone: 'secret-phone',
    address: 'secret-address',
  },
};

const platformEnv = {
  WEB_ORIGIN: 'http://localhost:3000',
  FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
  FINAL_PLATFORM_API_KEY: 'private-key',
  FINAL_PLATFORM_API_SECRET: 'private-secret',
  SESSION_SECRET: secret,
};

function cookiePair(response: Response): string {
  const header = response.headers.get('set-cookie');
  if (!header) throw new Error('missing set-cookie');
  return header.split(';', 1)[0] ?? '';
}

describe('auth routes', () => {
  it('logs in, stores an httpOnly cookie, and returns only the browser session', async () => {
    let current = start;
    const fetcher = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/player/login')) return Response.json(loginResponse);
      if (path.endsWith('/player/42/profile')) return Response.json(profileResponse);
      return new Response('unexpected', { status: 500 });
    });
    const app = createApp({
      env: platformEnv,
      fetch: fetcher,
      now: () => current,
    });

    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Browser',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({ email: ' Player@Example.COM ', password }),
    });
    const text = await response.text();
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      authenticated: true,
      playerId: '42',
      email: 'player@example.com',
      currency: 'EUR',
      expiresAt: new Date(start + 3_600_000).toISOString(),
    });
    expect(text).not.toMatch(/access_token|sessionID|partner_id|private/);
    expect(setCookie).toContain('brand_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Secure');
    expect(setCookie).not.toContain(accessToken);
    expect(setCookie).not.toContain('partner_id');

    const loginCall = fetcher.mock.calls[0];
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({
      email: 'player@example.com',
      password,
      ip_number: '203.0.113.10',
      browser: 'Browser',
      domain: 'http://localhost:3000',
    });
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('/player/42/profile');

    const callsAfterLogin = fetcher.mock.calls.length;
    const session = await app.request('/api/session', {
      headers: { cookie: cookiePair(response) },
    });
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual(JSON.parse(text));
    expect(fetcher.mock.calls.length).toBe(callsAfterLogin);

    current = start + 3_400_000;
    let releaseRefresh = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    fetcher.mockImplementation(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/refresh')) {
        await gate;
        return Response.json({
          access_token: 'refreshed-access-token',
          token_type: 'bearer',
          expires_in: 120,
        });
      }
      return new Response('unexpected', { status: 500 });
    });
    const cookie = cookiePair(response);
    const first = app.request('/session', { headers: { cookie } });
    const second = app.request('/api/session', { headers: { cookie } });
    await vi.waitFor(() => {
      const refreshes = fetcher.mock.calls.filter((call) =>
        String(call[0]).includes('/refresh'),
      );
      expect(refreshes).toHaveLength(1);
    });
    releaseRefresh();
    const [left, right] = await Promise.all([first, second]);
    expect(left.status).toBe(200);
    expect(await right.json()).toEqual(
      expect.objectContaining({
        authenticated: true,
        expiresAt: new Date(current + 120_000).toISOString(),
      }),
    );
    expect(left.headers.get('set-cookie')).toContain('brand_session=');
    expect(fetcher.mock.calls.filter((call) => String(call[0]).includes('/refresh'))).toHaveLength(1);
  });

  it('sets Secure when the web origin is https', async () => {
    const app = createApp({
      env: { ...platformEnv, WEB_ORIGIN: 'https://brand.example' },
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith('/login')) return Response.json(loginResponse);
        return Response.json(profileResponse);
      },
      now: () => start,
    });
    const response = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'player@example.com', password }),
    });
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });

  it('maps invalid credentials without the upstream message', async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: `${password} was rejected`, code: 'invalid_player_credentials' },
        { status: 401 },
      ),
    );
    const app = createApp({ env: platformEnv, fetch: fetcher, now: () => start });
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'player@example.com', password }),
    });
    const text = await response.text();
    expect(response.status).toBe(401);
    expect(JSON.parse(text)).toEqual({
      error: { code: 'invalid_credentials', message: 'The email or password is incorrect' },
    });
    expect(text).not.toContain(password);
    expect(text).not.toContain('was rejected');
  });

  it.each([
    [403, 'player_has_excluded', 403, 'account_restricted', 'This account is restricted'],
    [403, 'player_login_unavailable', 502, 'auth_unavailable', 'Sign-in is unavailable'],
  ] as const)('maps login %i %s to %s', async (platformStatus, platformCode, status, code, message) => {
    const fetcher = vi.fn(async () =>
      Response.json({ message: 'hidden upstream', code: platformCode }, { status: platformStatus }),
    );
    const app = createApp({ env: platformEnv, fetch: fetcher, now: () => start });
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'player@example.com', password }),
    });
    const text = await response.text();
    expect(response.status).toBe(status);
    expect(JSON.parse(text)).toEqual({ error: { code, message } });
    expect(text).not.toContain('hidden upstream');
    expect(text).not.toContain(platformCode);
  });

  it.each([
    ['missing body', { 'content-type': 'application/json' }, ''],
    ['short password', { 'content-type': 'application/json' }, JSON.stringify({ email: 'player@example.com', password: 'short' })],
    ['bad email', { 'content-type': 'application/json' }, JSON.stringify({ email: 'not-an-email', password })],
    ['text body', { 'content-type': 'text/plain' }, JSON.stringify({ email: 'player@example.com', password })],
  ])('rejects %s without calling Platform', async (_label, headers, body) => {
    const fetcher = vi.fn();
    const app = createApp({ env: platformEnv, fetch: fetcher, now: () => start });
    const response = await app.request('/api/auth/login', { method: 'POST', headers, body });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'invalid_login', message: 'Enter a valid email and password' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns a guest session when no cookie is present', async () => {
    const fetcher = vi.fn();
    const app = createApp({ env: platformEnv, fetch: fetcher, now: () => start });
    const response = await app.request('/api/session');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('clears a tampered cookie and an expired session without refresh', async () => {
    let current = start;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      return new Response('unexpected', { status: 500 });
    });
    const app = createApp({ env: platformEnv, fetch: fetcher, now: () => current });
    const tampered = await app.request('/api/session', {
      headers: { cookie: 'brand_session=not-a-session' },
    });
    expect(tampered.status).toBe(200);
    expect(await tampered.json()).toEqual({ authenticated: false });
    expect(tampered.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(fetcher).not.toHaveBeenCalled();

    const loggedIn = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'player@example.com', password }),
    });
    const calls = fetcher.mock.calls.length;
    current = start + 3_600_000;
    const expired = await app.request('/api/session', { headers: { cookie: cookiePair(loggedIn) } });
    expect(await expired.json()).toEqual({ authenticated: false });
    expect(expired.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(fetcher.mock.calls.length).toBe(calls);
  });

  it('clears the session when refresh reports session_expired', async () => {
    let current = start;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      if (path.endsWith('/refresh')) {
        return Response.json({ error: 'Session expired', code: 'session_expired' }, { status: 401 });
      }
      return new Response('unexpected', { status: 500 });
    });
    const app = createApp({ env: platformEnv, fetch: fetcher, now: () => current });
    const loggedIn = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'player@example.com', password }),
    });
    current = start + 3_500_000;
    const response = await app.request('/api/session', {
      headers: { cookie: cookiePair(loggedIn) },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it.each([401, 403, 404, 500])('clears the cookie when logout returns %i', async (status) => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      if (path.endsWith('/logout')) return Response.json({ error: 'secret-upstream' }, { status });
      return new Response('unexpected', { status: 500 });
    });
    const app = createApp({ env: platformEnv, fetch: fetcher, now: () => start });
    const loggedIn = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'player@example.com', password }),
    });
    const response = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: cookiePair(loggedIn),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ playerId: 99 }),
    });
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ authenticated: false });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(text).not.toContain('secret-upstream');
    const logoutCall = fetcher.mock.calls.find((call) => String(call[0]).includes('/logout'));
    expect(String(logoutCall?.[0])).toContain('/player/42/logout');
    expect(String(logoutCall?.[0])).not.toContain('/player/99/');
  });

  it('logs out with no cookie without calling Platform', async () => {
    const fetcher = vi.fn();
    const app = createApp({ env: platformEnv, fetch: fetcher, now: () => start });
    const response = await app.request('/api/auth/logout', { method: 'POST' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a foreign Origin without changing the session', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/login')) return Response.json(loginResponse);
      if (path.endsWith('/profile')) return Response.json(profileResponse);
      return new Response('unexpected', { status: 500 });
    });
    const app = createApp({ env: platformEnv, fetch: fetcher, now: () => start });
    const rejected = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ email: 'player@example.com', password }),
    });
    expect(rejected.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();

    const loggedIn = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'player@example.com', password }),
    });
    const calls = fetcher.mock.calls.length;
    const logout = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { cookie: cookiePair(loggedIn), origin: 'https://evil.example' },
    });
    expect(logout.status).toBe(403);
    expect(logout.headers.get('set-cookie')).toBeNull();
    expect(fetcher.mock.calls.length).toBe(calls);
  });

  it('keeps catalog available when the session secret is missing', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        current_page: 1,
        data: [],
        first_page_url: 'https://platform.example/api/v1/games?page=1',
        from: null,
        last_page: 0,
        last_page_url: 'https://platform.example/api/v1/games?page=1',
        links: [],
        next_page_url: null,
        path: 'https://platform.example/api/v1/games',
        per_page: 20,
        prev_page_url: null,
        to: null,
        total: 0,
      }),
    );
    const app = createApp({
      env: { ...platformEnv, SESSION_SECRET: undefined },
      fetch: fetcher,
      now: () => start,
    });
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'player@example.com', password }),
    });
    expect(login.status).toBe(502);
    expect(await login.json()).toEqual({
      error: { code: 'auth_unavailable', message: 'Sign-in is unavailable' },
    });
    expect(fetcher).not.toHaveBeenCalled();
    const catalog = await app.request('/catalog/games');
    expect(catalog.status).toBe(200);
  });
});
