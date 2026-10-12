import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogLobbyResponse } from '@brand/contracts';
import messages from '../../messages/en.json';

vi.mock('next/image', () => ({
  default: ({ alt = '', src }: { alt?: string; src: string }) => createElement('img', { alt, src }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const catalog = (await import('../../messages/en.json')).default as {
      pages: Record<string, string>;
      meta: Record<string, string>;
    };
    const bag = namespace === 'pages' ? catalog.pages : namespace === 'meta' ? catalog.meta : {};
    return (key: string) => bag[key] ?? key;
  },
}));

const { getCatalogLobby } = vi.hoisted(() => ({
  getCatalogLobby: vi.fn(),
}));

vi.mock('@/data/catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/data/catalog')>();
  return { ...original, getCatalogLobby };
});

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));

vi.mock('@/components/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/auth/session')>();
  return {
    ...actual,
    useSession: () => ({ status: 'guest' as const, session: null, query: { isPending: false } }),
  };
});

import CasinoPage from './[locale]/casino/page';
import LiveCasinoPage from './[locale]/live-casino/page';

const emptyLobby: CatalogLobbyResponse = {
  promotions: [],
  categories: [],
  sections: [{ id: 'games', title: 'Games', games: [] }],
  providers: [],
  pagination: {
    page: 1,
    perPage: 20,
    total: 0,
    lastPage: 0,
    from: null,
    to: null,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

beforeEach(() => {
  getCatalogLobby.mockReset();
  getCatalogLobby.mockResolvedValue(emptyLobby);
});

function markup(element: ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe('catalog SSR pages', () => {
  it('forces slots for Casino while forwarding safe route filters', async () => {
    const element = await CasinoPage({
      searchParams: Promise.resolve({
        page: '2',
        search: ' cards ',
        category: 'slots',
        provider: 'studio',
        group: 'evolution',
      }),
    });
    const html = markup(element);

    expect(getCatalogLobby).toHaveBeenCalledWith('slots', {
      page: 2,
      search: 'cards',
      category: 'slots',
      provider: 'studio',
      groupedProvider: 'evolution',
    });
    expect(html).toContain('<h1');
    expect(html).toContain('Casino');
    expect(html).toContain('No games match these filters.');
  });

  it('forces live-casino for Live Casino', async () => {
    const element = await LiveCasinoPage({
      searchParams: Promise.resolve({ page: 'invalid', category: ['one', 'two'] }),
    });
    const html = markup(element);

    expect(getCatalogLobby).toHaveBeenCalledWith('live-casino', {
      page: undefined,
      search: undefined,
      category: undefined,
      provider: undefined,
      groupedProvider: undefined,
    });
    expect(html).toContain('Live Casino');
  });

  it.each([
    ['Casino', CasinoPage],
    ['Live Casino', LiveCasinoPage],
  ])('renders a safe error state when the %s request fails', async (_name, page) => {
    getCatalogLobby.mockRejectedValue(new Error('private upstream details'));
    const element = await page({ searchParams: Promise.resolve({}) });
    const html = markup(element);

    expect(html).toContain('role="alert"');
    expect(html).toContain('Games are temporarily unavailable');
    expect(html).not.toContain('private upstream details');
  });
});
