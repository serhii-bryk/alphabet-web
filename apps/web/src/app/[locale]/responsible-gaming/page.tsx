import { PlayerControlCenter } from '@/components/player-control/player-control-center';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('responsibleTitle');
}

export default function Page() {
  return <PlayerControlCenter />;
}
