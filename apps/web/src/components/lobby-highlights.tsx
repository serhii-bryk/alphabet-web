'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BrandBanner } from './brand-banner';

export function LobbyHighlights() {
  const t = useTranslations('highlights');
  const notes = [
    { title: t('lobbyTitle'), body: t('lobbyBody'), href: '/journal' as const },
    { title: t('liveTitle'), body: t('liveBody'), href: '/journal' as const },
  ];

  return (
    <div className="mt-10 lg:mt-12">
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
