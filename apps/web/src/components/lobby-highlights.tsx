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
    <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
      <section aria-labelledby="lobby-offers" id="promotions" tabIndex={-1} className="lobby-anchor outline-none">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="lobby-offers" className="text-lg font-black">{t('promotions')}</h2>
          <Link href="/promotions" className="text-sm font-bold text-[var(--accent-strong)]">
            {t('allPromotions')}
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {offers.map((offer) => (
            <Link
              key={offer.title}
              href={offer.href}
              className="relative min-h-40 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]"
            >
              <BrandBanner variant="promo" sizes="(min-width: 1024px) 28vw, 100vw" />
              <div className="relative">
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-[var(--warning)]">{t('preview')}</p>
                <h3 className="mt-2 text-base font-black">{offer.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{offer.body}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section aria-labelledby="lobby-journal">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="lobby-journal" className="text-lg font-black">{t('journal')}</h2>
          <Link href="/journal" className="text-sm font-bold text-[var(--accent-strong)]">
            {t('allNotes')}
          </Link>
        </div>
        <div className="grid gap-3">
          {notes.map((note) => (
            <Link
              key={note.title}
              href={note.href}
              className="relative min-h-32 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]"
            >
              <BrandBanner variant="journal" sizes="(min-width: 1024px) 24vw, 100vw" />
              <div className="relative">
                <h3 className="text-base font-black">{note.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{note.body}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
