import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformClient, PlatformClientError } from './index.js';

const currency = { id: 2, name: 'Euro', code: 'EUR', symbol: '€' };

const loginResponse = {
  profile: {
    id: 42,
    email: 'player@example.com',
    first_name: 'Hidden',
    currency,
  },
  partner_id: 7,
  access_token: 'login-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  sessionID: 'login-access-token',
};

function makeClient(fetcher: typeof globalThis.fetch) {
  return createPlatformClient({
    baseUrl: 'https://platform.example/api/v1/',
    apiKey: 'key',
    apiSecret: 'secret',
    fetch: fetcher,
    now: () => 1_700_000_000_000,
  });
}

describe('platform auth transport', () => {
  it('signs login JSON and omits empty optional fields', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(loginResponse));
    const result = await makeClient(fetcher).login({
      email: 'player@example.com',
      password: 'password-1',
      ipNumber: '',
      browser: '',
      domain: '',
    });

    expect(result).toEqual({
      profile: { id: 42, email: 'player@example.com', first_name: 'Hidden', currency },
      access_token: 'login-access-token',
      token_type: 'bearer',
      expires_in: 3600,
    });
    expect(result).not.toHaveProperty('partner_id');
    expect(result).not.toHaveProperty('sessionID');
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe('https://platform.example/api/v1/player/login');
    const body = '{"email":"player@example.com","password":"password-1"}';
    expect(init?.body).toBe(body);
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('device');
    const bodyHash = createHash('sha256').update(body).digest('hex');
    expect(init?.headers).toEqual({
      'X-API-KEY': 'key',
      'X-TIMESTAMP': '1700000000',
      'X-SIGNATURE': createHmac('sha256', 'secret')
        .update(`POST\n/api/v1/player/login\n1700000000\n${bodyHash}`)
        .digest('base64'),
      'Content-Type': 'application/json',
    });
    expect(Object.keys(init?.headers ?? {}).map((name) => name.toLowerCase())).not.toContain(
      'authorization',
    );
  });

  it('sends optional login fields when they are present', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(loginResponse));
    await makeClient(fetcher).login({
      email: 'player@example.com',
      password: 'password-1',
      ipNumber: '203.0.113.10',
      browser: 'Browser',
      domain: 'https://brand.example',
    });

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      email: 'player@example.com',
      password: 'password-1',
      ip_number: '203.0.113.10',
      browser: 'Browser',
      domain: 'https://brand.example',
    });
  });

  it('signs refresh and logout with an empty body and a bearer token', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/refresh')) {
        return Response.json({
          access_token: 'refreshed-access-token',
          token_type: 'bearer',
          expires_in: 1800,
        });
      }
      return Response.json({ message: 'Logged out', sessions_ended: 2 });
    });
    const client = makeClient(fetcher);

    await client.refresh(42, 'current-token');
    await client.logout(42, 'current-token');

    const emptyHash = createHash('sha256').update('').digest('hex');
    for (const [index, action] of ['refresh', 'logout'].entries()) {
      const [input, init] = fetcher.mock.calls[index]!;
      expect(String(input)).toBe(`https://platform.example/api/v1/player/42/${action}`);
      expect(init?.method).toBe('POST');
      expect(init?.body).toBeUndefined();
      expect(init?.headers).toEqual({
        'X-API-KEY': 'key',
        'X-TIMESTAMP': '1700000000',
        'X-SIGNATURE': createHmac('sha256', 'secret')
          .update(`POST\n/api/v1/player/42/${action}\n1700000000\n${emptyHash}`)
          .digest('base64'),
        Authorization: 'Bearer current-token',
      });
    }
  });

  it('loads the profile with the login player id and bearer token', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        profile: {
          ...loginResponse.profile,
          address: 'Hidden street',
          email_verified: true,
        },
      }),
    );

    const result = await makeClient(fetcher).getProfile(42, 'login-access-token');

    expect(result).toEqual({
      profile: {
        id: 42,
        email: 'player@example.com',
        first_name: 'Hidden',
        currency,
        email_verified: true,
        address: 'Hidden street',
      },
    });
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe('https://platform.example/api/v1/player/42/profile');
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer login-access-token');
  });

  it('copies only a string error code and drops the upstream message', async () => {
    const password = 'correct-horse-battery';
    const client = makeClient(async () =>
      Response.json(
        { error: `${password} was rejected`, code: 'invalid_player_credentials' },
        { status: 401 },
      ),
    );

    const error: unknown = await client
      .login({ email: 'player@example.com', password })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PlatformClientError);
    expect(error).toMatchObject({
      code: 'request_failed',
      status: 401,
      platformCode: 'invalid_player_credentials',
      message: 'Platform request failed',
    });
    expect(JSON.stringify(error)).not.toContain(password);
    expect(JSON.stringify(error)).not.toContain('was rejected');
  });

  it.each([
    ['numeric code', { error: 'secret-upstream', code: 12 }],
    ['missing code', { error: 'secret-upstream' }],
  ])('does not copy a non-string platform code (%s)', async (_label, body) => {
    const client = makeClient(async () => Response.json(body, { status: 401 }));
    const error: unknown = await client.getProfile(42, 'token').catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'request_failed',
      status: 401,
      platformCode: undefined,
      message: 'Platform request failed',
    });
    expect(JSON.stringify(error)).not.toContain('secret-upstream');
  });

  it('reads a snake_case launch error and prefers an explicit code', async () => {
    const fromErrorField = makeClient(async () =>
      Response.json(
        { message: 'hidden upstream', error: 'game_launch_authentication_required' },
        { status: 401 },
      ),
    );
    const errorField: unknown = await fromErrorField
      .launchRealGame('406', 'token')
      .catch((caught: unknown) => caught);
    expect(errorField).toMatchObject({
      platformCode: 'game_launch_authentication_required',
      status: 401,
    });
    expect(JSON.stringify(errorField)).not.toContain('hidden upstream');

    const preferred = makeClient(async () =>
      Response.json({ error: 'Session expired', code: 'session_expired' }, { status: 401 }),
    );
    const preferredError: unknown = await preferred
      .getBalance(42, 'token')
      .catch((caught: unknown) => caught);
    expect(preferredError).toMatchObject({ platformCode: 'session_expired' });
    expect(JSON.stringify(preferredError)).not.toContain('Session expired');
  });

  it('does not treat a human error string as a platform code', async () => {
    const client = makeClient(async () =>
      Response.json({ message: 'secret-upstream', error: 'Session expired' }, { status: 401 }),
    );
    const error: unknown = await client.getProfile(42, 'token').catch((caught: unknown) => caught);
    expect(error).toMatchObject({ platformCode: undefined });
    expect(JSON.stringify(error)).not.toContain('secret-upstream');
    expect(JSON.stringify(error)).not.toContain('Session expired');
  });

  it('loads balance with a bearer token and drops the address', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ balance: 12.5, currency: 'EUR', address: 'Hidden street' }),
    );
    const result = await makeClient(fetcher).getBalance(42, 'current-token');

    expect(result).toEqual({ balance: 12.5, currency: 'EUR' });
    expect(result).not.toHaveProperty('address');
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe('https://platform.example/api/v1/player/42/balance');
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer current-token');
    const emptyHash = createHash('sha256').update('').digest('hex');
    expect((init?.headers as Record<string, string>)['X-SIGNATURE']).toBe(
      createHmac('sha256', 'secret')
        .update(`GET\n/api/v1/player/42/balance\n1700000000\n${emptyHash}`)
        .digest('base64'),
    );
  });

  it('does not copy a non-JSON error body', async () => {
    const client = makeClient(async () => new Response('secret-upstream-text', { status: 503 }));
    const error: unknown = await client.logout(42, 'token').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ platformCode: undefined, message: 'Platform request failed' });
    expect(JSON.stringify(error)).not.toContain('secret-upstream-text');
  });
});
