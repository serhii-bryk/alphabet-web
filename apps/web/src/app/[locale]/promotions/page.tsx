import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BrandBanner } from '@/components/brand-banner';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('promotionsTitle', 'promotionsDescription');
}

export default async function Page() {
  const t = await getTranslations('pages');
  const offers = [
    { title: t('promoWelcomeTitle'), body: t('promoWelcomeBody') },
    { title: t('promoWeekendTitle'), body: t('promoWeekendBody') },
    { title: t('promoJournalTitle'), body: t('promoJournalBody') },
  ];
  return (
    <section className="py-2">
      <header className="page-hero relative flex min-h-[220px] items-end overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-5 py-6 sm:min-h-[280px] sm:px-7 sm:py-8">
        <BrandBanner variant="promo" scrim="stage" sizes="(min-width: 768px) 960px, 100vw" />
        <div className="banner-copy relative">
          <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--warning)]">{t('promoEyebrow')}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{t('promoTitle')}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">{t('promoLede')}</p>
        </div>
      </header>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {offers.map((offer) => (
          <article key={offer.title} className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-black">{offer.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{offer.body}</p>
          </article>
        ))}
      </div>
      <Link href="/register" className="mt-6 inline-flex h-11 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-sm font-black text-[var(--accent-contrast)]">
        {t('joinNow')}
      </Link>
    </section>
  );
}
