import { createElement, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  status: 'pending' as 'pending' | 'guest' | 'authenticated',
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement('a', { href, ...props }, children),
  usePathname: () => '/promotions',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  redirect: () => undefined,
}));

vi.mock('@/components/auth/session', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useSession: () => ({
      status: session.status,
      session:
        session.status === 'authenticated'
          ? { authenticated: true, email: 'player@arcade.test', playerId: '1' }
          : null,
      query: { isPending: session.status === 'pending' },
    }),
  };
});

import messages from '../../../messages/en.json';
import { CashierProvider } from '../cashier/cashier-provider';
import { PromotionsCta } from '../promotions-cta';
import { SiteFooter } from '../site-footer';

function render(node: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <CashierProvider>{node}</CashierProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('guest acquisition', () => {
  it('hides join and register while the session is pending', () => {
    session.status = 'pending';
    const footer = render(<SiteFooter />);
    const promotions = render(<PromotionsCta />);

    expect(footer).not.toContain('Create account');
    expect(footer).not.toContain('href="/register"');
    expect(footer).not.toContain('href="/account"');
    expect(promotions).not.toContain('Join now');
    expect(promotions).not.toContain('Deposit');
  });

  it('keeps registration entry points for a guest', () => {
    session.status = 'guest';
    const footer = render(<SiteFooter />);
    const promotions = render(<PromotionsCta />);

    expect(footer).toContain('Create account');
    expect(footer).toContain('href="/register"');
    expect(footer).not.toContain('href="/account"');
    expect(promotions).toContain('Join now');
    expect(promotions).toContain('href="/register"');
    expect(promotions).not.toContain('>Deposit<');
  });

  it('replaces acquisition links for a signed-in player', () => {
    session.status = 'authenticated';
    const footer = render(<SiteFooter />);
    const promotions = render(<PromotionsCta />);

    expect(footer).not.toContain('Create account');
    expect(footer).not.toContain('href="/register"');
    expect(footer).toContain('href="/account"');
    expect(footer).toContain('>Account<');
    expect(promotions).not.toContain('Join now');
    expect(promotions).not.toContain('href="/register"');
    expect(promotions).toContain('>Deposit<');
  });
});