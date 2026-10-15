// @vitest-environment happy-dom
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/casino',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
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
  redirect: () => undefined,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import messages from '../../messages/en.json';
import { sessionKey } from './auth/session';
import { Shell } from './shell';

const guest = { authenticated: false as const };
const player = {
  authenticated: true as const,
  playerId: '42',
  email: 'player@example.com',
  currency: 'EUR',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function renderShell(client: QueryClient) {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <Shell>
            <p>Lobby</p>
          </Shell>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function aside() {
  const node = document.querySelector('aside');
  if (!node) throw new Error('missing sidebar');
  return node;
}

function mobileNav() {
  const node = document.querySelector('nav[aria-label="Mobile navigation"]');
  if (!node) throw new Error('missing mobile navigation');
  return node;
}

describe('signed-in sidebar and menu', () => {
  it('hides Play safe and Account until sign-in, then updates without a refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/account/balance')) return json({ balance: 12, currency: 'EUR' });
        if (url.includes('/api/responsible-gaming/reality-check')) return json({ intervalMinutes: 0 });
        if (url.includes('/api/responsible-gaming/session')) {
          return json({ startedAt: null, source: 'unavailable' });
        }
        return json(guest);
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(sessionKey, guest);
    await renderShell(client);
    await settle();

    expect(aside().querySelector('a[href="/responsible-gaming"]')).toBeNull();
    expect(aside().querySelector('a[href="/account"]')).toBeNull();
    expect(aside().querySelector('a[href="/casino"]')).not.toBeNull();
    expect(mobileNav().querySelector('a[href="/account"]')).toBeNull();
    expect(mobileNav().querySelector('a[href="/casino"]')).not.toBeNull();
    expect(document.querySelector('footer a[href="/responsible-gaming"]')).not.toBeNull();

    const openMenu = document.querySelector('button[aria-label="Open menu"]');
    if (!(openMenu instanceof HTMLButtonElement)) throw new Error('missing menu button');
    await act(async () => {
      openMenu.click();
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelector('a[href="/responsible-gaming"]')).toBeNull();
    expect(dialog?.querySelector('a[href="/account"]')).toBeNull();
    expect(dialog?.querySelector('a[href="/casino"]')).not.toBeNull();

    await act(async () => {
      client.setQueryData(sessionKey, player);
    });
    await settle();

    expect(aside().querySelector('a[href="/responsible-gaming"]')?.textContent).toContain('Play safe');
    expect(aside().querySelector('a[href="/account"]')?.textContent).toContain('Account');
    expect(mobileNav().querySelector('a[href="/account"]')?.textContent).toContain('Account');
    expect(dialog?.querySelector('a[href="/responsible-gaming"]')?.textContent).toContain('Play safe');
    expect([...(dialog?.querySelectorAll('a[href="/account"]') ?? [])].some((link) => link.textContent?.includes('Account'))).toBe(true);

    await act(async () => {
      client.setQueryData(sessionKey, guest);
    });
    await settle();

    expect(aside().querySelector('a[href="/responsible-gaming"]')).toBeNull();
    expect(aside().querySelector('a[href="/account"]')).toBeNull();
    expect(mobileNav().querySelector('a[href="/account"]')).toBeNull();
    expect(dialog?.querySelector('a[href="/responsible-gaming"]')).toBeNull();
    expect(dialog?.querySelector('a[href="/account"]')).toBeNull();
    expect(document.querySelector('footer a[href="/responsible-gaming"]')).not.toBeNull();
    expect(aside().querySelector('a[href="/casino"]')).not.toBeNull();
  });
});
