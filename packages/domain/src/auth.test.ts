import type { PlatformClient, PlatformLoginResponse, PlatformProfileResponse } from '@brand/platform';
import { PlatformClientError } from '@brand/platform';
import { describe, expect, it, vi } from 'vitest';
import { AuthError, createAuthUseCases, toAuthSession } from './index.js';
import type { PlayerSession } from './index.js';

const start = 1_700_000_000_000;
const password = 'correct-horse-battery';

const loginResult: PlatformLoginResponse = {
  profile: {
    id: 42,
    email: 'login-profile@example.com',
    currency: { id: 1, name: 'US Dollar', code: 'USD', symbol: '$' },
  },
  access_token: 'login-access-token',
  token_type: 'bearer',
  expires_in: 3600,
};

const profileResult: PlatformProfileResponse = {
  profile: {
    id: 42,
    email: 'player@example.com',
    currency: { id: 2, name: 'Euro', code: 'EUR', symbol: '€' },
  },
};

function platform(overrides: Partial<PlatformClient> = {}): PlatformClient {
  return {
    getRegistrationCountries: vi.fn(),
    getRegistrationCurrencies: vi.fn(),
    register: vi.fn(),
    activateEmail: vi.fn(),
    getGames: vi.fn(),
    getProviders: vi.fn(),
    getCategories: vi.fn(),
    launchDemoGame: vi.fn(),
    launchRealGame: vi.fn(),
    requestSportsLaunchTicket: vi.fn(),
    login: vi.fn(async () => loginResult),
    getProfile: vi.fn(async () => profileResult),
    getBalance: vi.fn(),
    deposit: vi.fn(),
    requestWithdrawal: vi.fn(),
    approveWithdrawal: vi.fn(),
    confirmWithdrawal: vi.fn(),
    rollbackWithdrawal: vi.fn(),
    listFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    lastPlayed: vi.fn(),
    mostPlayed: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(async () => ({ message: 'Logged out', sessions_ended: 1 })),
    ...overrides,
  };
}

function session(expiresAt: string, accessToken = 'current-token'): PlayerSession {
  return {
    accessToken,
    playerId: '42',
    email: 'player@example.com',
    currency: 'EUR',
    expiresAt,
  };
}

describe('createAuthUseCases', () => {
  it('maps login through the profile id, email, and currency code', async () => {
    const client = platform();
    const useCases = createAuthUseCases(client, { now: () => start });

    const result = await useCases.login({
      email: 'player@example.com',
      password,
      ipNumber: '203.0.113.10',
      browser: 'Browser',
      domain: 'http://localhost:3000',
    });

    expect(client.login).toHaveBeenCalledWith({
      email: 'player@example.com',
      password,
      ipNumber: '203.0.113.10',
      browser: 'Browser',
      domain: 'http://localhost:3000',
    });
    expect(client.getProfile).toHaveBeenCalledWith(42, 'login-access-token');
    expect(result).toEqual({
      accessToken: 'login-access-token',
      playerId: '42',
      email: 'player@example.com',
      currency: 'EUR',
      expiresAt: new Date(start + 3_600_000).toISOString(),
    });
    expect(toAuthSession(result)).toEqual({
      authenticated: true,
      playerId: '42',
      email: 'player@example.com',
      currency: 'EUR',
      expiresAt: result.expiresAt,
    });
    expect(JSON.stringify(toAuthSession(result))).not.toContain('login-access-token');
    expect(toAuthSession(result)).not.toHaveProperty('partner_id');
  });

  it('stores a null currency when the profile has none', async () => {
    const client = platform({
      getProfile: vi.fn(async () => ({
        profile: { id: 42, email: 'player@example.com', currency: null },
      })),
    });
    const result = await createAuthUseCases(client, { now: () => start }).login({
      email: 'player@example.com',
      password,
    });

    expect(result.currency).toBeNull();
  });

  it('fails closed when the profile id does not match the login profile', async () => {
    const client = platform({
      getProfile: vi.fn(async () => ({
        profile: { ...profileResult.profile, id: 99 },
      })),
    });

    await expect(
      createAuthUseCases(client, { now: () => start }).login({
        email: 'player@example.com',
        password,
      }),
    ).rejects.toMatchObject({ name: 'AuthError', code: 'auth_unavailable' });
    expect(client.getProfile).toHaveBeenCalledWith(42, 'login-access-token');
  });

  it('does not keep a session when profile confirmation ends the player session', async () => {
    const client = platform({
      getProfile: vi.fn(async () => {
        throw new PlatformClientError('request_failed', 401, 'session_expired');
      }),
    });

    await expect(
      createAuthUseCases(client, { now: () => start }).login({
        email: 'player@example.com',
        password,
      }),
    ).rejects.toMatchObject({ code: 'auth_unavailable' });
  });

  it.each([
    [new PlatformClientError('request_failed', 401, 'invalid_player_credentials'), 'invalid_credentials'],
    [new PlatformClientError('request_failed', 422), 'invalid_login'],
    [new PlatformClientError('request_failed', 401, 'invalid_signature'), 'auth_unavailable'],
    [new PlatformClientError('request_failed', 500), 'auth_unavailable'],
    [new PlatformClientError('invalid_response'), 'auth_unavailable'],
  ] as const)('maps login failure %s to %s', async (failure, code) => {
    const client = platform({
      login: vi.fn(async () => {
        throw failure;
      }),
    });

    const error: unknown = await createAuthUseCases(client)
      .login({ email: 'player@example.com', password })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AuthError);
    expect(error).toMatchObject({ code });
    expect(JSON.stringify(error)).not.toContain(password);
    expect(client.getProfile).not.toHaveBeenCalled();
  });

  it('does not refresh a session with 300 seconds or more remaining', async () => {
    const client = platform();
    let current = start;
    const useCases = createAuthUseCases(client, { now: () => current });
    const expiresAt = new Date(start + 3_600_000).toISOString();

    current = start + 3_300_000;
    await expect(useCases.refreshIfNeeded(session(expiresAt))).resolves.toEqual({
      action: 'keep',
      session: session(expiresAt),
    });
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('refreshes once when fewer than 300 seconds remain', async () => {
    const client = platform({
      refresh: vi.fn(async () => ({
        access_token: 'refreshed-access-token',
        token_type: 'bearer',
        expires_in: 60,
      })),
    });
    const current = start + 3_300_001;
    const expiresAt = new Date(start + 3_600_000).toISOString();
    const result = await createAuthUseCases(client, { now: () => current }).refreshIfNeeded(
      session(expiresAt),
    );

    expect(client.refresh).toHaveBeenCalledExactlyOnceWith(42, 'current-token');
    expect(result).toEqual({
      action: 'replace',
      session: {
        accessToken: 'refreshed-access-token',
        playerId: '42',
        email: 'player@example.com',
        currency: 'EUR',
        expiresAt: new Date(current + 60_000).toISOString(),
      },
    });
  });

  it('does not refresh an expired session', async () => {
    const client = platform();
    const current = start + 3_600_000;
    const result = await createAuthUseCases(client, { now: () => current }).refreshIfNeeded(
      session(new Date(start + 3_600_000).toISOString()),
    );

    expect(result).toEqual({ action: 'clear' });
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it.each([
    ['session_expired', 401],
    ['token_invalid', 404],
    ['token_missing', 404],
    ['token_refresh_failed', 401],
  ] as const)('clears the session when refresh returns %s', async (platformCode, status) => {
    const client = platform({
      refresh: vi.fn(async () => {
        throw new PlatformClientError('request_failed', status, platformCode);
      }),
    });
    const result = await createAuthUseCases(client, { now: () => start + 3_500_000 }).refreshIfNeeded(
      session(new Date(start + 3_600_000).toISOString()),
    );

    expect(result).toEqual({ action: 'clear' });
    expect(client.refresh).toHaveBeenCalledOnce();
  });

  it.each([
    new PlatformClientError('request_failed', 401, 'invalid_signature'),
    new PlatformClientError('request_failed', 403, 'ip_not_allowed'),
    new PlatformClientError('request_failed', 500),
    new PlatformClientError('request_failed'),
    new PlatformClientError('invalid_response'),
  ])('keeps an unexpired session when refresh fails with %s', async (failure) => {
    const client = platform({
      refresh: vi.fn(async () => {
        throw failure;
      }),
    });
    const current = session(new Date(start + 3_600_000).toISOString());
    const result = await createAuthUseCases(client, { now: () => start + 3_500_000 }).refreshIfNeeded(
      current,
    );

    expect(result).toEqual({ action: 'keep', session: current });
    expect(client.refresh).toHaveBeenCalledOnce();
  });

  it('logs out the session player and treats platform failures as local success', async () => {
    const logout = vi.fn(async () => {
      throw new PlatformClientError('request_failed', 401, 'session_expired');
    });
    const client = platform({ logout });
    const current = session(new Date(start + 3_600_000).toISOString());

    await expect(createAuthUseCases(client).logout(current)).resolves.toBeUndefined();
    expect(logout).toHaveBeenCalledExactlyOnceWith(42, 'current-token');
  });
});
