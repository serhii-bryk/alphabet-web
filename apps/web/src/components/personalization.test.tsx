// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogGame } from '@brand/contracts';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children?: ReactNode }) => <a href={href}>{children}</a>,
  usePathname: () => '/favorites',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  redirect: () => undefined,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import messages from '../../messages/en.json';
import { AuthProvider } from './auth/auth-provider';
import { applyAuthenticatedSession, playerKey, useEndSession } from './auth/session';
import { FavoriteButton } from './personalization/favorite-button';
import { PlayerLibrary } from './personalization/library-page';
import { clearFavoriteFlights } from './personalization/use-personalization';

const player = {
  authenticated: true as const,
  playerId: '42',
  email: 'player@example.com',
  currency: 'EUR',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

const game: CatalogGame = {
  id: '12',
  slug: 'game-12',
  title: 'Game 12',
  kind: 'casino',
  imageUrl: null,
  provider: null,
  categories: [],
  demoPlayEnabled: true,
  active: true,
  rtp: null,
  volatility: null,
  gameType: null,
  listedAt: null,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function catalogGame(id = '12') {
  return {
    id,
    slug: `game-${id}`,
    title: `Game ${id}`,
    kind: 'casino',
    imageUrl: null,
    provider: null,
    categories: [],
    demoPlayEnabled: true,
    active: true,
    rtp: null,
    volatility: null,
    gameType: null,
    listedAt: null,
  };
}

let root: Root | undefined;

afterEach(() => {
  clearFavoriteFlights();
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function render(node: ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <AuthProvider>{node}</AuthProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  });
  return client;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await settle();
  }
  throw new Error('timed out waiting for the page');
}

describe('favorite hearts', () => {
  it('asks a guest to sign in and does not fetch personalization', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/session')) return json({ authenticated: false });
      return json({ games: [] });
    });
    vi.stubGlobal('fetch', fetcher);
    await render(<FavoriteButton game={game} />);
    await waitFor(() => document.querySelector('button[aria-label="Sign in to save favorites"]') !== null);

    const button = document.querySelector('button[aria-label="Sign in to save favorites"]');
    expect(button).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Sign in to play and see your balance.');
    expect(fetcher.mock.calls.some((call) => String(call[0]).includes('/api/player'))).toBe(false);
  });

  it('updates the shared cache on add and remove, and ignores a second click while in flight', async () => {
    let releaseAdd: (value: Response) => void = () => {};
    const addGate = new Promise<Response>((resolve) => {
      releaseAdd = resolve;
    });
    let posts = 0;
    let deletes = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/session')) return json(player);
      if (url.includes('/api/player/favorites') && init?.method === 'POST') {
        posts += 1;
        return addGate;
      }
      if (url.includes('/api/player/favorites/') && init?.method === 'DELETE') {
        deletes += 1;
        return json({ gameId: '12' });
      }
      if (url.includes('/api/player/favorites')) return json({ games: deletes > 0 ? [] : posts > 0 ? [catalogGame()] : [] });
      return json({ error: { code: 'personalization_unavailable', message: 'Personalization is unavailable' } }, 502);
    });
    vi.stubGlobal('fetch', fetcher);
    const client = await render(
      <>
        <FavoriteButton game={game} />
        <FavoriteButton game={game} />
      </>,
    );
    await waitFor(
      () =>
        fetcher.mock.calls.some((call) => String(call[0]).includes('/api/player/favorites') && call[1]?.method !== 'POST') &&
        document.querySelectorAll('button[aria-label="Save Game 12 to favorites"]').length === 2,
    );
    expect(String(fetcher.mock.calls)).not.toContain('playerId');
    expect(String(fetcher.mock.calls)).not.toContain('/player/42');

    const [first, second] = [...document.querySelectorAll('button[aria-label="Save Game 12 to favorites"]')];
    await act(async () => {
      first?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      second?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(posts).toBe(1);
    expect(client.getQueryData<{ games: Array<{ id: string }> }>(favoritesCacheKey())?.games.map((item) => item.id)).toEqual(['12']);
    expect(document.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(2);

    await act(async () => {
      releaseAdd(json({ gameId: '12' }));
      await addGate;
    });
    await waitFor(() => document.querySelectorAll('button[aria-label="Remove Game 12 from favorites"]').length === 2);

    const saved = document.querySelector('button[aria-label="Remove Game 12 from favorites"]');
    await act(async () => {
      saved?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => deletes === 1);
    expect(client.getQueryData<{ games: Array<{ id: string }> }>(favoritesCacheKey())?.games).toEqual([]);
    expect(document.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0);
  });
});

describe('favorites library', () => {
  it('shows an empty library and a link back to the casino', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/api/session')) return json(player);
        return json({ games: [] });
      }),
    );
    await render(<PlayerLibrary kind="favorites" />);
    await waitFor(() => document.body.textContent?.includes('No favorite games yet') ?? false);
    expect(document.querySelector('a[href="/casino"]')?.textContent).toBe('Browse Casino');
  });
});

describe('personalization cache', () => {
  it('drops the previous player cache on logout and on the next session', async () => {
    const client = new QueryClient();
    client.setQueryData([...playerKey, '42', 'favorites'], { games: [game] });
    client.setQueryData([...playerKey, '42', 'last-played', { limit: 12, page: 1 }], { games: [game] });

    function Ender() {
      const end = useEndSession();
      return <button type="button" onClick={end}>End</button>;
    }

    vi.stubGlobal('fetch', vi.fn(async () => json({ authenticated: false })));
    await render(<Ender />, client);
    await act(async () => {
      document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(client.getQueryData([...playerKey, '42', 'favorites'])).toBeUndefined();

    client.setQueryData([...playerKey, '42', 'favorites'], { games: [game] });
    client.setQueryData([...playerKey, '42', 'last-played', { limit: 12, page: 1 }], { games: [game] });
    applyAuthenticatedSession(client, { ...player, playerId: '99' });
    expect(client.getQueryData([...playerKey, '42', 'favorites'])).toBeUndefined();
    expect(client.getQueryData([...playerKey, '42', 'last-played', { limit: 12, page: 1 }])).toBeUndefined();

    client.setQueryData([...playerKey, '99', 'most-played', { limit: 12 }], { games: [game] });
    await act(async () => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { value: true });
      window.dispatchEvent(event);
    });
    expect(client.getQueryData([...playerKey, '99', 'most-played', { limit: 12 }])).toBeUndefined();
  });
});

function favoritesCacheKey() {
  return [...playerKey, '42', 'favorites'] as const;
}
