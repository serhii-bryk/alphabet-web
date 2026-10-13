import { getTranslations } from 'next-intl/server';
import { BrandBanner } from './brand-banner';

export async function SportsHero() {
  const t = await getTranslations('sportsbook');
  return (
    <header className="sports-hero relative mx-3 mt-3 mb-2 shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] sm:mx-4 sm:mt-4">
      <BrandBanner
        variant="sports"
        priority
        sizes="100vw"
        position="object-[72%_58%] rtl:object-[28%_58%]"
      />
      <div className="banner-copy relative flex h-full items-end px-4 py-3 sm:px-6">
        <div className="max-w-xl">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-[var(--positive)]">{t('bannerEyebrow')}</p>
          <h1 className="mt-0.5 text-lg font-black leading-tight tracking-tight sm:text-2xl">{t('bannerTitle')}</h1>
          <p className="mt-1 hidden max-w-md text-sm leading-snug text-[var(--muted)] sm:block">{t('bannerLede')}</p>
        </div>
      </div>
    </header>
  );
}
