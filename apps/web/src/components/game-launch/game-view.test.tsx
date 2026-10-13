import { createElement, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogGame, GameLaunchErrorCode } from '@brand/contracts';
import messages from '../../../messages/en.json';

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

import { GameCard } from '../game-card';
import { GameView } from './game-view';
import { DesktopGameLayer } from './desktop-game-layer';
import { GameWorkspace } from './game-workspace';
import { GameLaunchProvider, GameLauncherContext } from './provider';
import type { GameLaunchState, GameLaunchTarget } from './state';

const game: CatalogGame = {
  id: '406',
  slug: 'book-of-tests',
  title: 'Book of Tests',
  kind: 'casino',
  imageUrl: 'https://cdn.example/book.png',
  provider: {
    id: '7',
    code: 'studio',
    name: 'Studio',
    displayName: 'Studio Games',
    groupedCode: null,
  },
  categories: [],
  demoPlayEnabled: true,
};
const target: GameLaunchTarget = { game, mode: 'demo' };
const launchUrl = 'https://platform.example/game/play/ticket-1';
const noop = () => {};

function renderView(state: GameLaunchState) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GameView state={state} onClose={noop} onRetry={noop} onFrameLoad={noop} />
    </NextIntlClientProvider>,
  );
}

function iframeTag(html: string) {
  return html.match(/<iframe[^>]*>/)?.[0] ?? '';
}

describe('GameCard demo affordance', () => {
  it('renders demo-enabled games as an accessible launch button', () => {
    const html = renderToStaticMarkup(<GameCard game={game} />);

    expect(html).toContain('<button type="button" aria-label="Play Book of Tests demo"');
    expect(html).not.toContain('>Demo<');
    expect(html).not.toContain('>DEMO<');
    expect(html).not.toContain('Demo unavailable');
    expect(html).not.toContain('aria-busy');
    expect(html).toContain('game-card-play');
  });

  it('marks only the launching card busy', () => {
    const value = { launch: noop, launchingGameId: '406', launchingGameIds: ['406'], authenticated: false, focusedGame: null };
    const busy = renderToStaticMarkup(
      <GameLauncherContext.Provider value={value}>
        <GameCard game={game} />
        <GameCard game={{ ...game, id: '407', title: 'Other' }} />
      </GameLauncherContext.Provider>,
    );

    expect(busy.match(/aria-busy="true"/g)).toHaveLength(1);
    expect(busy).toContain('aria-label="Play Book of Tests demo" aria-busy="true"');
    expect(busy).toContain('data-alphabet-loader');
  });

  it('offers guests only sign-in for demo-disabled games', () => {
    const html = renderToStaticMarkup(<GameCard game={{ ...game, demoPlayEnabled: false }} />);

    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Sign in to play Book of Tests"');
    expect(html).not.toContain('Play Book of Tests demo');
    expect(html).toContain('Demo unavailable');
    expect(html).toContain('<h3');
  });

  it('gives guests a secondary Play action next to the demo', () => {
    const html = renderToStaticMarkup(<GameCard game={game} />);

    expect(html).toContain('aria-label="Play Book of Tests demo"');
    expect(html).toContain('aria-label="Play Book of Tests"');
  });

  it('makes real play primary for authenticated players and keeps demo secondary', () => {
    const value = { launch: noop, launchingGameId: null, launchingGameIds: [], authenticated: true, focusedGame: null };
    const html = renderToStaticMarkup(
      <GameLauncherContext.Provider value={value}>
        <GameCard game={game} />
        <GameCard game={{ ...game, id: '407', title: 'Live Only', demoPlayEnabled: false }} />
      </GameLauncherContext.Provider>,
    );

    expect(html).toMatch(/<button type="button" aria-label="Play Book of Tests" class="game-card-launch block/);
    expect(html).toContain('aria-label="Play Book of Tests demo"');
    expect(html).toContain('aria-label="Play Live Only"');
    expect(html).not.toContain('Play Live Only demo');
    expect(html).not.toContain('Sign in to play');
  });
});

describe('GameView', () => {
  it('renders nothing while idle, including inside the provider', () => {
    expect(renderView({ status: 'idle' })).toBe('');
    expect(renderToStaticMarkup(<GameLaunchProvider>lobby</GameLaunchProvider>)).toBe('lobby');
  });

  it('renders a labelled modal dialog with a close control while launching', () => {
    const html = renderView({ status: 'launching', target, attempt: 1 });

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="([^"]+)".*<h2 id="\1"[^>]*>Book of Tests<\/h2>/);
    expect(html).toContain('Studio Games');
    expect(html).toContain('z-[90]');
    expect(html).toContain('h-dvh');
    expect(html).toContain('Back to lobby');
    expect(html).toContain('role="status"');
    expect(html).toContain('Starting demo…');
    expect(html).toContain('data-alphabet-loader');
    expect(html).not.toContain('<iframe');
  });

  it('renders the iframe from the launch response with a loading overlay', () => {
    const html = renderView({ status: 'loading', target, attempt: 3, launchUrl });
    const iframe = iframeTag(html);

    expect(html).toContain('Loading game…');
    expect(iframe).toContain(`src="${launchUrl}"`);
    expect(iframe).toContain('title="Book of Tests demo"');
    expect(iframe).toContain('allow="autoplay; fullscreen; encrypted-media"');
    expect(iframe).toContain('allowFullScreen=""');
    expect(iframe).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(iframe).not.toContain('sandbox');
  });

  it('renders only the iframe once ready', () => {
    const html = renderView({ status: 'ready', target, attempt: 3, launchUrl });

    expect(iframeTag(html)).toContain(`src="${launchUrl}"`);
    expect(html).not.toContain('Loading game…');
    expect(html).not.toContain('role="alert"');
  });

  it('renders a non-blocking slow-load notice over the still-mounted iframe', () => {
    const html = renderView({ status: 'slow', target, attempt: 3, launchUrl });

    expect(iframeTag(html)).toContain(`src="${launchUrl}"`);
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('This is taking longer than usual');
    expect(html).toContain('Keep waiting');
    expect(html).toContain('Reload game');
    expect(html.match(/Back to lobby/g)).toHaveLength(1);
  });

  it('does not cover the iframe with an opaque panel while loading', () => {
    const html = renderView({ status: 'loading', target, attempt: 3, launchUrl });

    expect(html).toContain('pointer-events-none');
    expect(html).not.toContain('absolute inset-0 grid place-items-center');
  });

  it.each([
    ['demo_unavailable', 'Demo play isn’t available for this game.', false],
    ['game_not_found', 'This game is no longer available.', false],
    ['invalid_game_id', 'This game can’t be opened right now.', false],
    ['launch_unavailable', 'Something went wrong while starting the game. Please try again.', true],
  ] as const)('renders the %s error state', (code: GameLaunchErrorCode, message, retry) => {
    const html = renderView({ status: 'error', target, attempt: 1, code });

    expect(html).toContain('role="alert"');
    expect(html).toContain(message);
    expect(html.includes('Retry')).toBe(retry);
    expect(html.match(/Back to lobby/g)).toHaveLength(2);
    expect(html).not.toContain('<iframe');
  });

  it('labels a real launch and its frame without demo wording', () => {
    const real: GameLaunchTarget = { game, mode: 'real' };
    const html = renderView({ status: 'loading', target: real, attempt: 1, launchUrl });

    expect(html).toContain('Studio Games');
    expect(html).not.toContain('Real money');
    expect(html).not.toContain('game-mode-chip');
    expect(iframeTag(html)).toContain('title="Book of Tests game"');
    expect(renderView({ status: 'launching', target: real, attempt: 1 })).toContain(
      'Starting game…',
    );
  });

  it('offers Sign in when the session ended during a real launch', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GameView
          state={{ status: 'error', target: { game, mode: 'real' }, attempt: 1, code: 'auth_required' }}
          onClose={noop}
          onRetry={noop}
          onFrameLoad={noop}
          onSignIn={noop}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain('Your session has ended. Sign in again to play.');
    expect(html).toContain('Sign in');
    expect(html).not.toContain('Retry');
  });

  it('renders the game_unavailable error without retry', () => {
    const html = renderView({
      status: 'error',
      target: { game, mode: 'real' },
      attempt: 1,
      code: 'game_unavailable',
    });

    expect(html).toContain('This game is not available right now.');
    expect(html).not.toContain('Retry');
  });
});

describe('desktop game layer', () => {
  const handlers = {
    onCloseAll: noop,
    onClosePanel: noop,
    onRetry: noop,
    onFrameLoad: noop,
    onLoadTimeout: noop,
    onSignIn: noop,
    onFocus: noop,
    onKeepOpen: noop,
    onMinimize: noop,
    onMaximize: noop,
    onRestore: noop,
    onMove: noop,
    onResize: noop,
    onAddGame: noop,
    onDismissLimit: noop,
    onDismissPrompt: noop,
    onRegister: noop,
    onPromptSignIn: noop,
  };

  function panel(
    id: string,
    title: string,
    presentation: 'page' | 'background' | 'floating' | 'minimized' = 'floating',
  ) {
    return {
      id,
      launch: {
        status: 'ready' as const,
        target: { game: { ...game, id, title }, mode: 'demo' as const },
        attempt: 1,
        launchUrl,
      },
      presentation,
      frame: { x: 12, y: 16, width: 720, height: 480 },
      restoreFrame: null,
      z: 1,
    };
  }

  it('renders persistent windows and a prominent add control without a modal', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DesktopGameLayer
          panels={[panel('406', 'Book of Tests'), panel('407', 'Second Game', 'minimized')]}
          focusedId="406"
          limitNotice={false}
          {...handlers}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain('data-desktop-game-layer');
    expect(html).toContain('data-add-game');
    expect(html).toContain('Add Game');
    expect(html).toContain('pointer-events-none');
    expect(html).toContain(`src="${launchUrl}"`);
    expect(html.match(/<iframe/g)).toHaveLength(2);
    expect(html).toContain('game-live-parked');
    expect(html).toContain('data-game-parked');
    expect(html).toContain('inert=""');
    expect(html).not.toContain('hidden=""');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('aria-modal');
    expect(html).not.toContain('Game details');
    expect(html).not.toContain('data-pop-out');
    expect(html).not.toContain('data-game-page');
  });

  it('renders the first desktop game as a full page with a pop-out toolbar', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DesktopGameLayer
          panels={[panel('406', 'Book of Tests', 'page')]}
          focusedId="406"
          limitNotice={false}
          {...handlers}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain('data-game-page');
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('data-pop-out');
    expect(html).toContain('aria-label="Pop out Book of Tests into a floating window"');
    expect(html).not.toContain('Keep open');
    expect(html).toContain('Back to lobby');
    expect(html).toContain('Game details');
    expect(html).toContain('Demo available');
    expect(html).not.toContain('RTP');
    expect(html.match(/data-add-game/g)).toHaveLength(1);
    expect(html).not.toContain('width:720px');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('data-game-parked');
  });

  it('keeps a background game iframe mounted without the hidden attribute', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DesktopGameLayer
          panels={[panel('406', 'Book of Tests', 'background'), panel('407', 'Second Game', 'page')]}
          focusedId="407"
          limitNotice={false}
          {...handlers}
        />
      </NextIntlClientProvider>,
    );

    expect(html.match(/<iframe/g)).toHaveLength(2);
    expect(html).toContain('data-game-parked');
    expect(html).toContain('inert=""');
    expect(html).toContain('data-game-page');
    expect(html).not.toContain('hidden=""');
    expect(html).not.toContain('display:none');
    expect(html).not.toContain('visibility:hidden');
  });
});

describe('mobile workspace', () => {
  it('keeps one expanded game inside the modal switcher', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GameWorkspace
          layout="mobile"
          panels={[
            {
              id: '406',
              launch: { status: 'launching', target, attempt: 1 },
              presentation: 'floating',
              frame: { x: 0, y: 0, width: 720, height: 480 },
              restoreFrame: null,
              z: 1,
            },
            {
              id: '407',
              launch: {
                status: 'launching',
                target: { game: { ...game, id: '407', title: 'Second Game' }, mode: 'demo' },
                attempt: 1,
              },
              presentation: 'floating',
              frame: { x: 0, y: 0, width: 720, height: 480 },
              restoreFrame: null,
              z: 2,
            },
          ]}
          focusedId="406"
          browsing={false}
          limitNotice={false}
          demoLevel="none"
          onCloseAll={noop}
          onClosePanel={noop}
          onRetry={noop}
          onFrameLoad={noop}
          onLoadTimeout={noop}
          onSignIn={noop}
          onFocus={noop}
          onKeepOpen={noop}
          onMinimize={noop}
          onMaximize={noop}
          onRestore={noop}
          onMove={noop}
          onResize={noop}
          onAddGame={noop}
          onDismissLimit={noop}
          onDismissPrompt={noop}
          onRegister={noop}
          onPromptSignIn={noop}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Add game');
    expect(html).toContain('data-game-parked');
    expect(html).toContain('game-live-parked');
    expect(html).toContain('inert=""');
    expect(html).not.toContain('hidden=""');
    expect(html).not.toContain('data-desktop-game-layer');
    expect(html).not.toContain('Add Game');
  });
});
