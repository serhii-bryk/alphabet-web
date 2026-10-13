import { SportsHero } from '@/components/sports-hero';
import { Sportsbook } from '@/components/sportsbook/sportsbook';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('sportsTitle', 'sportsDescription');
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ path?: string | string[] }>;
}) {
  const params = await searchParams;
  const path = typeof params.path === 'string' ? params.path : undefined;
  return (
    <div className="flex w-full flex-col">
      <SportsHero />
      <Sportsbook path={path} />
    </div>
  );
}
