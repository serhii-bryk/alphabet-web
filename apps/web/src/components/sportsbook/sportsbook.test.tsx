// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children?: unknown }) => children ?? null,
  usePathname: () => '/sports',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  redirect: () => undefined,
}));

import ar from '../../../messages/ar.json';
import en from '../../../messages/en.json';
import { SPORTSBOOK_MESSAGE_SOURCE } from './launch';
import { Sportsbook } from './sportsbook';

const session = vi.hoisted(() => ({
  status: 'pending' as 'pending' | 'guest' | 'authenticated',
  playerId: null as string | null,
}));
const endSession = vi.hoisted(() =>
  vi.fn(() => {
    session.status = 'guest';
    session.playerId = null;
  }),
);

vi.mock('@/components/auth/session', () => ({
  useSession: () => ({
    status: session.status,
    session:
      session.status === 'authenticated'
        ? {
            authenticated: true,
            playerId: session.playerId,
            email: 'player@example.com',
            currency: 'EUR',
            expiresAt: '2030-01-01T00:00:00.000Z',
          }
        : null,
    query: { isPending: session.status === 'pending' },
  }),
  useEndSession: () => endSession,
}));

const ticket = 'a'.repeat(64);
const calls: string[] = [];

function json(mode: 'demo' | 'real') {
  return Response.json({
    launchUrl: `https://platform.example/sports/play/${ticket}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    mode,
  });
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function renderSports(locale: 'en' | 'ar' = 'en') {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  container.dir = locale === 'ar' ? 'rtl' : 'ltr';
  return act(async () => {
    root?.render(
      <NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar : en}>
        <Sportsbook />
      </NextIntlClientProvider>,
    );
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  calls.length = 0;
  session.status = 'pending';
  session.playerId = null;
  act(() => root?.unmount());
  root = undefined;
  container = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('Sportsbook', () => {
  it('waits for the session, then opens one iframe and does not request again on render', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(String(init?.body));
        return json(session.status === 'authenticated' ? 'real' : 'demo');
      }),
    );

    await renderSports();
    await settle();
    expect(calls).toHaveLength(0);
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.body.textContent).toContain('Opening sportsbook');

    session.status = 'guest';
    await renderSports();
    await settle();
    expect(calls).toEqual([JSON.stringify({ locale: 'en' })]);
    const frame = document.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe(`https://platform.example/sports/play/${ticket}`);
    expect(document.querySelector('.sportsbook')?.className).toContain('min-h-0');
    expect(document.querySelector('.sportsbook')?.className).toContain('flex-1');
    expect(document.querySelector('[data-mode]')?.getAttribute('data-mode')).toBe('demo');

    await renderSports();
    await settle();
    expect(calls).toHaveLength(1);

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://platform.example',
        data: { source: SPORTSBOOK_MESSAGE_SOURCE, action: 'page_change', url: '/live/tennis' },
      }),
    );
    await settle();
    expect(calls).toHaveLength(1);
  });

  it('relaunches when the language or player changes, including logout back to guest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(String(init?.body));
        return json(session.status === 'authenticated' ? 'real' : 'demo');
      }),
    );
    session.status = 'guest';
    await renderSports('en');
    await settle();

    await renderSports('ar');
    await settle();
    expect(calls.at(-1)).toBe(JSON.stringify({ locale: 'ar' }));
    expect(document.body.textContent).not.toContain('Opening sportsbook');
    expect(document.querySelector('iframe')?.getAttribute('dir')).toBeNull();
    expect(document.querySelector('iframe')?.getAttribute('style') ?? '').not.toContain('scale');

    session.status = 'authenticated';
    session.playerId = '42';
    await renderSports('ar');
    await settle();
    expect(document.querySelector('[data-mode]')?.getAttribute('data-mode')).toBe('real');

    session.status = 'guest';
    session.playerId = null;
    await renderSports('ar');
    await settle();
    expect(document.querySelector('[data-mode]')?.getAttribute('data-mode')).toBe('demo');
    expect(calls).toHaveLength(4);
  });

  it('shows a retry for a failed launch', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (fail) {
          return Response.json(
            { error: { code: 'sports_unavailable', message: 'Sportsbook is unavailable' } },
            { status: 502 },
          );
        }
        return json('demo');
      }),
    );
    session.status = 'guest';
    await renderSports();
    await settle();
    expect(document.body.textContent).toContain('Sportsbook unavailable');
    fail = false;
    const retry = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Try again'),
    );
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
    expect(document.querySelector('iframe')).not.toBeNull();
  });
});
