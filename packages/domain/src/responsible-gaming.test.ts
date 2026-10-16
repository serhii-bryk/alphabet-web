import type { PlatformClient } from '@brand/platform';
import { PlatformClientError } from '@brand/platform';
import { describe, expect, it, vi } from 'vitest';
import type { PlayerSession } from './index.js';
import { createResponsibleGamingUseCases, ResponsibleGamingError } from './responsible-gaming.js';

const session: PlayerSession = {
  accessToken: 'player-token',
  playerId: '42',
  email: 'player@example.com',
  currency: 'EUR',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

const realitySettings = { values: [0, 15, 30, 60] };
const coolOffSettings = {
  periods: [
    { id: 1, text: '24 hours', date_selector: false },
    { id: 3, text: 'Pick a date', date_selector: true },
  ],
  reasons: [{ id: 10, text: 'Need a break' }],
};
const selfExclusionSettings = {
  periods: [
    { id: 2, text: '6 months', date_selector: false },
    { id: 4, text: 'Permanent', date_selector: true },
  ],
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
    login: vi.fn(),
    authenticateTelegram: vi.fn(),
    listExternalAuthMethods: vi.fn(async () => []),
    startExternalAuth: vi.fn(),
    exchangeExternalAuth: vi.fn(),
    completeExternalOnboarding: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getProfile: vi.fn(),
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
    getRealityCheckSettings: vi.fn(async () => realitySettings),
    getPlayerRealityCheck: vi.fn(async () => ({ value: 30 })),
    setPlayerRealityCheck: vi.fn(async () => ({ value: 0 })),
    getCoolOffSettings: vi.fn(async () => coolOffSettings),
    getSelfExclusionSettings: vi.fn(async () => selfExclusionSettings),
    excludePlayer: vi.fn(async () => ({
      type: 'cooloff' as const,
      period: '24 hours',
      reason: null,
      status: 'CoolOff' as const,
      expires_at: '2026-10-16T12:00:00.000Z',
      created_at: '2026-10-15T12:00:00.000Z',
    })),
    getPlayerLogins: vi.fn(async () => ({ logins: [{ login_at: '2026-10-15T10:00:00.000Z' }] })),
    ...overrides,
  };
}

describe('responsible gaming use cases', () => {
  it('maps the three settings payloads onto the catalog', async () => {
    const client = platform();
    const result = await createResponsibleGamingUseCases(client).catalog();

    expect(client.getRealityCheckSettings).toHaveBeenCalledOnce();
    expect(client.getCoolOffSettings).toHaveBeenCalledOnce();
    expect(client.getSelfExclusionSettings).toHaveBeenCalledOnce();
    expect(result).toEqual({
      realityCheckIntervals: [0, 15, 30, 60],
      coolOffPeriods: [
        { id: 1, text: '24 hours', dateSelector: false },
        { id: 3, text: 'Pick a date', dateSelector: true },
      ],
      coolOffReasons: [{ id: 10, text: 'Need a break' }],
      selfExclusionPeriods: [
        { id: 2, text: '6 months', dateSelector: false },
        { id: 4, text: 'Permanent', dateSelector: true },
      ],
    });
  });

  it('rejects a reality-check interval that is not in the live settings list', async () => {
    const client = platform();
    const useCases = createResponsibleGamingUseCases(client);

    await expect(useCases.setRealityCheck(session, 45)).rejects.toMatchObject({
      name: 'ResponsibleGamingError',
      code: 'invalid_interval',
    });
    expect(client.setPlayerRealityCheck).not.toHaveBeenCalled();
  });

  it('allows zero minutes when the partner list includes reminders off', async () => {
    const client = platform();
    const result = await createResponsibleGamingUseCases(client).setRealityCheck(session, 0);

    expect(result).toEqual({ intervalMinutes: 0 });
    expect(client.setPlayerRealityCheck).toHaveBeenCalledExactlyOnceWith(42, 'player-token', 0);
  });

  it('refuses a date_selector period before posting an exclusion', async () => {
    const client = platform();
    const useCases = createResponsibleGamingUseCases(client);

    await expect(useCases.coolOff(session, { periodId: 3 })).rejects.toBeInstanceOf(ResponsibleGamingError);
    await expect(useCases.coolOff(session, { periodId: 3 })).rejects.toMatchObject({ code: 'invalid_period' });
    await expect(useCases.selfExclude(session, { periodId: 4 })).rejects.toMatchObject({
      code: 'invalid_period',
    });
    expect(client.excludePlayer).not.toHaveBeenCalled();
  });

  it('refuses a cool-off period on self-exclusion and the reverse', async () => {
    const client = platform();
    const useCases = createResponsibleGamingUseCases(client);

    await expect(useCases.coolOff(session, { periodId: 2 })).rejects.toMatchObject({ code: 'invalid_period' });
    await expect(useCases.selfExclude(session, { periodId: 1 })).rejects.toMatchObject({
      code: 'invalid_period',
    });
    expect(client.excludePlayer).not.toHaveBeenCalled();
  });

  it('omits reason_id when cool-off has no reason and sends it when one is chosen', async () => {
    const excludePlayer = vi.fn(async () => ({
      type: 'cooloff' as const,
      period: '24 hours',
      reason: 'Need a break',
      status: 'CoolOff' as const,
      expires_at: '2026-10-16T12:00:00.000Z',
      created_at: '2026-10-15T12:00:00.000Z',
    }));
    const client = platform({ excludePlayer });
    const useCases = createResponsibleGamingUseCases(client);

    await useCases.coolOff(session, { periodId: 1 });
    expect(excludePlayer).toHaveBeenLastCalledWith(42, 'player-token', { period_id: 1 });
    expect(excludePlayer.mock.calls[0]?.[2]).not.toHaveProperty('reason_id');

    await useCases.coolOff(session, { periodId: 1, reasonId: 10 });
    expect(excludePlayer).toHaveBeenLastCalledWith(42, 'player-token', {
      period_id: 1,
      reason_id: 10,
    });
  });

  it('rejects an unknown cool-off reason before posting', async () => {
    const client = platform();
    await expect(createResponsibleGamingUseCases(client).coolOff(session, { periodId: 1, reasonId: 99 })).rejects.toMatchObject({
      code: 'invalid_reason',
    });
    expect(client.excludePlayer).not.toHaveBeenCalled();
  });

  it('maps exclusion fields and never sends a reason for self-exclusion', async () => {
    const excludePlayer = vi.fn(async (_playerId: number, _token: string, input: { period_id: number }) => {
      if (input.period_id === 2) {
        return {
          type: 'self_exclusion' as const,
          period: '6 months',
          reason: null,
          status: 'SelfExclusion' as const,
          expires_at: null,
          created_at: '2026-10-15T12:00:00.000Z',
        };
      }
      return {
        type: 'cooloff' as const,
        period: '24 hours',
        reason: 'Need a break',
        status: 'CoolOff' as const,
        expires_at: '2026-10-16T12:00:00.000Z',
        created_at: '2026-10-15T12:00:00.000Z',
      };
    });
    const client = platform({ excludePlayer });
    const useCases = createResponsibleGamingUseCases(client);

    await expect(useCases.coolOff(session, { periodId: 1, reasonId: 10 })).resolves.toEqual({
      kind: 'cool_off',
      periodText: '24 hours',
      reasonText: 'Need a break',
      status: 'CoolOff',
      expiresAt: '2026-10-16T12:00:00.000Z',
      createdAt: '2026-10-15T12:00:00.000Z',
      sessionEnded: true,
    });
    await expect(useCases.selfExclude(session, { periodId: 2 })).resolves.toEqual({
      kind: 'self_exclusion',
      periodText: '6 months',
      reasonText: null,
      status: 'SelfExclusion',
      expiresAt: null,
      createdAt: '2026-10-15T12:00:00.000Z',
      sessionEnded: true,
    });
    expect(excludePlayer).toHaveBeenLastCalledWith(42, 'player-token', { period_id: 2 });
    expect(excludePlayer.mock.calls[1]?.[2]).not.toHaveProperty('reason_id');
  });

  it('maps a missing exclusion period from Platform to invalid_period', async () => {
    const client = platform({
      excludePlayer: vi.fn(async () => {
        throw new PlatformClientError('request_failed', 404, 'responsible_gaming_period_not_found');
      }),
    });

    await expect(createResponsibleGamingUseCases(client).coolOff(session, { periodId: 1 })).rejects.toMatchObject({
      code: 'invalid_period',
    });
  });

  it('returns the platform login time and does not invent one when logins fail', async () => {
    const client = platform();
    const useCases = createResponsibleGamingUseCases(client);

    await expect(useCases.sessionClock(session)).resolves.toEqual({
      startedAt: '2026-10-15T10:00:00.000Z',
      source: 'platform_login',
    });
    expect(client.getPlayerLogins).toHaveBeenCalledExactlyOnceWith(42, 1);

    const empty = platform({ getPlayerLogins: vi.fn(async () => ({ logins: [] })) });
    await expect(createResponsibleGamingUseCases(empty).sessionClock(session)).resolves.toEqual({
      startedAt: null,
      source: 'unavailable',
    });

    const failed = platform({
      getPlayerLogins: vi.fn(async () => {
        throw new PlatformClientError('request_failed', 500);
      }),
    });
    await expect(createResponsibleGamingUseCases(failed).sessionClock(session)).resolves.toEqual({
      startedAt: null,
      source: 'unavailable',
    });
  });
});
