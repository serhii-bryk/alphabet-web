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
  const result = await searchCatalogGames({ search: query || undefined, perPage: 40 }).catch(
    () => null,
  );
  return (
    <SearchPage
      initialQuery={query}
      initialGames={result?.games ?? []}
      initialError={!result}
    />
  );
}
