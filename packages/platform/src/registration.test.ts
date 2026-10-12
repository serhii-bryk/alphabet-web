import { describe, expect, it, vi } from 'vitest';
import { createPlatformClient } from './index.js';

const profile = {
  id: 42,
  email: 'new@example.com',
  currency: { id: 1, name: 'Euro', code: 'EUR', symbol: '€' },
};

function client(fetcher: typeof fetch) {
  return createPlatformClient({
    baseUrl: 'https://platform.example/api/v1',
    apiKey: 'key',
    apiSecret: 'secret',
    fetch: fetcher,
    now: () => 1_800_000_000_000,
  });
}

const input = {
  email: 'new@example.com',
  first_name: 'New',
  last_name: 'Player',
  address: '1 Test Street',
  city: 'London',
  postal_code: 'SW1A 1AA',
  country: 'GB',
  phone_prefix: '44',
  phone: '7700900123',
  date_of_birth: '1990-01-15',
  password: 'password-1',
  currency: 'EUR',
};

describe('platform registration transport', () => {
  it('posts the confirmed registration payload and parses the profile-only response', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ profile }, { status: 201 }));

    expect(await client(fetcher).register(input)).toEqual({ profile });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('https://platform.example/api/v1/player/register');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it('activates email with context and parses the returned auth session', async () => {
    const response = {
      profile,
      partner_id: 7,
      access_token: 'activated-token',
      token_type: 'bearer',
      expires_in: 3600,
      email_verified_at: '2026-10-08T12:00:00Z',
    };
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(response));

    expect(
      await client(fetcher).activateEmail({
        playerId: 42,
        domain: 'https://brand.example',
        ipNumber: '203.0.113.10',
        browser: 'Browser',
      }),
    ).toEqual(response);
    const [url, init] = fetcher.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/api/v1/player/42/activateEmail');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      domain: 'https://brand.example',
      ip_number: '203.0.113.10',
      browser: 'Browser',
    });
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('logs only the safe registration failure fields', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'wallet_currency_mismatch',
              message: 'player secret@example.com',
              context: { email: 'secret@example.com', password: 'password-1' },
            },
          }),
          { status: 500, headers: { 'content-type': 'application/json; charset=UTF-8' } },
        ),
    );

    await expect(client(fetcher).register(input)).rejects.toMatchObject({
      code: 'request_failed',
      status: 500,
      platformCode: 'wallet_currency_mismatch',
    });

    const logged = errorSpy.mock.calls.flat().map(String).join('\n');
    expect(JSON.parse(logged)).toEqual({
      event: 'registration_failure',
      status: 500,
      code: 'wallet_currency_mismatch',
      classification: 'platform_5xx',
      contentType: 'application/json',
    });
    expect(logged).not.toContain('secret@example.com');
    expect(logged).not.toContain('password-1');
    errorSpy.mockRestore();
  });

  it('classifies an auth rejection and an unexpected success body without logging them', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unauthorized = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: 'Invalid key', code: 'invalid_key' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect(client(unauthorized).register(input)).rejects.toMatchObject({
      status: 401,
      platformCode: 'invalid_key',
    });
    const unauthorizedLog = String(errorSpy.mock.calls[0]?.[0]);
    expect(JSON.parse(unauthorizedLog)).toEqual({
      event: 'registration_failure',
      status: 401,
      code: 'invalid_key',
      classification: 'auth',
      contentType: 'application/json',
    });
    expect(unauthorizedLog).not.toContain(input.email);
    expect(unauthorizedLog).not.toContain(input.password);

    errorSpy.mockClear();
    const unexpected = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ id: 7, email: input.email, password: input.password }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect(client(unexpected).register(input)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    const logged = String(errorSpy.mock.calls[0]?.[0]);
    expect(JSON.parse(logged)).toEqual({
      event: 'registration_failure',
      status: 201,
      code: null,
      classification: 'unexpected_success_response_shape',
      contentType: 'application/json',
    });
    expect(logged).not.toContain(input.email);
    expect(logged).not.toContain(input.password);
    errorSpy.mockRestore();
  });
});
