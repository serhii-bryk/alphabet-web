import { GLOBAL_SEARCH_GAME_LIMIT, GLOBAL_SEARCH_MIN_LENGTH, searchQueryLength } from '@/components/search-index';
import { searchCatalogGames, type CatalogSearchParams } from '@/data/catalog';
import { translatedMetadata } from '@/i18n/page-metadata';
import { SearchPage } from './search-page';

export function generateMetadata() {
  return translatedMetadata('searchTitle');
}

function safeQuery(value: string | string[] | undefined) {
  if (typeof value !== 'string') return '';
  const query = value.trim();
  return query.length <= 200 ? query : '';
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const query = safeQuery((await searchParams).q);
  const remote = searchQueryLength(query) >= GLOBAL_SEARCH_MIN_LENGTH;
  const result = remote
    ? await searchCatalogGames({ search: query, perPage: GLOBAL_SEARCH_GAME_LIMIT }).catch(() => null)
    : { games: [] };
  return (
    <SearchPage
      initialQuery={query}
      initialGames={result?.games ?? []}
      initialError={!result}
    />
  );
}
