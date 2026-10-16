'use client';

import { useTranslations } from 'next-intl';
import { GuestAcquisition } from './auth/guest-acquisition';
import { HeroRegistrationForm } from './auth/hero-registration-form';
import { useSession } from './auth/session';
import { BrandBanner } from './brand-banner';

export function SportsHero() {
  const t = useTranslations('sportsbook');
  const { status } = useSession();
  const guest = status === 'guest';

  return (
    <header
      className={`sports-hero relative mx-3 mt-3 mb-2 shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] sm:mx-4 sm:mt-4 ${guest ? 'sports-hero-registration' : ''}`}
    >
      <BrandBanner
        variant="sports"
        priority
        sizes="100vw"
        position="object-[72%_58%] rtl:object-[28%_58%]"
      />
      <div
        className={`banner-copy relative flex h-full items-end px-4 py-3 sm:px-6 ${
          guest ? 'flex-col gap-6 py-5 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] sm:py-6' : ''
        }`}
      >
        <div className="max-w-xl">
          <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--positive)]">{t('bannerEyebrow')}</p>
          <h1 className="mt-2 max-w-xl text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl">{t('bannerTitle')}</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--muted)] sm:text-base">{t('bannerLede')}</p>
        </div>
        <GuestAcquisition>
          <HeroRegistrationForm />
        </GuestAcquisition>
      </div>
    </header>
  );
}
