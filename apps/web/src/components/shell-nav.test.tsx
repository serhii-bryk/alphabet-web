import { createElement, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

const path = vi.hoisted(() => ({ current: '/casino' }));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement('a', { href, ...props }, children),
  usePathname: () => path.current,
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  redirect: () => undefined,
}));

import messages from '../../messages/en.json';
import { Shell } from './shell';

function slice(html: string, startTag: string, endTag: string) {
  const start = html.indexOf(startTag);
  const end = html.indexOf(endTag, start);
  return html.slice(start, end);
}

describe('header and side menu', () => {
  it('keeps the header on Casino and Sports and moves language, theme, and live casino into the side menu', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <Shell>
            <p>Lobby</p>
          </Shell>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    const header = slice(html, '<header', '</header>');
    const aside = slice(html, '<aside', '</aside>');
    const product = slice(header, 'aria-label="Casino and sports"', '</nav>');

    expect(product).toContain('>Casino<');
    expect(product).toContain('>Sports<');
    expect(product).not.toContain('Live Casino');
    expect(header).not.toContain('Live Casino');
    expect(header).not.toContain('Language');
    expect(header).not.toContain('Color theme');
    expect(aside).toContain('href="/casino"');
    expect(aside).toContain('href="/live-casino"');
    expect(aside).toContain('href="/favorites"');
    expect(aside).toContain('Favorites');
    expect(header).not.toContain('href="/favorites"');
    expect(header).not.toContain('Favorites');
    expect(aside).toContain('Live Casino');
    expect(aside).toContain('href="/sports"');
    expect(aside).toContain('href="/promotions"');
    expect(aside).toContain('Language');
    expect(aside).toContain('>English<');
    expect(aside).toContain('العربية');
    expect(aside).toContain('Color theme');
    expect(aside).toContain('Light theme');
    expect(aside).toContain('Dark theme');
    expect(aside).toContain('System theme');
  });

  it('keeps one site header and places the footer after Sports content', () => {
    path.current = '/sports';
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <Shell>
            <p>Sports room</p>
          </Shell>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    path.current = '/casino';
    const headers = html.match(/<header/g) ?? [];
    const footers = html.match(/<footer/g) ?? [];
    const main = slice(html, '<main', '</main>');

    expect(html).toContain('shell-sports');
    expect(headers).toHaveLength(1);
    expect(footers).toHaveLength(1);
    expect(main.indexOf('Sports room')).toBeGreaterThan(-1);
    expect(main.indexOf('id="game-page-slot"')).toBeGreaterThan(-1);
    expect(main.indexOf('id="game-page-slot"')).toBeLessThan(main.indexOf('Sports room'));
    expect(main.indexOf('Sports room')).toBeLessThan(main.indexOf('<footer'));
    expect(main).toContain('Casino, live tables, and sports');
    expect(html).not.toContain('Create account');
    expect(html).not.toContain('>Register<');
  });
});
