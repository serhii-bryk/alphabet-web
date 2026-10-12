import { getTranslations } from 'next-intl/server';
import { AccountSection } from '@/components/auth/account-section';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('accountTitle');
}

export default async function Page() {
  const t = await getTranslations('pages');
  return (
    <section className="mx-auto max-w-3xl py-8 sm:py-16">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--accent)]">{t('accountEyebrow')}</p>
      <h1 className="mt-2 text-3xl font-black">{t('accountTitle')}</h1>
      <div className="mt-7">
        <AccountSection />
      </div>
    </section>
  );
}
