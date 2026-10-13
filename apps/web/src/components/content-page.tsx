import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BrandBanner, type BannerVariant } from './brand-banner';

export async function ContentPage({
  eyebrow,
  title,
  lede,
  banner,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  banner?: BannerVariant;
  children: ReactNode;
}) {
  const footer = await getTranslations('footer');
  const heading = (
    <>
      <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--accent)]">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">{lede}</p>
    </>
  );
  return (
    <article className="mx-auto max-w-3xl py-2 sm:py-6">
      {banner ? (
        <header className="page-hero relative flex min-h-[200px] items-end overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-5 py-6 sm:min-h-[240px] sm:px-7 sm:py-8">
          <BrandBanner variant={banner} scrim="stage" sizes="(min-width: 768px) 768px, 100vw" />
          <div className="banner-copy relative">{heading}</div>
        </header>
      ) : (
        heading
      )}
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-[var(--text)]">{children}</div>
      <p className="mt-8">
        <Link href="/casino" className="text-sm font-bold text-[var(--accent-strong)]">
          {footer('backToCasino')}
        </Link>
      </p>
    </article>
  );
}
