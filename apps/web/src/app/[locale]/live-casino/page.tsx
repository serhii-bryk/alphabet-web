import { getTranslations } from 'next-intl/server';
import { CatalogErrorState, LobbyView } from '@/components/lobby';
import { getCatalogLobby, parseCatalogFilters, type CatalogSearchParams } from '@/data/catalog';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('liveTitle', 'liveDescription');
}

export default async function LiveCasinoPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const filters = parseCatalogFilters(await searchParams);
  const lobby = await getCatalogLobby('live-casino', filters).catch(() => null);
  if (!lobby) return <CatalogErrorState />;
  const pages = await getTranslations('pages');
  return <LobbyView lobby={lobby} title={pages('liveHeading')} pathname="/live-casino" filters={filters} />;
}
