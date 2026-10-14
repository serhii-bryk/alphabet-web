import { createElement, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogGame, CatalogLobbyResponse } from '@brand/contracts';
import messages from '../../messages/en.json';

vi.mock('next/image', () => ({
  default: ({ alt = '', src }: { alt?: string; src: string }) => createElement('img', { alt, src }),
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
    useSession: () => ({ status: 'guest' as const, session: null, query: { isPending: false } }),
  };
});

import { GameThumbnail } from './game-card';
import { CatalogErrorState, catalogPageItems, LobbyLoading, LobbyView } from './lobby';

function renderLobby(node: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const game: CatalogGame = {
  id: '42',
  slug: 'live-table',
  title: 'Live Table',
  kind: 'live',
  imageUrl: 'https://cdn.example/live-table.png',
  provider: {
    id: '7',
    code: 'studio',
    name: 'Studio',
    displayName: 'Studio Games',
    groupedCode: null,
  },
  categories: [
    {
      id: '4',
      slug: 'tables',
      fullSlug: 'live/tables',
      name: 'Table Games',
      parentId: null,
    },
  ],
  demoPlayEnabled: false,
};

const lobby: CatalogLobbyResponse = {
  promotions: [],
  categories: [
    {
      id: '4',
      slug: 'tables',
      fullSlug: 'live/tables',
      name: 'Table Games',
      parentId: null,
      sortOrder: 10,
    },
  ],
  sections: [{ id: 'games', title: 'Games', games: [game] }],
  providers: [game.provider!],
  pagination: {
    page: 2,
    perPage: 20,
    total: 60,
    lastPage: 3,
    from: 21,
    to: 40,
    hasNextPage: true,
    hasPreviousPage: true,
  },
};

describe('catalog lobby UI', () => {
  it('renders real thumbnails, active filters, and preserving interaction links', () => {
    const html = renderLobby(
      <LobbyView
        lobby={lobby}
        title="Live Casino"
        pathname="/live-casino"
        filters={{ page: 2, search: 'table', category: 'tables', provider: 'studio' }}
      />,
    );

    expect(html).toContain('Live Casino');
    expect(html).not.toContain('data-product-worlds');
    expect(html).toContain('Results for “table”');
    expect(html).toContain('src="https://cdn.example/live-table.png"');
    expect(html).toContain('alt="Live Table game thumbnail"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('background:var(--positive)');
    expect(html).toContain('color:var(--positive-contrast)');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(
      'href="/live-casino?search=table&amp;category=tables&amp;provider=studio"',
    );
    expect(html).toContain(
      'href="/live-casino?search=table&amp;provider=studio"',
    );
    expect(html).toContain(
      'href="/live-casino?search=table&amp;category=tables"',
    );
    expect(html).toContain(
      'href="/live-casino?search=table&amp;category=tables&amp;provider=studio"',
    );
    expect(html).toContain('class="chip-link shrink-0 rounded-[var(--radius-pill)]');
    expect(html).toContain(
      'href="/live-casino?page=3&amp;search=table&amp;category=tables&amp;provider=studio"',
    );
    expect(html).toContain('Page 2 of 3');
    expect(html).toContain('Showing 21–40 of 60 games');
    expect(html).toContain('>Previous<');
    expect(html).toContain('>Next<');
    expect(html).toContain('aria-current="page"');
  });

  it('keeps a short page window with the current page marked', () => {
    expect(catalogPageItems(1, 18)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 18]);
    expect(catalogPageItems(10, 18)).toEqual([1, 'ellipsis', 8, 9, 10, 11, 12, 'ellipsis', 18]);
    expect(catalogPageItems(2, 3)).toEqual([1, 2, 3]);
  });

  it('renders deterministic artwork for absent and unsafe thumbnails', () => {
    const missing = renderToStaticMarkup(
      <GameThumbnail game={{ ...game, imageUrl: null }} />,
    );
    const unsafe = renderToStaticMarkup(
      <GameThumbnail game={{ ...game, imageUrl: 'javascript:alert(1)' }} />,
    );

    expect(missing).toContain('<svg');
    expect(missing).toContain('aria-label="Live Table artwork"');
    expect(unsafe).toContain('<svg');
    expect(unsafe).not.toContain('javascript:');
  });

  it('renders accessible loading, error, and empty states', () => {
    const loading = renderToStaticMarkup(<LobbyLoading title="Loading casino games" />);
    const error = renderToStaticMarkup(<CatalogErrorState />);
    const empty = renderLobby(
      <LobbyView
        lobby={{
          ...lobby,
          sections: [{ id: 'games', title: 'Games', games: [] }],
          pagination: {
            ...lobby.pagination,
            page: 1,
            lastPage: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }}
        title="Casino"
        pathname="/casino"
        filters={{}}
      />,
    );

    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('aria-label="Loading casino games"');
    expect(error).toContain('role="alert"');
    expect(error).toContain('Games are temporarily unavailable');
    expect(error).toContain('href=""');
    expect(error).toContain('Try again');
    expect(empty).toContain('No games match these filters.');
    expect(empty).not.toContain('Catalog pagination');
    expect(empty).not.toContain('href="/register"');
    expect(empty).not.toContain('Join now');
    expect(empty).toContain('>Register<');
    expect(empty).not.toContain('Coming soon');
    expect(empty).toContain('href="/casino"');
    expect(empty).toContain('href="/sports"');
  });

  it('dedupes providers and mixes a popular rail with a game grid', () => {
    const games = Array.from({ length: 9 }, (_, index) => ({
      ...game,
      id: String(index + 1),
      title: `Game ${index + 1}`,
      kind: 'casino' as const,
      demoPlayEnabled: true,
    }));
    const html = renderLobby(
      <LobbyView
        lobby={{
          ...lobby,
          sections: [{ id: 'games', title: 'Games', games }],
          providers: [
            game.provider!,
            { ...game.provider!, id: '8', name: 'Studio copy' },
            {
              id: '9',
              code: 'other',
              name: 'Other',
              displayName: 'Other Studio',
              groupedCode: null,
            },
            {
              id: '11',
              code: 'evolution-a',
              name: 'Evolution A',
              displayName: 'Evolution',
              groupedCode: 'evolution',
            },
            {
              id: '12',
              code: 'evolution-b',
              name: 'Evolution B',
              displayName: 'Evolution',
              groupedCode: 'evolution',
            },
          ],
        }}
        title="Casino"
        pathname="/casino"
        filters={{}}
      />,
    );

    expect(html).toContain('Popular');
    expect(html).toContain('More games');
    expect(html).toContain('grid-cols-2');
    expect(html.match(/Studio Games/g)).toHaveLength(10);
    expect(html.match(/Other Studio/g)).toHaveLength(1);
    expect(html).toContain('href="/casino?group=evolution"');
    expect(html.match(/Evolution/g)?.length).toBe(1);
    expect(html).not.toContain('>Demo<');
    expect(html).toContain('aria-label="Play Game 1 demo"');
    expect(html).toContain('data-lobby-nav');
    expect(html).toContain('Explore games');
    expect(html).toContain('href="#games"');
    expect(html).toContain('id="games"');
    expect(html).toContain('href="#providers"');
    expect(html).toContain('id="providers"');
    expect(html).not.toContain('href="#promotions"');
    expect(html).not.toContain('id="promotions"');
    expect(html).not.toContain('Welcome on the floor');
    expect(html).not.toContain('Weekend live rooms');
    expect(html).toContain('href="/live-casino#games"');
    expect(html).toContain('id="game-floor"');
    expect(html).toContain('id="live-discovery"');
    expect(html).toContain('id="journal"');
    expect(html).toContain('class="provider-tile');
    expect(html).toContain('href="/casino"');
    expect(html).toContain('href="/live-casino"');
    expect(html).toContain('href="/sports"');

    const worlds = html.indexOf('data-product-worlds');
    const gamesAt = html.indexOf('id="games"');
    const live = html.indexOf('id="live-discovery"');
    const providers = html.indexOf('id="providers"');
    const journal = html.indexOf('id="journal"');
    expect(worlds).toBeGreaterThan(-1);
    expect(worlds).toBeLessThan(gamesAt);
    expect(gamesAt).toBeLessThan(live);
    expect(live).toBeLessThan(providers);
    expect(providers).toBeLessThan(journal);

    const worldMarkup = html.slice(worlds, html.indexOf('</section>', worlds));
    expect(worldMarkup).toContain('product-world-slots');
    expect(worldMarkup).toContain('product-world-live');
    expect(worldMarkup).toContain('product-world-sports');
    expect(worldMarkup).not.toContain('Promotions');
    expect(worldMarkup).not.toContain('Providers');
    expect(worldMarkup.match(/product-world-cta/g)).toHaveLength(3);
  });
});
