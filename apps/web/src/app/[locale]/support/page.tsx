import { getTranslations } from 'next-intl/server';
import { ContentPage } from '@/components/content-page';
import { SupportPageActions } from '@/components/support/support-chat';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('supportTitle');
}

export default async function Page() {
  const t = await getTranslations('pages');
  return (
    <ContentPage eyebrow={t('helpEyebrow')} title={t('supportTitle')} lede={t('supportLede')}>
      <p>{t('support1')}</p>
      <p>{t('support2')}</p>
      <p>{t('support3')}</p>
      <SupportPageActions />
    </ContentPage>
  );
}
