'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { GuestAcquisition } from './auth/guest-acquisition';
import { HeroRegistrationForm } from './auth/hero-registration-form';
import { useSession, type SessionStatus } from './auth/session';
import { BrandBanner } from './brand-banner';

const primaryCta =
  'btn btn-primary inline-flex h-11 min-h-11 items-center justify-center rounded-[var(--radius-md)] px-4 text-sm font-black';
const secondaryCta =
  'btn pressable-lift inline-flex h-11 min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold hover:border-[var(--accent-line)]';

export function LobbyHero({ startId = 'casino' }: { startId?: string }) {
  const { status } = useSession();
  const t = useTranslations('hero');
  const live = startId === 'live';

  return (
    <section
      aria-label={t('welcome')}
      className="lobby-hero relative mb-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] sm:mb-8"
    >
      <div className="relative h-32 sm:absolute sm:inset-0 sm:h-auto">
        <BrandBanner variant="casino" scrim="stage" priority sizes="(min-width: 1100px) 1200px, 100vw" />
      </div>
      <div
        className={`banner-copy relative flex flex-col gap-6 p-5 sm:min-h-[19rem] sm:justify-end sm:p-7 lg:min-h-[23rem] lg:p-8 ${status === 'guest' ? 'lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,380px)] lg:items-end' : ''}`}
      >
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--accent)]">
            {status === 'authenticated' ? t('eyebrowMember') : t('eyebrowGuest')}
          </p>
          <h2 className="mt-2 max-w-xl text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl">
            {heroTitle(status, t)}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--muted)] sm:text-base">
            {heroBody(status, live, t)}
          </p>
          {status === 'authenticated' && <MemberActions live={live} />}
        </div>
        <GuestAcquisition>
          <HeroRegistrationForm />
        </GuestAcquisition>
      </div>
    </section>
  );
}

function heroTitle(status: SessionStatus, t: ReturnType<typeof useTranslations<'hero'>>) {
  if (status === 'authenticated') return t('titleMember');
  if (status === 'guest') return t('titleGuest');
  return t('titlePending');
}

function heroBody(status: SessionStatus, live: boolean, t: ReturnType<typeof useTranslations<'hero'>>) {
  if (status === 'authenticated') return live ? t('bodyMemberLive') : t('bodyMember');
  if (status === 'pending') return t('bodyPending');
  return live ? t('bodyGuestLive') : t('bodyGuest');
}

function MemberActions({ live }: { live: boolean }) {
  const t = useTranslations('hero');
  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        <a href="#games" className={primaryCta}>
          {t('play')}
        </a>
        <Link href="/sports" className={secondaryCta}>
          {t('exploreSports')}
        </Link>
      </div>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--muted)]">
        {live ? t('memberNoteLive') : t('memberNote')}
        <Link href="/promotions" className="font-bold text-[var(--text)]">
          {t('seePromotions')}
        </Link>
      </p>
    </div>
  );
}
