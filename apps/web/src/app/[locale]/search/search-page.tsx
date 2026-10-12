'use client';
import type { CatalogGame } from '@brand/contracts';
import { useTranslations } from 'next-intl';
import { SearchInput, SearchResults, useCatalogSearch } from '@/components/search';

export function SearchPage({
  initialQuery,
  initialGames,
  initialError,
}: {
  initialQuery: string;
  initialGames: CatalogGame[];
  initialError: boolean;
}) {
  const { query, setQuery, games, loading, error } = useCatalogSearch(
    initialQuery,
    initialGames,
    initialError,
    true,
    true,
  );

  const t = useTranslations('pages');
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--accent)]">{t('searchEyebrow')}</p>
      <h1 className="mb-5 mt-1 text-3xl font-black">{t('searchTitle')}</h1>
      <div className="mb-7 max-w-2xl">
        <SearchInput value={query} onChange={setQuery} />
      </div>
      <SearchResults games={games} query={query} loading={loading} error={error} />
    </section>
  );
}
