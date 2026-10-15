import type { PlatformClient, PlatformGameLaunch } from '@brand/platform';
import { PlatformClientError } from '@brand/platform';
import { describe, expect, it, vi } from 'vitest';
import { createGameLaunchUseCases, GameLaunchError } from './index.js';

const launch: PlatformGameLaunch = {
  id: 406,
  name: 'Demo Game',
  slug: 'demo-game',
  provider: 'Studio',
  provider_code: 'studio',
  launch_url: 'https://platform.example/game/play/ticket-123',
  session_id: 'session-secret',
};

function makePlatform(launchDemoGame: PlatformClient['launchDemoGame']): PlatformClient {
  return {
    getRegistrationCountries: vi.fn(),
    getRegistrationCurrencies: vi.fn(),
    register: vi.fn(),
    activateEmail: vi.fn(),
    getGames: vi.fn(),
    getProviders: vi.fn(),
    getCategories: vi.fn(),
    launchDemoGame,
    launchRealGame: vi.fn(),
    requestSportsLaunchTicket: vi.fn(),
    login: vi.fn(),
    authenticateTelegram: vi.fn(),
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
    getRealityCheckSettings: vi.fn(),
    getPlayerRealityCheck: vi.fn(),
    setPlayerRealityCheck: vi.fn(),
    getCoolOffSettings: vi.fn(),
    getSelfExclusionSettings: vi.fn(),
    excludePlayer: vi.fn(),
    getPlayerLogins: vi.fn(),
  };
}

describe('createGameLaunchUseCases', () => {
  it('maps a Platform launch to the browser contract only', async () => {
    const launchDemoGame = vi.fn(async () => launch);
    const result = await createGameLaunchUseCases(makePlatform(launchDemoGame)).launchDemo('406');

    expect(launchDemoGame).toHaveBeenCalledWith('406');
    expect(result).toEqual({
      launchUrl: 'https://platform.example/game/play/ticket-123',
      mode: 'demo',
    });
  });

  it.each([
    [new PlatformClientError('request_failed', 403), 'demo_unavailable'],
    [new PlatformClientError('request_failed', 404), 'game_not_found'],
    [new PlatformClientError('request_failed', 405), 'game_not_found'],
    [new PlatformClientError('request_failed', 401), 'launch_unavailable'],
    [new PlatformClientError('request_failed', 422), 'launch_unavailable'],
    [new PlatformClientError('request_failed', 500), 'launch_unavailable'],
    [new PlatformClientError('request_failed', 503), 'launch_unavailable'],
    [new PlatformClientError('request_failed'), 'launch_unavailable'],
    [new PlatformClientError('invalid_response'), 'launch_unavailable'],
    [new Error('unexpected'), 'launch_unavailable'],
  ] as const)('maps %o to %s', async (failure, code) => {
    const useCases = createGameLaunchUseCases(
      makePlatform(async () => {
        throw failure;
      }),
    );

    const error: unknown = await useCases.launchDemo('406').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GameLaunchError);
    expect(error).toMatchObject({ code, sessionEnded: false });
  });
});

describe('launchReal', () => {
  it('maps a real launch without the wire payload', async () => {
    const launchRealGame = vi.fn(async () => launch);
    const platform = makePlatform(vi.fn());
    platform.launchRealGame = launchRealGame;

    const result = await createGameLaunchUseCases(platform).launchReal('406', 'player-token');

    expect(launchRealGame).toHaveBeenCalledWith('406', 'player-token');
    expect(result).toEqual({
      launchUrl: 'https://platform.example/game/play/ticket-123',
      mode: 'real',
    });
    expect(result).not.toHaveProperty('session_id');
  });

  it.each([
    [new PlatformClientError('request_failed', 401, 'game_launch_authentication_required'), 'auth_required', true],
    [new PlatformClientError('request_failed', 401, 'player_session_expired'), 'auth_required', true],
    [new PlatformClientError('request_failed', 401, 'session_expired'), 'auth_required', true],
    [new PlatformClientError('request_failed', 404, 'token_invalid'), 'auth_required', true],
    [new PlatformClientError('request_failed', 404, 'token_missing'), 'auth_required', true],
    [new PlatformClientError('request_failed', 401, 'invalid_signature'), 'auth_required', false],
    [new PlatformClientError('request_failed', 403, 'game_unavailable'), 'game_unavailable', false],
    [new PlatformClientError('request_failed', 403, 'player_not_active'), 'account_restricted', false],
    [new PlatformClientError('request_failed', 403, 'player_has_excluded'), 'account_restricted', false],
    [new PlatformClientError('request_failed', 404, 'game_not_found'), 'game_not_found', false],
    [new PlatformClientError('request_failed', 405, 'game_not_found'), 'game_not_found', false],
    [new PlatformClientError('request_failed', 422, 'invalid_game_play_mode'), 'launch_unavailable', false],
    [new PlatformClientError('request_failed', 500), 'launch_unavailable', false],
    [new PlatformClientError('invalid_response'), 'launch_unavailable', false],
  ] as const)('maps %o to %s', async (failure, code, sessionEnded) => {
    const platform = makePlatform(vi.fn());
    platform.launchRealGame = vi.fn(async () => {
      throw failure;
    });
    const error: unknown = await createGameLaunchUseCases(platform)
      .launchReal('406', 'player-token')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GameLaunchError);
    expect(error).toMatchObject({ code, sessionEnded });
    expect(JSON.stringify(error)).not.toContain('player-token');
  });
});
