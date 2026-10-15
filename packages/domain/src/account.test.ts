import type { PlatformClient, PlatformProfileResponse } from '@brand/platform';
import { PlatformClientError } from '@brand/platform';
import { describe, expect, it, vi } from 'vitest';
import { AccountError, createAccountUseCases } from './index.js';
import type { PlayerSession } from './index.js';

const profileResult: PlatformProfileResponse = {
  profile: {
    id: 42,
    email: 'player@example.com',
    first_name: 'Test',
    last_name: 'Player',
    currency: { id: 2, name: 'Euro', code: 'EUR', symbol: '€' },
    country: { alpha2: 'MT' },
    email_verified: true,
  },
};

function session(overrides: Partial<PlayerSession> = {}): PlayerSession {
  return {
    accessToken: 'current-token',
    playerId: '42',
    email: 'player@example.com',
    currency: 'EUR',
    expiresAt: '2026-10-08T18:00:00.000Z',
    ...overrides,
  };
}

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
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getProfile: vi.fn(async () => profileResult),
    getBalance: vi.fn(async () => ({ balance: 12.5, currency: 'EUR' })),
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
    getRealityCheckSettings: vi.fn(),
    getPlayerRealityCheck: vi.fn(),
    setPlayerRealityCheck: vi.fn(),
    getCoolOffSettings: vi.fn(),
    getSelfExclusionSettings: vi.fn(),
    excludePlayer: vi.fn(),
    getPlayerLogins: vi.fn(),
    ...overrides,
  };
}

describe('createAccountUseCases', () => {
  it('maps profile fields and drops everything else', async () => {
    const client = platform();
    const result = await createAccountUseCases(client).getProfile(session());

    expect(client.getProfile).toHaveBeenCalledWith(42, 'current-token');
    expect(result).toEqual({
      playerId: '42',
      email: 'player@example.com',
      firstName: 'Test',
      lastName: 'Player',
      currency: 'EUR',
      countryCode: 'MT',
      emailVerified: true,
    });
    expect(result).not.toHaveProperty('address');
    expect(result).not.toHaveProperty('phone');
  });

  it('defaults missing profile details', async () => {
    const client = platform({
      getProfile: vi.fn(async () => ({
        profile: { id: 42, email: 'player@example.com', currency: null },
      })),
    });

    await expect(createAccountUseCases(client).getProfile(session())).resolves.toEqual({
      playerId: '42',
      email: 'player@example.com',
      firstName: '',
      lastName: '',
      currency: null,
      countryCode: null,
      emailVerified: false,
    });
  });

  it('maps balance without the platform address', async () => {
    const client = platform();
    const result = await createAccountUseCases(client).getBalance(session());

    expect(client.getBalance).toHaveBeenCalledWith(42, 'current-token');
    expect(result).toEqual({ balance: 12.5, currency: 'EUR' });
  });

  it('rejects a profile for a different player', async () => {
    const client = platform({
      getProfile: vi.fn(async () => ({
        profile: { ...profileResult.profile, id: 99 },
      })),
    });

    await expect(createAccountUseCases(client).getProfile(session())).rejects.toMatchObject({
      name: 'AccountError',
      code: 'account_unavailable',
    });
  });

  it.each([
    ['session_expired', 401],
    ['token_invalid', 404],
    ['token_missing', 404],
    ['token_refresh_failed', 401],
    ['player_session_expired', 401],
  ] as const)('maps profile %s to session_ended', async (platformCode, status) => {
    const client = platform({
      getProfile: vi.fn(async () => {
        throw new PlatformClientError('request_failed', status, platformCode);
      }),
    });
    const error: unknown = await createAccountUseCases(client)
      .getProfile(session())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AccountError);
    expect(error).toMatchObject({ code: 'session_ended' });
  });

  it('maps other profile failures to account_unavailable', async () => {
    const client = platform({
      getProfile: vi.fn(async () => {
        throw new PlatformClientError('request_failed', 500, 'upstream_secret');
      }),
    });
    const error: unknown = await createAccountUseCases(client)
      .getBalance(session({ playerId: '0' }))
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'session_ended' });

    const unavailable: unknown = await createAccountUseCases(client)
      .getProfile(session())
      .catch((caught: unknown) => caught);
    expect(unavailable).toMatchObject({ code: 'account_unavailable' });
    expect(JSON.stringify(unavailable)).not.toContain('upstream_secret');
    expect(JSON.stringify(unavailable)).not.toContain('current-token');
  });
});
