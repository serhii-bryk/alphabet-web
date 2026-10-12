import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AccountRequestError,
  AuthRequestError,
  fetchBalance,
  fetchProfile,
  fetchSession,
  isValidLoginInput,
  login,
  logout,
} from './auth-browser';

const session = {
  authenticated: true,
  playerId: '42',
  email: 'player@example.com',
  currency: 'EUR',
  expiresAt: '2026-10-08T18:00:00.000Z',
};
const profile = {
  playerId: '42',
  email: 'player@example.com',
  firstName: 'Test',
  lastName: 'Player',
  currency: 'EUR',
  countryCode: 'MT',
  emailVerified: true,
};
const password = 'correct-horse-battery';

function stubFetch(implementation: () => Promise<Response>) {
  const fetcher = vi.fn<typeof fetch>(implementation);
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

async function caught(promise: Promise<unknown>) {
  return promise.catch((error: unknown) => error);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isValidLoginInput', () => {
  it.each([
    ['player@example.com', password, true],
    ['  player@example.com ', password, true],
    ['player@example', password, false],
    ['not an email', password, false],
    ['', password, false],
    ['player@example.com', 'short', false],
    ['player@example.com', 'x'.repeat(256), false],
  ])('validates %j / password', (email, pass, valid) => {
    expect(isValidLoginInput({ email, password: pass })).toBe(valid);
  });
});

describe('fetchSession', () => {
  it('reads the session with same-origin credentials and no cache', async () => {
    const fetcher = stubFetch(async () => Response.json(session));
    await expect(fetchSession()).resolves.toEqual(session);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('/api/session');
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' });
  });

  it('returns a bare guest session and drops unexpected fields', async () => {
    stubFetch(async () => Response.json({ authenticated: false, token: 'leak' }));
    await expect(fetchSession()).resolves.toEqual({ authenticated: false });
  });

  it.each([
    [{ authenticated: true, email: 'x@example.com' }],
    [{ ...session, expiresAt: 'tomorrow' }],
    [null],
  ])('rejects malformed session %j', async (body) => {
    stubFetch(async () => Response.json(body));
    const error = await caught(fetchSession());
    expect(error).toBeInstanceOf(AuthRequestError);
  });

  it('rejects non-200 and network failures', async () => {
    stubFetch(async () => Response.json(session, { status: 500 }));
    expect(await caught(fetchSession())).toBeInstanceOf(AuthRequestError);
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await caught(fetchSession())).toBeInstanceOf(AuthRequestError);
  });
});

describe('login', () => {
  it('posts JSON credentials and returns the parsed session', async () => {
    const fetcher = stubFetch(async () => Response.json({ ...session, accessToken: 'secret' }));
    await expect(login({ email: ' player@example.com ', password })).resolves.toEqual(session);

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('/api/auth/login');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'player@example.com', password });
  });

  it.each([
    [400, 'invalid_login'],
    [401, 'invalid_credentials'],
    [502, 'auth_unavailable'],
  ] as const)('maps status %i to %s', async (status, code) => {
    stubFetch(async () => Response.json({ error: { code, message: 'safe' } }, { status }));
    const error = await caught(login({ email: 'player@example.com', password }));
    expect(error).toBeInstanceOf(AuthRequestError);
    expect((error as AuthRequestError).code).toBe(code);
  });

  it.each([
    [401, { error: { code: 'invalid_login', message: 'x' } }],
    [500, { error: { code: 'invalid_credentials', message: 'x' } }],
    [200, { authenticated: false }],
  ])('maps unexpected %i responses to auth_unavailable', async (status, body) => {
    stubFetch(async () => Response.json(body, { status }));
    const error = await caught(login({ email: 'player@example.com', password }));
    expect((error as AuthRequestError).code).toBe('auth_unavailable');
  });

  it('maps a network failure without exposing the password', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await caught(login({ email: 'player@example.com', password }));
    expect((error as AuthRequestError).code).toBe('auth_unavailable');
    expect(String((error as Error).message)).not.toContain(password);
  });
});

describe('logout', () => {
  it('posts and resolves to a guest session', async () => {
    const fetcher = stubFetch(async () => Response.json({ authenticated: false }));
    await expect(logout()).resolves.toEqual({ authenticated: false });
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: 'POST', credentials: 'same-origin' });
  });

  it('rejects when the BFF fails', async () => {
    stubFetch(async () => new Response('', { status: 502 }));
    expect(await caught(logout())).toBeInstanceOf(AuthRequestError);
  });
});

describe('account reads', () => {
  it('parses profile and balance', async () => {
    stubFetch(async () => Response.json(profile));
    await expect(fetchProfile()).resolves.toEqual(profile);
    stubFetch(async () => Response.json({ balance: 12.5, currency: 'EUR' }));
    await expect(fetchBalance()).resolves.toEqual({ balance: 12.5, currency: 'EUR' });
  });

  it.each([
    [401, 'session_ended'],
    [502, 'account_unavailable'],
    [500, 'account_unavailable'],
  ] as const)('maps status %i to %s', async (status, code) => {
    stubFetch(async () => new Response('', { status }));
    const error = await caught(fetchBalance());
    expect(error).toBeInstanceOf(AccountRequestError);
    expect((error as AccountRequestError).code).toBe(code);
  });

  it('rejects malformed account bodies', async () => {
    stubFetch(async () => Response.json({ balance: '12', currency: 'EUR' }));
    expect(((await caught(fetchBalance())) as AccountRequestError).code).toBe(
      'account_unavailable',
    );
    stubFetch(async () => Response.json({ ...profile, emailVerified: 'yes' }));
    expect(((await caught(fetchProfile())) as AccountRequestError).code).toBe(
      'account_unavailable',
    );
  });
});
