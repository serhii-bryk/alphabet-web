import type { RegistrationInput } from '@brand/contracts';
import type { AuthUseCases, PlayerSession, RegistrationUseCases } from '@brand/domain';
import { AuthError, RegistrationError } from '@brand/domain';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const now = 1_800_000_000_000;
const accessToken = 'login-access-token';
const password = 'correct-horse';
const validInput: RegistrationInput = {
  email: 'new@example.com',
  password,
  country: 'GB',
  currency: 'EUR',
  firstName: 'New',
  lastName: 'Player',
  dateOfBirth: '1990-01-15',
  address: '1 Test Street',
  city: 'London',
  postalCode: 'SW1A 1AA',
  phonePrefix: '44',
  phone: '7700900123',
};

const currency = { id: 1, name: 'Euro', code: 'EUR', symbol: '€' };
const session: PlayerSession = {
  accessToken,
  playerId: '42',
  email: validInput.email,
  currency: 'EUR',
  expiresAt: new Date(now + 3_600_000).toISOString(),
};

const platformEnv = {
  WEB_ORIGIN: 'https://brand.example',
  SESSION_SECRET: 's'.repeat(32),
  FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
  FINAL_PLATFORM_API_KEY: 'key',
  FINAL_PLATFORM_API_SECRET: 'secret',
};

function useCases(overrides: Partial<RegistrationUseCases> = {}): RegistrationUseCases {
  return {
    options: vi.fn(async () => ({
      countries: [{ code: 'GB', name: 'United Kingdom', callingCode: '44' }],
      currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }],
      defaults: { country: 'GB', currency: 'EUR' },
    })),
    register: vi.fn(async () => ({ status: 'created' as const })),
    ...overrides,
  };
}

function authUseCases(overrides: Partial<AuthUseCases> = {}): AuthUseCases {
  return {
    login: vi.fn(async () => session),
    loginWithTelegram: vi.fn(),
    refreshIfNeeded: vi.fn(async () => ({ action: 'keep' as const, session })),
    logout: vi.fn(async () => undefined),
    ...overrides,
  };
}

function app(
  registration: RegistrationUseCases,
  clock = () => now,
  auth: AuthUseCases = authUseCases(),
) {
  return createApp({
    registration,
    auth,
    now: clock,
    env: platformEnv,
  });
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://brand.example',
      'user-agent': 'Browser',
      'x-forwarded-for': '203.0.113.10',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

describe('registration routes', () => {
  it('uses the local browser origin when WEB_ORIGIN is unset', async () => {
    const registration = useCases();
    const auth = authUseCases();
    const target = createApp({
      registration,
      auth,
      now: () => now,
      env: {
        SESSION_SECRET: 's'.repeat(32),
        FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
        FINAL_PLATFORM_API_KEY: 'key',
        FINAL_PLATFORM_API_SECRET: 'secret',
      },
    });
    const response = await target.request('/api/registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(validInput),
    });

    expect(response.status).toBe(201);
    expect(registration.register).toHaveBeenCalledOnce();
    expect(auth.login).toHaveBeenCalledWith({
      email: validInput.email,
      password: validInput.password,
      ipNumber: undefined,
      browser: undefined,
      domain: 'http://localhost:3000',
    });
  });

  it('still rejects a foreign origin when WEB_ORIGIN is unset', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const registration = useCases();
    const auth = authUseCases();
    const target = createApp({
      registration,
      auth,
      now: () => now,
      env: {
        SESSION_SECRET: 's'.repeat(32),
        FINAL_PLATFORM_API_URL: 'https://platform.example/api/v1',
        FINAL_PLATFORM_API_KEY: 'key',
        FINAL_PLATFORM_API_SECRET: 'secret',
      },
    });
    const response = await target.request('/api/registration', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify(validInput),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'registration_unavailable' } });
    expect(JSON.parse(String(errorSpy.mock.calls[0]?.[0]))).toEqual({
      event: 'registration_failure',
      status: null,
      code: null,
      classification: 'origin_rejected',
      contentType: null,
    });
    expect(registration.register).not.toHaveBeenCalled();
    expect(auth.login).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('classifies a non-JSON registration post separately from an origin rejection', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const registration = useCases();
    const auth = authUseCases();
    const response = await app(registration, () => now, auth).request('/api/registration', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'https://brand.example' },
      body: 'not-json',
    });

    expect(response.status).toBe(403);
    expect(JSON.parse(String(errorSpy.mock.calls[0]?.[0]))).toEqual({
      event: 'registration_failure',
      status: null,
      code: null,
      classification: 'invalid_content_type',
      contentType: null,
    });
    expect(registration.register).not.toHaveBeenCalled();
    expect(auth.login).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('registers, signs in, and seals an httpOnly session', async () => {
    const registration = useCases();
    const auth = authUseCases();
    const response = await app(registration, () => now, auth).request(
      '/api/registration',
      post(validInput),
    );
    const text = await response.text();

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(text)).toEqual({
      status: 'created',
      session: {
        authenticated: true,
        playerId: '42',
        email: validInput.email,
        currency: 'EUR',
        expiresAt: session.expiresAt,
      },
    });
    expect(text).not.toMatch(/access_token|password|correct-horse/);
    expect(response.headers.get('set-cookie')).toMatch(/brand_session=.*HttpOnly.*Secure/);
    expect(response.headers.get('set-cookie')).not.toContain(accessToken);
    expect(registration.register).toHaveBeenCalledWith(validInput);
    expect(auth.login).toHaveBeenCalledWith({
      email: validInput.email,
      password: validInput.password,
      ipNumber: '203.0.113.10',
      browser: 'Browser',
      domain: 'https://brand.example',
    });
  });

  it('rejects malformed input and never sends the password back', async () => {
    const shortPassword = 'short';
    const registration = useCases();
    const auth = authUseCases();
    const response = await app(registration, () => now, auth).request(
      '/api/registration',
      post({ ...validInput, password: shortPassword }),
    );
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain('weak_password');
    expect(text).not.toContain(shortPassword);
    expect(registration.register).not.toHaveBeenCalled();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('maps duplicate email without exposing an upstream error', async () => {
    const registration = useCases({
      register: vi.fn(async () => {
        throw new RegistrationError('email_already_registered');
      }),
    });
    const auth = authUseCases();
    const response = await app(registration, () => now, auth).request(
      '/api/registration',
      post(validInput),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: 'email_already_registered',
        message: 'An account with this email already exists. Try signing in instead.',
      },
    });
    expect(auth.login).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('shares a concurrent double submit and sets a cookie on each response', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const register = vi.fn(async () => {
      await gate;
      return { status: 'created' as const };
    });
    const auth = authUseCases();
    const target = app(useCases({ register }), () => now, auth);
    const first = target.request('/api/registration', post(validInput));
    const second = target.request('/api/registration', post(validInput));
    await vi.waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    release();
    const responses = await Promise.all([first, second]);

    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(auth.login).toHaveBeenCalledTimes(1);
    for (const response of responses) {
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('set-cookie')).toMatch(/brand_session=.*HttpOnly/);
      const body = await response.json();
      expect(body).toMatchObject({ status: 'created', session: { authenticated: true, playerId: '42' } });
      expect(JSON.stringify(body)).not.toContain(accessToken);
    }
  });

  it('returns sign_in_unavailable and no cookie when login fails after register', async () => {
    const registration = useCases();
    const auth = authUseCases({
      login: vi.fn(async () => {
        throw new AuthError('auth_unavailable');
      }),
    });
    const response = await app(registration, () => now, auth).request(
      '/api/registration',
      post(validInput),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        code: 'sign_in_unavailable',
        message: 'Your account was created, but we could not sign you in. Please sign in.',
      },
    });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(registration.register).toHaveBeenCalledOnce();
    expect(auth.login).toHaveBeenCalledOnce();
  });
});

describe('registration platform flow', () => {
  const country = {
    id: 1,
    name: 'United Kingdom',
    name_common: 'United Kingdom',
    alpha2: 'GB',
    alpha3: 'GBR',
  };
  const registeredProfile = {
    id: 42,
    email: validInput.email,
    currency,
  };
  const loginResponse = {
    profile: registeredProfile,
    partner_id: 7,
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
  };
  const profileResponse = {
    profile: {
      ...registeredProfile,
      first_name: 'New',
      last_name: 'Player',
      email_verified: false,
    },
  };

  function platformFetch(loginStatus = 200) {
    const urls: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      const path = new URL(url).pathname;
      if (path.endsWith('/countries')) return Response.json({ data: [country] });
      if (path.endsWith('/currencies')) return Response.json({ data: [currency] });
      if (path.endsWith('/player/register')) return Response.json({ profile: registeredProfile });
      if (path.endsWith('/player/login')) {
        if (loginStatus !== 200) {
          return Response.json({ code: 'invalid_player_credentials' }, { status: loginStatus });
        }
        return Response.json(loginResponse);
      }
      if (path.endsWith('/player/42/profile')) return Response.json(profileResponse);
      return new Response('unexpected', { status: 500 });
    });
    return { fetcher, urls };
  }

  it('calls Platform register then login and does not call Nexus or activateEmail', async () => {
    const { fetcher, urls } = platformFetch();
    const target = createApp({ env: platformEnv, fetch: fetcher, now: () => now });
    const response = await target.request('/api/registration', post(validInput));
    const text = await response.text();

    expect(response.status).toBe(201);
    expect(JSON.parse(text)).toEqual({
      status: 'created',
      session: {
        authenticated: true,
        playerId: '42',
        email: validInput.email,
        currency: 'EUR',
        expiresAt: new Date(now + 3_600_000).toISOString(),
      },
    });
    expect(text).not.toMatch(/access_token|correct-horse/);
    expect(response.headers.get('set-cookie')).toMatch(/brand_session=.*HttpOnly.*Secure/);
    expect(response.headers.get('set-cookie')).not.toContain(accessToken);

    const paths = urls.map((url) => new URL(url).pathname);
    expect(paths.some((path) => path.endsWith('/player/register'))).toBe(true);
    expect(paths.some((path) => path.endsWith('/player/login'))).toBe(true);
    expect(paths.findIndex((path) => path.endsWith('/player/register'))).toBeLessThan(
      paths.findIndex((path) => path.endsWith('/player/login')),
    );
    expect(urls.join('\n')).not.toMatch(/nexus|\/api\/accounts\/|activateEmail/i);
    const registerCall = fetcher.mock.calls.find((call) =>
      String(call[0]).endsWith('/player/register'),
    );
    expect(JSON.parse(String(registerCall?.[1]?.body))).toMatchObject({
      email: validInput.email,
      first_name: validInput.firstName,
      phone_prefix: validInput.phonePrefix,
    });
  });

  it('does not seal a session when login fails after Platform register', async () => {
    const { fetcher, urls } = platformFetch(401);
    const target = createApp({ env: platformEnv, fetch: fetcher, now: () => now });
    const response = await target.request('/api/registration', post(validInput));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: 'sign_in_unavailable' } });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(urls.filter((url) => url.includes('/player/register'))).toHaveLength(1);
    expect(urls.filter((url) => url.includes('/player/login'))).toHaveLength(1);
    expect(urls.join('\n')).not.toMatch(/nexus|\/api\/accounts\/|activateEmail/i);
  });
});
