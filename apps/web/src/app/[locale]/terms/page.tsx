import { getTranslations } from 'next-intl/server';
import { ContentPage } from '@/components/content-page';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('termsTitle');
}

export default async function Page() {
  const t = await getTranslations('pages');
  return (
    <ContentPage eyebrow={t('legalEyebrow')} title={t('termsTitle')} lede={t('termsLede')}>
      <p>{t('terms1')}</p>
      <p>{t('terms2')}</p>
      <p>{t('terms3')}</p>
    </ContentPage>
  );
}
