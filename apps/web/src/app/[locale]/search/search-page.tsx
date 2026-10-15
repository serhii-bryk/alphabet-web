'use client';
import { useTranslations } from 'next-intl';
import { GlobalSearch } from '@/components/search';
import type { CatalogGame } from '@brand/contracts';

export function SearchPage({
  initialQuery,
  initialGames,
  initialError,
}: {
  initialQuery: string;
  initialGames: CatalogGame[];
  initialError: boolean;
}) {
  const t = useTranslations('pages');
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--accent)]">{t('searchEyebrow')}</p>
      <h1 className="mb-5 mt-1 text-3xl font-black">{t('searchTitle')}</h1>
      <div className="max-w-2xl">
        <GlobalSearch initialQuery={initialQuery} initialGames={initialGames} initialError={initialError} initialLoaded />
      </div>
    </section>
  );
}
