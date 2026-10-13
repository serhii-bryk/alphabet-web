import type {
  CatalogCategory,
  CatalogGame,
  CatalogGamesResponse,
  CatalogProvider,
} from '@brand/contracts';
import type { PlatformCategory, PlatformGame, PlatformGamesPage, PlatformProvider } from '@brand/platform';

export function mapProvider(provider: PlatformProvider): CatalogProvider {
  return {
    id: String(provider.id),
    code: provider.code,
    name: provider.name,
    displayName: provider.display_name,
    groupedCode: provider.grouped_code,
  };
}

export function mapCategory(category: PlatformCategory): CatalogCategory {
  return {
    id: String(category.id),
    slug: category.slug,
    name: category.name,
    parentId: category.parent_id === null ? null : String(category.parent_id),
    sortOrder: category.sort_order,
  };
}

function catalogText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function catalogMetric(value: number | string | null): string | null {
  if (value === null) return null;
  return catalogText(String(value));
}

export function mapGame(game: PlatformGame): CatalogGame | null {
  if (game.type === null) {
    return null;
  }

  const mapped: CatalogGame = {
    id: String(game.id),
    slug: game.slug,
    title: game.name,
    kind: game.type === 'live-casino' ? 'live' : 'casino',
    imageUrl: game.icon,
    provider: game.provider ? mapProvider(game.provider) : null,
    categories: game.categories.map((category) => ({
      id: String(category.id),
      slug: category.slug,
      fullSlug: category.full_slug,
      name: category.name,
      parentId: category.parent_id === null ? null : String(category.parent_id),
    })),
    demoPlayEnabled: game.demo_play_enabled === 1,
    active: game.is_active === 1,
    rtp: catalogMetric(game.rtp),
    volatility: catalogMetric(game.volatility),
    gameType: catalogText(game.provider_game_type),
    listedAt: catalogText(game.created_at),
  };
  if (game.played !== undefined) mapped.played = game.played;
  if (game.rounds !== undefined) mapped.rounds = game.rounds;
  if (game.last_played !== undefined) mapped.lastPlayed = game.last_played;
  return mapped;
}

export interface PlayedPageSource {
  readonly data: readonly PlatformGame[];
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number | null;
  to: number | null;
  next_page_url: string | null;
  prev_page_url: string | null;
}

export function mapPagination(page: PlayedPageSource): CatalogGamesResponse['pagination'] {
  return {
    page: page.current_page,
    perPage: page.per_page,
    total: page.total,
    lastPage: page.last_page,
    from: page.from,
    to: page.to,
    hasNextPage: page.next_page_url !== null,
    hasPreviousPage: page.prev_page_url !== null,
  };
}

export function mapGamesInOrder(games: readonly PlatformGame[]): CatalogGame[] {
  return games.flatMap((game) => {
    const mapped = mapGame(game);
    return mapped ? [mapped] : [];
  });
}

export function mapGamesPage(page: PlatformGamesPage): CatalogGamesResponse {
  return {
    games: mapGamesInOrder(page.data),
    pagination: mapPagination(page),
  };
}
