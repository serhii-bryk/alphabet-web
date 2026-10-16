import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const start = 1_700_000_000_000;
const secret = 's'.repeat(32);
const currency = { id: 2, name: 'Euro', code: 'EUR', symbol: '€' };
const platformEnv = {
  WEB_ORIGIN: 'http://localhost:3000',
  FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
  FINAL_PLATFORM_API_KEY: 'private-key',
  FINAL_PLATFORM_API_SECRET: 'private-secret',
  SESSION_SECRET: secret,
};

const methods = {
  methods: [
    { code: 'telegram', name: 'Telegram', type: 'redirect' },
    { code: 'google', name: 'Google', type: 'redirect' },
    { code: 'phone', name: 'Phone', type: 'otp' },
  ],
};

const authenticated = {
  status: 'authenticated',
  profile: { id: 42, email: 'ada@example.com', currency },
  partner_id: 7,
  access_token: 'platform-jwt',
  token_type: 'bearer',
  expires_in: 3600,
};

const profile = { profile: { id: 42, email: 'ada@example.com', currency } };

function cookiePair(response: Response, name: string): string {
  const raw = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  if (!raw) throw new Error(`missing ${name}`);
  return raw.split(';', 1)[0] ?? '';
}

function appWith(fetcher: typeof fetch) {
  return createApp({ env: platformEnv, fetch: fetcher, now: () => start });
}

describe('external auth routes', () => {
  it('returns only redirect methods and hides them when Platform fails', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(methods));
    const listed = await appWith(fetcher).request('/api/auth/methods');
    expect(await listed.json()).toEqual({
      methods: [
        { code: 'telegram', name: 'Telegram', type: 'redirect' },
        { code: 'google', name: 'Google', type: 'redirect' },
      ],
    });
    const failed = await appWith(vi.fn(async () => new Response('nope', { status: 500 }))).request(
      '/api/auth/providers',
    );
    expect(await failed.json()).toEqual({ methods: [] });
  });

  it('starts Telegram, binds the callback, and seals a session without exposing platform secrets', async () => {
    let authenticationId = '';
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/auth/methods')) return Response.json(methods);
      if (path.endsWith('/auth/request/telegram')) {
        authenticationId = 'AUTH_server_only';
        return Response.json({
          authentication_id: authenticationId,
          type: 'redirect',
          redirect_url: 'https://oauth.telegram.org/auth?bot_id=1',
          expires_in: 300,
        });
      }
      if (path.endsWith('/auth/exchange')) return Response.json(authenticated);
      if (path.endsWith('/profile')) return Response.json(profile);
      return new Response(String(init?.body ?? 'unexpected'), { status: 500 });
    });
    const app = appWith(fetcher);
    const started = await app.request('/api/auth/external/start', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        'user-agent': 'Browser',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({ method: 'telegram', next: '/account' }),
    });
    const startedText = await started.text();
    const pending = cookiePair(started, 'ab_ext_pending');
    expect(started.status).toBe(200);
    expect(JSON.parse(startedText)).toEqual({
      redirectUrl: 'https://oauth.telegram.org/auth?bot_id=1',
    });
    expect(startedText).not.toContain(authenticationId);
    expect(started.headers.getSetCookie().join('\n')).toMatch(/ab_ext_pending=.*HttpOnly/);
    expect(startedText).not.toContain('client_state');
    const requestBody = JSON.parse(
      String(fetcher.mock.calls.find((call) => String(call[0]).includes('/auth/request/'))?.[1]?.body),
    ) as { return_url: string; client_state: string };
    expect(requestBody.return_url).toBe('http://localhost:3000/auth/callback');

    const mismatch = await app.request('/api/auth/external/finish', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: pending,
      },
      body: JSON.stringify({ ticket: 'LT_ticket_value', clientState: 'b'.repeat(32) }),
    });
    expect(mismatch.status).toBe(400);
    expect(fetcher.mock.calls.some((call) => String(call[0]).includes('/auth/exchange'))).toBe(false);

    const finished = await app.request('/api/auth/external/finish', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: pending,
      },
      body: JSON.stringify({ ticket: 'LT_ticket_value', clientState: requestBody.client_state }),
    });
    const finishedText = await finished.text();
    expect(finished.status).toBe(200);
    expect(JSON.parse(finishedText)).toMatchObject({
      authenticated: true,
      playerId: '42',
      email: 'ada@example.com',
      next: '/account',
    });
    expect(finishedText).not.toContain('platform-jwt');
    expect(finishedText).not.toContain('LT_ticket_value');
    expect(cookiePair(finished, 'brand_session')).toContain('brand_session=');
    const exchanged = JSON.parse(
      String(fetcher.mock.calls.find((call) => String(call[0]).includes('/auth/exchange'))?.[1]?.body),
    ) as { authentication_id: string; ticket: string };
    expect(exchanged).toEqual({ ticket: 'LT_ticket_value', authentication_id: authenticationId });
  });

  it('keeps the onboarding token on the server and creates the session when the form is completed', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/auth/methods')) return Response.json(methods);
      if (path.endsWith('/auth/request/telegram')) {
        return Response.json({
          authentication_id: 'AUTH_server_only',
          type: 'redirect',
          redirect_url: 'https://oauth.telegram.org/auth',
          expires_in: 300,
        });
      }
      if (path.endsWith('/auth/exchange')) {
        return Response.json({
          status: 'onboarding_required',
          onboarding_token: 'OB_server_only',
          expires_in: 1800,
          required_fields: ['email', 'country', 'date_of_birth', 'currency'],
          prefill: { first_name: 'Ada', last_name: 'Lovelace' },
        });
      }
      if (path.endsWith('/auth/onboarding/complete')) return Response.json(authenticated);
      if (path.endsWith('/profile')) return Response.json(profile);
      return new Response('unexpected', { status: 500 });
    });
    const app = appWith(fetcher);
    const started = await app.request('/api/auth/external/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ method: 'telegram', next: '/casino' }),
    });
    const clientState = (
      JSON.parse(
        String(fetcher.mock.calls.find((call) => String(call[0]).includes('/auth/request/'))?.[1]?.body),
      ) as { client_state: string }
    ).client_state;
    const finished = await app.request('/api/auth/external/finish', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: cookiePair(started, 'ab_ext_pending'),
      },
      body: JSON.stringify({ ticket: 'LT_ticket_value', clientState }),
    });
    const finishedText = await finished.text();
    expect(JSON.parse(finishedText)).toEqual({
      status: 'onboarding_required',
      requiredFields: ['email', 'country', 'date_of_birth', 'currency'],
      prefill: { first_name: 'Ada', last_name: 'Lovelace' },
      expiresAt: new Date(start + 1_800_000).toISOString(),
      next: '/casino',
      method: 'telegram',
    });
    expect(finishedText).not.toContain('OB_server_only');
    const onboardingCookie = cookiePair(finished, 'ab_ext_onboarding');
    expect(finished.headers.getSetCookie().join('\n')).toMatch(/ab_ext_onboarding=.*HttpOnly/);

    const read = await app.request('/api/auth/onboarding', { headers: { cookie: onboardingCookie } });
    const readText = await read.text();
    expect(JSON.parse(readText)).toMatchObject({ prefill: { first_name: 'Ada' } });
    expect(readText).not.toContain('OB_server_only');

    const completed = await app.request('/api/auth/onboarding', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: onboardingCookie,
      },
      body: JSON.stringify({
        values: {
          email: 'ada@example.com',
          country: 'MT',
          date_of_birth: '1990-01-02',
          currency: 'EUR',
          first_name: 'Ada',
          last_name: 'Byron',
        },
      }),
    });
    const completedText = await completed.text();
    expect(completed.status).toBe(200);
    expect(JSON.parse(completedText)).toMatchObject({ authenticated: true, next: '/casino' });
    expect(completedText).not.toContain('platform-jwt');
    expect(completedText).not.toContain('OB_server_only');
    const sent = JSON.parse(
      String(
        fetcher.mock.calls.find((call) => String(call[0]).includes('/auth/onboarding/complete'))?.[1]?.body,
      ),
    ) as { onboarding_token: string; player: { last_name: string } };
    expect(sent.onboarding_token).toBe('OB_server_only');
    expect(sent.player.last_name).toBe('Byron');
    expect(sent.player).not.toHaveProperty('phone');
  });

  it('asks Google onboarding for a phone and sends the prefilled profile with it', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/auth/methods')) return Response.json(methods);
      if (path.endsWith('/auth/request/google')) {
        return Response.json({
          authentication_id: 'AUTH_server_only',
          type: 'redirect',
          redirect_url: 'https://accounts.google.com/o/oauth2/v2/auth',
          expires_in: 300,
        });
      }
      if (path.endsWith('/auth/exchange')) {
        return Response.json({
          status: 'onboarding_required',
          onboarding_token: 'OB_server_only',
          expires_in: 1800,
          required_fields: ['email', 'country', 'date_of_birth', 'currency'],
          prefill: { email: 'ada@example.com', first_name: 'Ada', last_name: 'Lovelace' },
        });
      }
      if (path.endsWith('/auth/onboarding/complete')) return Response.json(authenticated);
      if (path.endsWith('/profile')) return Response.json(profile);
      return new Response('unexpected', { status: 500 });
    });
    const app = appWith(fetcher);
    const started = await app.request('/api/auth/external/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ method: 'google', next: '/casino' }),
    });
    const clientState = (
      JSON.parse(
        String(fetcher.mock.calls.find((call) => String(call[0]).includes('/auth/request/'))?.[1]?.body),
      ) as { client_state: string }
    ).client_state;
    const finished = await app.request('/api/auth/external/finish', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: cookiePair(started, 'ab_ext_pending'),
      },
      body: JSON.stringify({ ticket: 'LT_ticket_value', clientState }),
    });
    expect(await finished.json()).toMatchObject({
      status: 'onboarding_required',
      method: 'google',
      requiredFields: ['email', 'country', 'date_of_birth', 'currency'],
      prefill: { email: 'ada@example.com', first_name: 'Ada', last_name: 'Lovelace' },
    });
    const onboardingCookie = cookiePair(finished, 'ab_ext_onboarding');
    const missingPhone = await app.request('/api/auth/onboarding', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: onboardingCookie,
      },
      body: JSON.stringify({
        values: {
          email: 'ada@example.com',
          country: 'GB',
          date_of_birth: '1990-01-02',
          currency: 'EUR',
          first_name: 'Ada',
          last_name: 'Lovelace',
        },
      }),
    });
    expect(missingPhone.status).toBe(422);
    expect(await missingPhone.json()).toMatchObject({
      error: { code: 'invalid_onboarding' },
      fields: ['phone_prefix', 'phone'],
    });
    expect(fetcher.mock.calls.some((call) => String(call[0]).includes('/auth/onboarding/complete'))).toBe(false);

    const completed = await app.request('/api/auth/onboarding', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: onboardingCookie,
      },
      body: JSON.stringify({
        values: {
          email: 'ada@example.com',
          country: 'GB',
          date_of_birth: '1990-01-02',
          currency: 'EUR',
          first_name: 'Ada',
          last_name: 'Lovelace',
          phone_prefix: '44',
          phone: '7700900123',
        },
      }),
    });
    expect(completed.status).toBe(200);
    const sent = JSON.parse(
      String(
        fetcher.mock.calls.find((call) => String(call[0]).includes('/auth/onboarding/complete'))?.[1]?.body,
      ),
    ) as { player: Record<string, string> };
    expect(sent.player).toMatchObject({
      email: 'ada@example.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
      country: 'GB',
      phone_prefix: '44',
      phone: '7700900123',
    });
  });

  it('rejects an expired ticket, a bad return URL, an unlisted method, and a foreign origin', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/auth/methods')) return Response.json(methods);
      if (path.endsWith('/auth/request/telegram')) {
        return Response.json(
          { error: 'The return URL is not registered for this partner.', code: 'invalid_return_url' },
          { status: 422 },
        );
      }
      if (path.endsWith('/auth/exchange')) {
        return Response.json(
          { error: 'The ticket expired.', code: 'authentication_ticket_expired' },
          { status: 410 },
        );
      }
      return Response.json({
        authentication_id: 'AUTH_server_only',
        type: 'redirect',
        redirect_url: 'https://oauth.telegram.org/auth',
        expires_in: 300,
      });
    });
    const app = appWith(fetcher);
    const foreign = await app.request('/api/auth/external/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ method: 'telegram' }),
    });
    expect(foreign.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();

    const unlisted = await app.request('/api/auth/external/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ method: 'apple' }),
    });
    expect(unlisted.status).toBe(502);
    expect(fetcher.mock.calls.some((call) => String(call[0]).includes('/auth/request/'))).toBe(false);

    const invalidReturn = await app.request('/api/auth/external/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ method: 'telegram' }),
    });
    expect(invalidReturn.status).toBe(422);
    expect(await invalidReturn.json()).toMatchObject({ error: { code: 'invalid_return_url' } });

    const googleFetcher = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/auth/methods')) return Response.json(methods);
      if (path.endsWith('/auth/request/google')) {
        return Response.json({
          authentication_id: 'AUTH_server_only',
          type: 'redirect',
          redirect_url: 'https://accounts.google.com/o/oauth2/v2/auth',
          expires_in: 300,
        });
      }
      return Response.json(
        { error: 'expired', code: 'authentication_ticket_expired' },
        { status: 410 },
      );
    });
    const googleApp = appWith(googleFetcher);
    const started = await googleApp.request('/api/auth/external/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ method: 'google', next: 'https://evil.example' }),
    });
    const clientState = (
      JSON.parse(
        String(googleFetcher.mock.calls.find((call) => String(call[0]).includes('/auth/request/'))?.[1]?.body),
      ) as { client_state: string }
    ).client_state;
    const expired = await googleApp.request('/api/auth/external/finish', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: cookiePair(started, 'ab_ext_pending'),
      },
      body: JSON.stringify({ ticket: 'LT_ticket_value', clientState }),
    });
    expect(expired.status).toBe(410);
    expect(await expired.json()).toMatchObject({ error: { code: 'external_auth_expired' } });
    const callbackError = await googleApp.request('/api/auth/external/finish', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: cookiePair(started, 'ab_ext_pending'),
      },
      body: JSON.stringify({ error: 'authentication_cancelled', clientState }),
    });
    expect(callbackError.status).toBe(400);
    expect(await callbackError.json()).toMatchObject({ error: { code: 'external_auth_cancelled' } });
  });
});
