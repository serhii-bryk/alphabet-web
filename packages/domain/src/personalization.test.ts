import type { PlatformClient, PlatformGame } from '@brand/platform';
import { PlatformClientError } from '@brand/platform';
import { describe, expect, it, vi } from 'vitest';
import { createPersonalizationUseCases, mapFavoriteGames, mapPlayedPage } from './index.js';
import type { PlayerSession } from './index.js';

const game = (id: number, type: PlatformGame['type'] = 'slots'): PlatformGame => ({
  id,
  provider_id: 3,
  provider_name: 'Provider',
  provider_category_id: null,
  provider_game_id: `provider-${id}`,
  name: `Game ${id}`,
  slug: `game-${id}`,
  type,
  provider_game_type: null,
  icon: null,
  rtp: null,
  volatility: null,
  is_active: 1,
  demo_play_enabled: 1,
  created_at: null,
  updated_at: null,
  provider: null,
  categories: [],
});

const session: PlayerSession = {
  accessToken: 'current-token',
  playerId: '42',
  email: 'player@example.com',
  currency: 'EUR',
  expiresAt: '2026-10-08T18:00:00.000Z',
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
    ...overrides,
  };
}

const playedPage = {
  current_page: 2,
  data: [
    { ...game(3), played: 4, last_played: '2026-03-01T00:00:00.000Z' },
    game(8),
    { ...game(1), played: 9, rounds: 15, last_played: null },
  ],
  first_page_url: 'https://platform.example/page/1',
  from: 11,
  last_page: 5,
  last_page_url: 'https://platform.example/page/5',
  links: [],
  next_page_url: 'https://platform.example/page/3',
  path: 'https://platform.example/page',
  per_page: 10,
  prev_page_url: 'https://platform.example/page/1',
  to: 20,
  total: 44,
};

describe('personalization mapping', () => {
  it('keeps Platform order and drops games with a null type', () => {
    const games = mapFavoriteGames([game(3), game(8, null), game(1)]);

    expect(games.map((item) => item.id)).toEqual(['3', '1']);
    expect(games[0]).not.toHaveProperty('played');
    expect(games[0]).not.toHaveProperty('rounds');
    expect(games[0]).not.toHaveProperty('lastPlayed');
    expect(JSON.stringify(games)).not.toContain('provider-');
  });

  it('attaches stats only when Platform returned them and maps real pagination', () => {
    const favorites = mapFavoriteGames([game(3)]);
    const played = mapPlayedPage({
      ...playedPage,
      data: [
        { ...game(3), played: 4, last_played: '2026-03-01T00:00:00.000Z' },
        { ...game(8), type: null, played: 1, last_played: null },
        { ...game(1), played: 9, rounds: 15, last_played: null },
      ],
    });

    expect(favorites[0]).not.toHaveProperty('played');
    expect(played.games.map((item) => item.id)).toEqual(['3', '1']);
    expect(played.games[0]).toMatchObject({ played: 4, lastPlayed: '2026-03-01T00:00:00.000Z' });
    expect(played.games[0]).not.toHaveProperty('rounds');
    expect(played.games[1]).toMatchObject({ played: 9, rounds: 15, lastPlayed: null });
    expect(played.pagination).toEqual({
      page: 2,
      perPage: 10,
      total: 44,
      lastPage: 5,
      from: 11,
      to: 20,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });
});

describe('createPersonalizationUseCases', () => {
  it('uses the session player and preserves mapped favorites', async () => {
    const client = platform({
      listFavorites: vi.fn(async () => ({
        count: 3,
        items: [game(3), game(8, null), game(1)],
      })),
    });

    const result = await createPersonalizationUseCases(client).listFavorites(session);

    expect(client.listFavorites).toHaveBeenCalledWith(42, 'current-token');
    expect(result.games.map((item) => item.id)).toEqual(['3', '1']);
    expect(result).not.toHaveProperty('pagination');
  });

  it('forwards played filters from the session and does not accept another player id', async () => {
    const client = platform({
      lastPlayed: vi.fn(async () => ({
        ...playedPage,
        data: [
          { ...game(3), played: 4, last_played: '2026-03-01T00:00:00.000Z' },
          { ...game(1), played: 9, last_played: null },
        ],
      })),
      mostPlayed: vi.fn(async () => ({
        ...playedPage,
        data: [{ ...game(1), played: 9, rounds: 15, last_played: null }],
      })),
      addFavorite: vi.fn(async () => ({ game_id: 12 })),
    });
    const cases = createPersonalizationUseCases(client);

    await cases.lastPlayed(session, { page: 2, limit: 12, startDate: '2026-01-01' });
    await cases.mostPlayed(session, { order: 'asc', played: 2, rounds: 4 });
    await cases.addFavorite(session, 12);

    expect(client.lastPlayed).toHaveBeenCalledWith(42, 'current-token', {
      page: 2,
      limit: 12,
      order: 'desc',
      startDate: '2026-01-01',
    });
    expect(client.mostPlayed).toHaveBeenCalledWith(42, 'current-token', {
      order: 'asc',
      played: 2,
      rounds: 4,
    });
    expect(client.addFavorite).toHaveBeenCalledWith(42, 'current-token', 12);
  });

  it('turns an ended player session into session_ended', async () => {
    const client = platform({
      listFavorites: vi.fn(async () => {
        throw new PlatformClientError('request_failed', 401, 'session_expired');
      }),
    });

    await expect(createPersonalizationUseCases(client).listFavorites(session)).rejects.toMatchObject({
      code: 'session_ended',
    });
  });
});
