import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformClient, PlatformClientError } from './index.js';

const currency = { id: 2, name: 'Euro', code: 'EUR', symbol: '€' };
const loginResponse = {
  status: 'authenticated',
  profile: { id: 42, email: 'player@example.com', currency },
  partner_id: 7,
  access_token: 'login-access-token',
  token_type: 'bearer',
  expires_in: 3600,
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

describe('external auth transport', () => {
  it('lists only redirect methods and signs the methods request', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        methods: [
          { code: 'telegram', name: 'Telegram', type: 'redirect' },
          { code: 'google', name: 'Google', type: 'redirect', secret: 'nope' },
          { code: 'phone', name: 'Phone', type: 'otp' },
        ],
      }),
    );
    const methods = await makeClient(fetcher).listExternalAuthMethods();
    expect(methods).toEqual([
      { code: 'telegram', name: 'Telegram', type: 'redirect' },
      { code: 'google', name: 'Google', type: 'redirect' },
    ]);
    const [input, init] = fetcher.mock.calls[0]!;
    expect(String(input)).toBe('https://platform.example/api/v1/auth/methods');
    const bodyHash = createHash('sha256').update('').digest('hex');
    expect(init?.headers).toMatchObject({
      'X-SIGNATURE': createHmac('sha256', 'secret')
        .update(`GET\n/api/v1/auth/methods\n1700000000\n${bodyHash}`)
        .digest('base64'),
    });
    expect(init?.headers).not.toHaveProperty('Authorization');
  });

  it('starts a redirect without sending a player token', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        authentication_id: 'AUTH_server',
        type: 'redirect',
        redirect_url: 'https://oauth.telegram.org/auth?state=provider',
        expires_in: 300,
      }),
    );
    const started = await makeClient(fetcher).startExternalAuth({
      method: 'telegram',
      returnUrl: 'http://localhost:3000/auth/callback',
      clientState: 'a'.repeat(32),
      ipNumber: '203.0.113.10',
      browser: 'Browser',
      domain: 'http://localhost:3000',
    });
    expect(started.authentication_id).toBe('AUTH_server');
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as Record<string, string>;
    expect(body).toEqual({
      return_url: 'http://localhost:3000/auth/callback',
      client_state: 'a'.repeat(32),
      ip_number: '203.0.113.10',
      browser: 'Browser',
      domain: 'http://localhost:3000',
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://platform.example/api/v1/auth/request/telegram',
    );
  });

  it('rejects a return URL that already carries ticket or client_state', async () => {
    const fetcher = vi.fn();
    await expect(
      makeClient(fetcher).startExternalAuth({
        method: 'telegram',
        returnUrl: 'http://localhost:3000/auth/callback?ticket=LT_stolen',
        clientState: 'a'.repeat(32),
      }),
    ).rejects.toMatchObject({ code: 'request_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a non-https provider redirect', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        authentication_id: 'AUTH_server',
        type: 'redirect',
        redirect_url: 'http://evil.example/auth',
        expires_in: 300,
      }),
    );
    await expect(
      makeClient(fetcher).startExternalAuth({
        method: 'telegram',
        returnUrl: 'http://localhost:3000/auth/callback',
        clientState: 'a'.repeat(32),
      }),
    ).rejects.toBeInstanceOf(PlatformClientError);
  });

  it('keeps an onboarding token in the exchange result and an authenticated session without the raw partner id', async () => {
    let exchanged = false;
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toMatch(/\/auth\/exchange$/);
      if (!exchanged) {
        exchanged = true;
        return Response.json({
          status: 'onboarding_required',
          onboarding_token: 'OB_server',
          expires_in: 1800,
          required_fields: ['email', 'country', 'date_of_birth', 'currency'],
          prefill: { first_name: 'Ada', last_name: 'Lovelace' },
        });
      }
      return Response.json(loginResponse);
    });
    const client = makeClient(fetcher);
    const onboarding = await client.exchangeExternalAuth({
      ticket: 'LT_ticket_value',
      authenticationId: 'AUTH_server',
    });
    expect(onboarding).toMatchObject({ status: 'onboarding_required', onboarding_token: 'OB_server' });
    const authenticated = await client.exchangeExternalAuth({
      ticket: 'LT_ticket_value',
      authenticationId: 'AUTH_server',
    });
    expect(authenticated).toMatchObject({
      status: 'authenticated',
      session: { access_token: 'login-access-token' },
    });
    if (authenticated.status === 'authenticated') {
      expect(authenticated.session).not.toHaveProperty('partner_id');
    }
  });

  it('passes validation field names and not the upstream message', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          error: 'The email john@example.com is wrong',
          code: 'registration_validation_failed',
          fields: { 'player.email': ['The email john@example.com is wrong'] },
        },
        { status: 422 },
      ),
    );
    const error = await makeClient(fetcher)
      .completeExternalOnboarding({
        onboardingToken: 'OB_server',
        player: { email: 'john@example.com' },
      })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: 'request_failed',
      platformCode: 'registration_validation_failed',
      fields: ['email'],
    });
    expect(String(error)).not.toContain('john@example.com');
  });
});
