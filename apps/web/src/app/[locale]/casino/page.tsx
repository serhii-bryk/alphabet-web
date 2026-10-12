import { getTranslations } from 'next-intl/server';
import { CatalogErrorState, LobbyView } from '@/components/lobby';
import { getCatalogLobby, parseCatalogFilters, type CatalogSearchParams } from '@/data/catalog';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('casinoTitle', 'casinoDescription');
}

export default async function CasinoPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const filters = parseCatalogFilters(await searchParams);
  const lobby = await getCatalogLobby('slots', filters).catch(() => null);
  if (!lobby) return <CatalogErrorState />;
  const pages = await getTranslations('pages');
  return <LobbyView lobby={lobby} title={pages('casinoHeading')} pathname="/casino" filters={filters} />;
}
