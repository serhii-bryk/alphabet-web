'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

const products = [
  { href: '/casino', labelKey: 'casino' },
  { href: '/sports', labelKey: 'sports' },
] as const;

export function ProductNav({ className = '' }: { className?: string }) {
  const path = usePathname();
  const t = useTranslations('nav');

  return (
    <nav
      aria-label={t('product')}
      className={`grid grid-cols-2 gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-2)] p-1 ${className}`}
    >
      {products.map(({ href, labelKey }) => {
        const active = href === '/casino' ? path === '/casino' || path === '/live-casino' : path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="grid h-10 place-items-center rounded-[var(--radius-pill)] px-2 text-center text-[13px] font-black leading-none tracking-tight transition sm:text-sm"
            style={{
              background: active ? 'var(--text)' : 'transparent',
              color: active ? 'var(--bg)' : 'var(--muted)',
            }}
          >
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
