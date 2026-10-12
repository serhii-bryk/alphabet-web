import { getTranslations } from 'next-intl/server';
import { ContentPage } from '@/components/content-page';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('responsibleTitle');
}

export default async function Page() {
  const t = await getTranslations('pages');
  return (
    <ContentPage eyebrow={t('safeEyebrow')} title={t('responsibleTitle')} lede={t('responsibleLede')}>
      <p>{t('responsible1')}</p>
      <p>{t('responsible2')}</p>
      <p>{t('responsible3')}</p>
    </ContentPage>
  );
}
