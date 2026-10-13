import { PlayerLibrary } from '@/components/personalization/library-page';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('favoritesTitle');
}

export default function FavoritesPage() {
  return <PlayerLibrary kind="favorites" />;
}
