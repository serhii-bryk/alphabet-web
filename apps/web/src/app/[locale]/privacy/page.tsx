import { getTranslations } from 'next-intl/server';
import { ContentPage } from '@/components/content-page';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('privacyTitle');
}

export default async function Page() {
  const t = await getTranslations('pages');
  return (
    <ContentPage eyebrow={t('legalEyebrow')} title={t('privacyTitle')} lede={t('privacyLede')}>
      <p>{t('privacy1')}</p>
      <p>{t('privacy2')}</p>
      <p>{t('privacy3')}</p>
    </ContentPage>
  );
}
