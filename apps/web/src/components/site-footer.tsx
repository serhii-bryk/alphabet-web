'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { GuestAcquisition } from './auth/guest-acquisition';
import { Wordmark } from './wordmark';

const footerLinkClass = 'text-sm font-semibold hover:text-[var(--accent-strong)]';

export function SiteFooter() {
  const footer = useTranslations('footer');
  const nav = useTranslations('nav');
  const year = new Date().getFullYear();
  const columns = [
    {
      title: nav('play'),
      links: [
        { href: '/casino', label: nav('casino') },
        { href: '/live-casino', label: nav('live') },
        { href: '/sports', label: nav('sports') },
        { href: '/search', label: nav('searchGames') },
      ],
    },
    {
      title: nav('brand'),
      links: [
        { href: '/promotions', label: nav('promotions') },
        { href: '/journal', label: nav('journal') },
        { href: '/register', label: footer('createAccount') },
        { href: '/support', label: footer('support') },
      ],
    },
    {
      title: nav('playSafe'),
      links: [
        { href: '/responsible-gaming', label: footer('responsible') },
        { href: '/terms', label: footer('terms') },
        { href: '/privacy', label: footer('privacy') },
      ],
    },
  ] as const;

  return (
    <footer className="mt-14 border-t border-[var(--line)] pt-8">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Wordmark />
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--muted)]">{footer('tagline')}</p>
          <p className="mt-4 text-xs font-bold uppercase tracking-[.14em] text-[var(--muted)]">
            {footer('socialSoon')}
          </p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-xs font-black uppercase tracking-[.16em] text-[var(--muted)]">{column.title}</h2>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) =>
                link.href === '/register' ? (
                  <GuestAcquisition
                    key={link.href}
                    replacement={
                      <li>
                        <Link href="/account" className={footerLinkClass}>
                          {nav('account')}
                        </Link>
                      </li>
                    }
                  >
                    <li>
                      <Link href={link.href} className={footerLinkClass}>
                        {link.label}
                      </Link>
                    </li>
                  </GuestAcquisition>
                ) : (
                  <li key={link.href}>
                    <Link href={link.href} className={footerLinkClass}>
                      {link.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-2 border-t border-[var(--line)] py-4 text-xs leading-relaxed text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
        <p>{footer('copyright', { year })}</p>
        <p>{footer('disclaimer')}</p>
      </div>
    </footer>
  );
}
