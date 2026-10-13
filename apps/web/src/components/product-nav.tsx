'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

const products = [
  { href: '/casino', labelKey: 'casino' },
  { href: '/sports', labelKey: 'sports' },
] as const;

export function ProductNav({ className = '' }: { className?: string }) {
  const path = usePathname();
  const t = useTranslations('nav');
  const activeIndex = products.findIndex(({ href }) =>
    href === '/casino' ? path === '/casino' || path === '/live-casino' : path === href,
  );

  return (
    <nav
      aria-label={t('product')}
      className={`product-nav grid grid-cols-2 gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-2)] p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/.08)] ${className}`}
    >
      <span
        aria-hidden
        className="product-nav-indicator"
        style={{ '--i': Math.max(activeIndex, 0), opacity: activeIndex < 0 ? 0 : 1 } as CSSProperties}
      />
      {products.map(({ href, labelKey }, index) => (
        <Link
          key={href}
          href={href}
          aria-current={index === activeIndex ? 'page' : undefined}
          className="product-nav-item grid h-10 place-items-center rounded-[var(--radius-pill)] px-2 text-center text-[13px] font-black leading-none tracking-tight sm:text-sm"
        >
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}
