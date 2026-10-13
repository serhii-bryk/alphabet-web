import type { PlatformClient, PlatformGame, PlatformGamesPage } from '@brand/platform';
import { describe, expect, it, vi } from 'vitest';
import { createCatalogUseCases } from './index.js';

function game(overrides: Partial<PlatformGame> = {}): PlatformGame {
  return {
    id: 1,
    provider_id: 1,
    provider_name: 'Studio',
    provider_category_id: 4,
    provider_game_id: 'ext-1',
    name: 'Sample',
    slug: 'sample',
    type: 'slots',
    provider_game_type: 'videoslot',
    icon: null,
    rtp: null,
    volatility: null,
    is_active: 1,
    demo_play_enabled: 1,
    created_at: null,
    updated_at: null,
    provider: null,
    categories: [],
    ...overrides,
  };
}

function page(data: PlatformGame[], overrides: Partial<PlatformGamesPage> = {}): PlatformGamesPage {
  const total = overrides.total ?? data.length;
  const perPage = overrides.per_page ?? 50;
  const current = overrides.current_page ?? 1;
  return {
    current_page: current,
    data,
    first_page_url: 'https://platform.example/games?page=1',
    from: data.length ? 1 : null,
    last_page: total === 0 ? 0 : Math.ceil(total / perPage),
    last_page_url: 'https://platform.example/games?page=1',
    links: [],
    next_page_url: null,
    path: 'https://platform.example/games',
    per_page: perPage,
    prev_page_url: null,
    to: data.length ? data.length : null,
    total,
    ...overrides,
  };
}

function client(getGames: PlatformClient['getGames']): PlatformClient {
  return { getGames } as PlatformClient;
}

describe('catalog category resolution', () => {
  it('keeps Platform category pages when the relation filter returns games', async () => {
    const linked = game({
      id: 7,
      name: 'Linked Table',
      categories: [{ id: 4, slug: 'tables', full_slug: 'live/tables', name: 'Tables', parent_id: null }],
    });
    const getGames = vi.fn(async () => page([linked], { total: 1, per_page: 20 }));
    const catalog = createCatalogUseCases(client(getGames));

    const result = await catalog.listGames({ category: 'tables', page: 1, perPage: 20 });

    expect(getGames).toHaveBeenCalledTimes(1);
    expect(result.games.map((item) => item.id)).toEqual(['7']);
    expect(result.pagination.total).toBe(1);
  });

  it('treats a real empty Platform category as empty when games already have category relations', async () => {
    const linked = game({
      categories: [{ id: 1, slug: 'slots', full_slug: 'slots', name: 'Slots', parent_id: null }],
    });
    const getGames = vi.fn(async (filters) => {
      if (filters?.category) return page([], { total: 0, per_page: filters.perPage ?? 50 });
      return page([linked], { total: 1, per_page: filters?.perPage ?? 50 });
    });
    const catalog = createCatalogUseCases(client(getGames));

    const result = await catalog.listGames({ category: 'missing', type: 'slots' });

    expect(result.games).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(getGames).toHaveBeenCalledTimes(2);
  });

  it('matches stage games by provider type and title when category relations are empty', async () => {
    const slots = game({ id: 10, name: 'Genie Fortunes', provider_game_type: 'videoslot' });
    const crash = game({ id: 11, name: 'Hamster Crash', provider_game_type: 'casino' });
    const roulette = game({
      id: 12,
      name: 'Ruleta en Vivo',
      type: 'live-casino',
      provider_game_type: 'roulette',
    });
    const blackjack = game({
      id: 13,
      name: 'Blackjack A',
      type: 'live-casino',
      provider_game_type: 'live',
    });
    const catalogGames = [slots, crash, roulette, blackjack];
    const getGames = vi.fn(async (filters) => {
      if (filters?.category) return page([], { total: 0, per_page: 50 });
      const typed = catalogGames.filter((item) => !filters?.type || item.type === filters.type);
      return page(typed, { total: typed.length, per_page: filters?.perPage ?? 50, last_page: 1 });
    });
    const catalog = createCatalogUseCases(client(getGames));

    const slotPage = await catalog.listGames({ category: 'slots', type: 'slots' });
    const crashPage = await catalog.listGames({ category: 'crash-games', type: 'slots' });
    const liveBlackjack = await catalog.listGames({ category: 'live-blackjack', type: 'live-casino' });
    const liveRoulette = await catalog.listGames({ category: 'live-roulette', type: 'live-casino', page: 1 });

    expect(slotPage.games.map((item) => item.id)).toEqual(['10']);
    expect(crashPage.games.map((item) => item.title)).toEqual(['Hamster Crash']);
    expect(liveBlackjack.games.map((item) => item.id)).toEqual(['13']);
    expect(liveRoulette.games.map((item) => item.id)).toEqual(['12']);
  });

  it('paginates the matched category and reuses one scan', async () => {
    const games = Array.from({ length: 3 }, (_, index) =>
      game({ id: index + 1, name: `Slot ${index + 1}`, provider_game_type: 'vs' }),
    );
    const getGames = vi.fn(async (filters) => {
      if (filters?.category) return page([], { total: 0, per_page: 2 });
      return page(games, { total: games.length, per_page: filters?.perPage ?? 50, last_page: 1 });
    });
    const catalog = createCatalogUseCases(client(getGames));

    const first = await catalog.listGames({ category: 'slots', type: 'slots', page: 1, perPage: 2 });
    const callsAfterFirst = getGames.mock.calls.length;
    const second = await catalog.listGames({ category: 'slots', type: 'slots', page: 2, perPage: 2 });

    expect(first.games.map((item) => item.id)).toEqual(['1', '2']);
    expect(first.pagination).toMatchObject({ page: 1, total: 3, lastPage: 2, hasNextPage: true });
    expect(second.games.map((item) => item.id)).toEqual(['3']);
    expect(second.pagination).toMatchObject({ page: 2, hasPreviousPage: true, hasNextPage: false });
    expect(getGames.mock.calls.length).toBe(callsAfterFirst);
  });
});
