import type { PlatformClient, PlatformLoginResponse } from '@brand/platform';
import { PlatformClientError } from '@brand/platform';
import { describe, expect, it, vi } from 'vitest';
import { createExternalAuthUseCases, ExternalAuthError } from './external-auth.js';

const start = 1_700_000_000_000;
const session: PlatformLoginResponse = {
  profile: {
    id: 42,
    email: 'ada@example.com',
    currency: { id: 1, name: 'Euro', code: 'EUR', symbol: '€' },
  },
  access_token: 'access-token',
  token_type: 'bearer',
  expires_in: 3600,
};

function platform(overrides: Partial<PlatformClient> = {}): PlatformClient {
  return {
    listExternalAuthMethods: vi.fn(async () => [
      { code: 'telegram', name: 'Telegram', type: 'redirect' as const },
    ]),
    startExternalAuth: vi.fn(async () => ({
      authentication_id: 'AUTH_server',
      redirect_url: 'https://oauth.telegram.org/auth',
      expires_in: 300,
    })),
    exchangeExternalAuth: vi.fn(),
    completeExternalOnboarding: vi.fn(async () => session),
    getProfile: vi.fn(async () => ({ profile: session.profile })),
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
    authenticateTelegram: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
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

describe('external auth use cases', () => {
  it('does not start a method the platform did not list', async () => {
    const client = platform();
    await expect(
      createExternalAuthUseCases(client).start({
        method: 'google',
        returnUrl: 'http://localhost:3000/auth/callback',
        clientState: 'a'.repeat(32),
      }),
    ).rejects.toMatchObject({ code: 'external_auth_unavailable' });
    expect(client.startExternalAuth).not.toHaveBeenCalled();
  });

  it('returns onboarding details and seals a session from an authenticated exchange', async () => {
    const client = platform({
      exchangeExternalAuth: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'onboarding_required',
          onboarding_token: 'OB_server',
          expires_in: 1800,
          required_fields: ['email', 'country'],
          prefill: { first_name: 'Ada' },
        })
        .mockResolvedValueOnce({ status: 'authenticated', session }),
    });
    const cases = createExternalAuthUseCases(client, { now: () => start });
    await expect(
      cases.exchange({ ticket: 'LT_ticket_value', authenticationId: 'AUTH_server' }),
    ).resolves.toMatchObject({
      status: 'onboarding_required',
      onboarding: { token: 'OB_server', prefill: { first_name: 'Ada' } },
    });
    await expect(
      cases.exchange({ ticket: 'LT_ticket_value', authenticationId: 'AUTH_server' }),
    ).resolves.toMatchObject({
      status: 'authenticated',
      session: { playerId: '42', email: 'ada@example.com', accessToken: 'access-token' },
    });
  });

  it('keeps the issued session when the follow-up profile read fails', async () => {
    const client = platform({
      exchangeExternalAuth: vi.fn(async () => ({ status: 'authenticated' as const, session })),
      getProfile: vi.fn(async () => {
        throw new PlatformClientError('request_failed', 503);
      }),
    });
    const result = await createExternalAuthUseCases(client, { now: () => start }).exchange({
      ticket: 'LT_ticket_value',
      authenticationId: 'AUTH_server',
    });
    expect(result).toMatchObject({
      status: 'authenticated',
      session: { playerId: '42', accessToken: 'access-token' },
    });
  });

  it('maps an expired ticket and rejects a missing required onboarding field before Platform', async () => {
    const client = platform({
      exchangeExternalAuth: vi.fn(async () => {
        throw new PlatformClientError('request_failed', 410, 'authentication_ticket_expired');
      }),
    });
    const cases = createExternalAuthUseCases(client, { now: () => start });
    await expect(
      cases.exchange({ ticket: 'LT_ticket_value', authenticationId: 'AUTH_server' }),
    ).rejects.toMatchObject({ code: 'external_auth_expired' });
    await expect(
      cases.completeOnboarding({
        token: 'OB_server',
        requiredFields: ['email', 'country', 'date_of_birth', 'currency'],
        values: { first_name: 'Ada', email: 'not-an-email' },
      }),
    ).rejects.toBeInstanceOf(ExternalAuthError);
    expect(client.completeExternalOnboarding).not.toHaveBeenCalled();
  });

  it('submits required fields and edited prefill without a password', async () => {
    const client = platform();
    await createExternalAuthUseCases(client, { now: () => start }).completeOnboarding({
      token: 'OB_server',
      requiredFields: ['email', 'country', 'date_of_birth', 'currency'],
      values: {
        email: 'Ada@Example.com',
        country: 'mt',
        date_of_birth: '1990-01-02',
        currency: 'eur',
        first_name: 'Ada',
        last_name: 'Lovelace',
      },
    });
    expect(client.completeExternalOnboarding).toHaveBeenCalledWith({
      onboardingToken: 'OB_server',
      player: {
        email: 'ada@example.com',
        country: 'MT',
        date_of_birth: '1990-01-02',
        currency: 'EUR',
        first_name: 'Ada',
        last_name: 'Lovelace',
      },
    });
  });

  it('sends a Google phone with the prefilled profile and rejects a prefix from another country', async () => {
    const client = platform();
    const cases = createExternalAuthUseCases(client, { now: () => start });
    await expect(
      cases.completeOnboarding({
        token: 'OB_server',
        requiredFields: ['email', 'country', 'phone_prefix', 'phone'],
        values: {
          email: 'ada@example.com',
          country: 'GB',
          first_name: 'Ada',
          phone_prefix: '49',
          phone: '7700900123',
        },
      }),
    ).rejects.toMatchObject({ code: 'invalid_onboarding', fields: ['phone_prefix'] });
    expect(client.completeExternalOnboarding).not.toHaveBeenCalled();

    await cases.completeOnboarding({
      token: 'OB_server',
      requiredFields: ['email', 'country', 'phone_prefix', 'phone'],
      values: {
        email: 'ada@example.com',
        country: 'GB',
        first_name: 'Ada',
        phone_prefix: '44',
        phone: '7700900123',
      },
    });
    expect(client.completeExternalOnboarding).toHaveBeenCalledWith({
      onboardingToken: 'OB_server',
      player: {
        email: 'ada@example.com',
        country: 'GB',
        first_name: 'Ada',
        phone_prefix: '44',
        phone: '7700900123',
      },
    });
  });
});
