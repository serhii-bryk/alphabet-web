import { PlayerLibrary } from '@/components/personalization/library-page';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('recentlyPlayedTitle');
}

export default function RecentlyPlayedPage() {
  return <PlayerLibrary kind="recent" />;
}
