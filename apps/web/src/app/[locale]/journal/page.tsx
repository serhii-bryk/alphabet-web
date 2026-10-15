import { getTranslations } from 'next-intl/server';
import { ContentPage } from '@/components/content-page';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('journalTitle');
}

export default async function Page() {
  const t = await getTranslations('pages');
  return (
    <ContentPage
      banner="journal"
      eyebrow={t('journalEyebrow')}
      title={t('journalTitle')}
      lede={t('journalLede')}
    >
      <section id="journal-lobby" tabIndex={-1} className="lobby-anchor rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 outline-none">
        <h2 className="text-lg font-black">{t('journalLobbyTitle')}</h2>
        <p className="mt-2 text-[var(--muted)]">{t('journalLobbyBody')}</p>
      </section>
      <section id="journal-live" tabIndex={-1} className="lobby-anchor rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 outline-none">
        <h2 className="text-lg font-black">{t('journalLiveTitle')}</h2>
        <p className="mt-2 text-[var(--muted)]">{t('journalLiveBody')}</p>
      </section>
    </ContentPage>
  );
}
