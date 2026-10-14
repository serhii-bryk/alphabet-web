import { getTranslations } from 'next-intl/server';
import { BrandBanner } from '@/components/brand-banner';
import { PromotionsCta } from '@/components/promotions-cta';
import { promotionEntries } from '@/data/promotions';
import { Link } from '@/i18n/navigation';
import { translatedMetadata } from '@/i18n/page-metadata';

export function generateMetadata() {
  return translatedMetadata('promotionsTitle', 'promotionsDescription');
}

export default async function Page() {
  const t = await getTranslations('pages');
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
        {promotionEntries.map((offer) => (
          <Link
            key={offer.slug}
            href={`/promotions/${offer.slug}`}
            className="block rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 hover:border-[var(--accent-line)]"
          >
            <h2 className="text-lg font-black">{t(offer.titleKey)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{t(offer.bodyKey)}</p>
          </Link>
        ))}
      </div>
      <PromotionsCta />
    </section>
  );
}
