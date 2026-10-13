import { PlayerLibrary } from '@/components/personalization/library-page';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('mostPlayedTitle');
}

export default function MostPlayedPage() {
  return <PlayerLibrary kind="most" />;
}
