import type { CatalogGameFilters } from '@brand/contracts';
import type { PlatformClient, PlatformGame, PlatformGamesPage } from '@brand/platform';

const SCAN_PAGE_SIZE = 100;
const PROBE_PAGE_SIZE = 20;
const MAX_SCAN_PAGES = 40;
const CACHE_MS = 60_000;

const SLOT_TYPES = new Set(['vs', 'videoslot', 'videoslots', 'slots', 'slot', 'gridslot', 'cs']);
const BLACKJACK_TYPES = new Set(['blackjack', 'bj', 'deluxeblackjack', 'boundlessblackjack']);
const ROULETTE_TYPES = new Set(['roulette']);
const BACCARAT_TYPES = new Set(['baccarat', 'bac']);
const POKER_TYPES = new Set(['poker', 'vp']);
const SHOW_TYPES = new Set(['gameshow', 'gameshows']);
const TABLE_TYPES = new Set(['table', 'tablegame', 'cards', 'sicbo', 'fishprawncrab', 'xocdia', 'dtx', 'mw']);

export interface CatalogScanCache {
  games: Map<string, { at: number; games: PlatformGame[] }>;
  inflight: Map<string, Promise<PlatformGame[]>>;
  /** True when Platform category relations are empty for this filter set. */
  unlinked: Map<string, number>;
}

export function createCatalogScanCache(): CatalogScanCache {
  return { games: new Map(), inflight: new Map(), unlinked: new Map() };
}

function providerType(game: PlatformGame): string {
  return (game.provider_game_type ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function addExplicitCategories(tags: Set<string>, game: PlatformGame) {
  for (const category of game.categories) {
    if (category.slug) tags.add(category.slug);
    for (const part of category.full_slug.split('/')) {
      if (part) tags.add(part);
    }
  }
}

/**
 * Platform `/games?category=` matches system-category rows. Stage games currently
 * return an empty `categories` array and are classified by provider game type
 * and title instead. Tags cover both shapes.
 */
export function gameCategorySlugs(game: PlatformGame): Set<string> {
  const tags = new Set<string>();
  if (game.categories.length > 0) {
    addExplicitCategories(tags, game);
    return tags;
  }

  const type = providerType(game);
  const name = game.name.toLowerCase();
  const live = game.type === 'live-casino';
  const blackjack = BLACKJACK_TYPES.has(type) || /black\s*jack|\bbj\b/.test(name);
  const roulette = ROULETTE_TYPES.has(type) || /roulette|ruleta|\brulet/.test(name);
  const baccarat = BACCARAT_TYPES.has(type) || /baccarat|bacar[aá]|\bbacc\b/.test(name);
  const poker = POKER_TYPES.has(type) || /\bpoker\b/.test(name);
  const show = SHOW_TYPES.has(type) || /game show|crazy time|monopoly|dream catcher|mega ball/.test(name);
  const crash = type === 'crash' || /\bcrash\b/.test(name);
  const instant =
    !roulette &&
    !blackjack &&
    (type === 'instant' || type === 'instantwin' || /instant win/.test(name));

  if (live) tags.add('live-casino');
  if (blackjack) {
    tags.add(live ? 'live-blackjack' : 'blackjack');
    if (!live) tags.add('table-games');
  }
  if (roulette) {
    tags.add(live ? 'live-roulette' : 'roulette');
    if (!live) tags.add('table-games');
  }
  if (baccarat) {
    tags.add('baccarat');
    tags.add('table-games');
  }
  if (poker) {
    tags.add('poker');
    tags.add('table-games');
  }
  if (show) tags.add('game-shows');
  if (crash) tags.add('crash-games');
  if (instant) tags.add('instant-win');

  const specific = blackjack || roulette || baccarat || poker || show || crash || instant;
  if (!specific) {
    if (SLOT_TYPES.has(type) || (!live && (type === 'casino' || type === ''))) tags.add('slots');
    if (TABLE_TYPES.has(type)) tags.add(live ? 'live-casino' : 'table-games');
    if (!live && tags.size === 0) tags.add('slots');
  }

  return tags;
}

export function gameMatchesCategory(game: PlatformGame, category: string): boolean {
  if (game.type === null) return false;
  return gameCategorySlugs(game).has(category);
}

function scanKey(filters: CatalogGameFilters): string {
  return JSON.stringify({
    search: filters.search ?? '',
    provider: filters.provider ?? '',
    groupedProvider: filters.groupedProvider ?? '',
    type: filters.type ?? '',
  });
}

function catalogFilters(filters: CatalogGameFilters): CatalogGameFilters {
  return {
    search: filters.search,
    provider: filters.provider,
    groupedProvider: filters.groupedProvider,
    type: filters.type,
  };
}

function pageFromGames(games: PlatformGame[], page: number, perPage: number): PlatformGamesPage {
  const total = games.length;
  const lastPage = total === 0 ? 0 : Math.ceil(total / perPage);
  const current = lastPage === 0 ? 1 : Math.min(Math.max(page, 1), lastPage);
  const start = (current - 1) * perPage;
  const data = games.slice(start, start + perPage);
  return {
    current_page: current,
    data,
    first_page_url: '',
    from: data.length === 0 ? null : start + 1,
    last_page: lastPage,
    last_page_url: '',
    links: [],
    next_page_url: current < lastPage ? 'next' : null,
    path: '',
    per_page: perPage,
    prev_page_url: current > 1 && lastPage > 0 ? 'prev' : null,
    to: data.length === 0 ? null : start + data.length,
    total,
  };
}

async function scanGames(
  platform: PlatformClient,
  filters: CatalogGameFilters,
  cache: CatalogScanCache,
): Promise<PlatformGame[]> {
  const key = scanKey(filters);
  const hit = cache.games.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.games;
  const pending = cache.inflight.get(key);
  if (pending) return pending;

  const load = (async () => {
    const base = catalogFilters(filters);
    const first = await platform.getGames({ ...base, page: 1, perPage: SCAN_PAGE_SIZE });
    const last = Math.min(first.last_page, MAX_SCAN_PAGES);
    const rest =
      last <= 1
        ? []
        : await Promise.all(
            Array.from({ length: last - 1 }, (_, index) =>
              platform.getGames({ ...base, page: index + 2, perPage: SCAN_PAGE_SIZE }),
            ),
          );
    const games = [first, ...rest].flatMap((page) => page.data);
    cache.games.set(key, { at: Date.now(), games });
    return games;
  })().finally(() => {
    cache.inflight.delete(key);
  });

  cache.inflight.set(key, load);
  return load;
}

function pageMatched(games: PlatformGame[], filters: CatalogGameFilters, perPage: number): PlatformGamesPage {
  const matched = games.filter((game) => gameMatchesCategory(game, filters.category!));
  return pageFromGames(matched, filters.page ?? 1, perPage);
}

export async function loadCatalogGames(
  platform: PlatformClient,
  filters: CatalogGameFilters,
  cache: CatalogScanCache,
): Promise<PlatformGamesPage> {
  const key = scanKey(filters);
  const unlinkedAt = cache.unlinked.get(key);
  if (filters.category && unlinkedAt !== undefined && Date.now() - unlinkedAt < CACHE_MS) {
    return pageMatched(await scanGames(platform, filters, cache), filters, filters.perPage ?? 50);
  }

  const page = await platform.getGames(filters);
  if (!filters.category || page.total > 0) return page;

  const probe = await platform.getGames({
    ...catalogFilters(filters),
    page: 1,
    perPage: PROBE_PAGE_SIZE,
  });
  const relationsMissing = probe.total > 0 && probe.data.every((game) => game.categories.length === 0);
  if (!relationsMissing) return page;

  cache.unlinked.set(key, Date.now());
  return pageMatched(await scanGames(platform, filters, cache), filters, filters.perPage ?? page.per_page);
}
