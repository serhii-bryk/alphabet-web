import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PromotionsCta } from '@/components/promotions-cta';
import { promotionBySlug } from '@/data/promotions';
import { Link } from '@/i18n/navigation';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const promo = promotionBySlug((await params).slug);
  const pages = await getTranslations('pages');
  if (!promo) return { title: pages('promoTitle') };
  return { title: `${pages(promo.titleKey)} | AlphaBet`, description: pages('promoLede') };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const promo = promotionBySlug((await params).slug);
  if (!promo) notFound();
  const pages = await getTranslations('pages');
  const nav = await getTranslations('nav');
  return (
    <article className="mx-auto max-w-3xl py-2 sm:py-6">
      <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--warning)]">{pages('promoEyebrow')}</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{pages(promo.titleKey)}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--text)] sm:text-base">{pages(promo.bodyKey)}</p>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{pages('promoLede')}</p>
      <p className="mt-8">
        <Link href="/promotions" className="text-sm font-bold text-[var(--accent-strong)]">
          {nav('promotions')}
        </Link>
      </p>
      <PromotionsCta />
    </article>
  );
}
