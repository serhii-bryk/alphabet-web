import { createElement, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogGame, CatalogLobbyResponse } from '@brand/contracts';
import messages from '../../messages/en.json';

vi.mock('next/image', () => ({
  default: ({ alt = '', src }: { alt?: string; src: string }) => createElement('img', { alt, src }),
}));

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
}));

vi.mock('@/components/auth/session', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useSession: () => ({
      status: session.status,
      session: session.status === 'authenticated' ? { authenticated: true, email: 'player@arcade.test' } : null,
      query: { isPending: session.status === 'pending' },
    }),
  };
});

import { LobbyView } from './lobby';

const game: CatalogGame = {
  id: '1',
  slug: 'floor-game',
  title: 'Floor Game',
  kind: 'casino',
  imageUrl: null,
  provider: {
    id: '7',
    code: 'studio',
    name: 'Studio',
    displayName: 'Studio Games',
    groupedCode: null,
  },
  categories: [],
  demoPlayEnabled: false,
};

const lobby: CatalogLobbyResponse = {
  promotions: [],
  categories: [],
  sections: [{ id: 'games', title: 'Games', games: [game] }],
  providers: [],
  pagination: {
    page: 1,
    perPage: 20,
    total: 1,
    lastPage: 1,
    from: 1,
    to: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

function renderLobby() {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LobbyView lobby={lobby} title="Casino" pathname="/casino" filters={{}} />
    </NextIntlClientProvider>,
  );
}

function buttonOpening(html: string, label: string) {
  const marker = `aria-label="${label}, Coming soon"`;
  const index = html.indexOf(marker);
  expect(index, marker).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<button', index);
  return html.slice(start, html.indexOf('>', index));
}

describe('lobby hero', () => {
  it('exposes register and disabled social sign-in for guests', () => {
    session.status = 'guest';
    const html = renderLobby();

    expect(html).toContain('>Register<');
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain('>Continue<');
    expect(html).not.toContain('href="/register"');
    for (const label of ['Google', 'Apple', 'Phone']) {
      expect(buttonOpening(html, label)).toContain('disabled');
    }
    expect(html).toContain('href="/casino"');
    expect(html).toContain('href="/sports"');
    expect(html).toContain('aria-label="Casino and sports"');
    expect(html).toContain('>Live Casino<');
  });

  it('hides signup controls for an authenticated player', () => {
    session.status = 'authenticated';
    const html = renderLobby();

    expect(html).not.toContain('>Register<');
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('aria-label="Google, Coming soon"');
    expect(html).not.toContain('aria-label="Apple, Coming soon"');
    expect(html).not.toContain('aria-label="Phone, Coming soon"');
    expect(html).toContain('href="#games"');
    expect(html).toContain('Explore sports');
    expect(html).toContain('href="/sports"');
    expect(html).toContain('href="/casino"');
    expect(html).toContain('id="game-floor"');
  });

  it('keeps the product composition and withholds the form while session is pending', () => {
    session.status = 'pending';
    const html = renderLobby();

    expect(html).toContain('Casino and sportsbook.');
    expect(html).not.toContain('One account for the floor and the book.');
    expect(html).toContain('href="/casino"');
    expect(html).toContain('href="/sports"');
    expect(html).not.toContain('>Register<');
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('aria-label="Google, Coming soon"');
  });
});
