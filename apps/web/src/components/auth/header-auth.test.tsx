import { createElement, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  status: 'guest' as 'pending' | 'guest' | 'authenticated',
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement('a', { href, ...props }, children),
  usePathname: () => '/casino',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));

vi.mock('@/components/auth/session', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useSession: () => ({
      status: session.status,
      session:
        session.status === 'authenticated'
          ? { authenticated: true, email: 'player@arcade.test', playerId: '1', currency: 'EUR' }
          : null,
      query: { isPending: session.status === 'pending' },
    }),
    useBalance: () => ({ isPending: false, data: { balance: 25, currency: 'EUR' } }),
  };
});

import messages from '../../../messages/en.json';
import { CashierProvider } from '../cashier/cashier-provider';
import { MobileHeaderCluster } from './header-auth';

function markup() {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <CashierProvider>
          <MobileHeaderCluster />
        </CashierProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('mobile header', () => {
  it('keeps guests on search and register', () => {
    session.status = 'guest';
    const html = markup();
    expect(html).toContain('Open search');
    expect(html).toContain('>Register<');
    expect(html).not.toContain('Deposit');
    expect(html).not.toContain('Logout');
    expect(html).not.toContain('href="/account"');
  });

  it('shows balance, deposit, search, and account for a signed-in player', () => {
    session.status = 'authenticated';
    const html = markup();
    const balance = html.indexOf('data-testid="balance"');
    const deposit = html.indexOf('>Deposit<');
    const search = html.indexOf('Open search');
    const account = html.indexOf('href="/account"');
    expect(balance).toBeGreaterThan(-1);
    expect(deposit).toBeGreaterThan(balance);
    expect(search).toBeGreaterThan(deposit);
    expect(account).toBeGreaterThan(search);
    expect(html).toContain('€25.00');
    expect(html).not.toContain('Logout');
    expect(html).not.toContain('>Register<');
    expect(html).not.toContain('player@arcade.test');
  });
});
