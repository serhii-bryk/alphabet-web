'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BrandBanner } from './brand-banner';

export function LobbyHighlights() {
  const t = useTranslations('highlights');
  const offers = [
    { title: t('welcomeTitle'), body: t('welcomeBody'), href: '/promotions' as const },
    { title: t('weekendTitle'), body: t('weekendBody'), href: '/promotions' as const },
  ];
  const notes = [
    { title: t('lobbyTitle'), body: t('lobbyBody'), href: '/journal' as const },
    { title: t('liveTitle'), body: t('liveBody'), href: '/journal' as const },
  ];

  return (
    <div className="mt-14 space-y-12 lg:mt-16 lg:space-y-14">
      <section aria-labelledby="lobby-offers" id="promotions" tabIndex={-1} className="lobby-anchor lobby-promotions outline-none">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="lobby-offers" className="lobby-title text-lg font-black">{t('promotions')}</h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">{t('promotionsLede')}</p>
          </div>
          <Link href="/promotions" className="shrink-0 text-sm font-bold text-[var(--accent-strong)]">
            {t('allPromotions')}
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {offers.map((offer) => (
            <Link
              key={offer.title}
              href={offer.href}
              className="promo-card banner-copy relative min-h-44 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]"
            >
              <BrandBanner variant="promo" sizes="(min-width: 1024px) 36vw, 100vw" />
              <div className="relative">
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-[var(--warning)]">{t('preview')}</p>
                <h3 className="mt-2 text-base font-black">{offer.title}</h3>
                <p className="mt-1 max-w-sm text-sm leading-relaxed text-[var(--muted)]">{offer.body}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section aria-labelledby="lobby-journal" id="journal" tabIndex={-1} className="lobby-anchor lobby-journal outline-none">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="lobby-journal" className="lobby-title text-lg font-black">{t('journal')}</h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">{t('journalLede')}</p>
          </div>
          <Link href="/journal" className="shrink-0 text-sm font-bold text-[var(--accent-strong)]">
            {t('allNotes')}
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {notes.map((note) => (
            <Link key={note.title} href={note.href} className="journal-note">
              <span className="journal-note-media">
                <BrandBanner variant="journal" scrim="none" sizes="140px" />
              </span>
              <span className="journal-note-copy">
                <h3 className="text-base font-black">{note.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{note.body}</p>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
