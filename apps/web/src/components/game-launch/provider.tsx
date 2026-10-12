'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocale } from 'next-intl';
import type { CatalogGame, GameLaunchMode } from '@brand/contracts';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  GameLaunchError,
  requestDemoLaunch,
  requestRealLaunch,
} from '@/data/game-launch-browser';
import { formatBalance } from '../auth/header-auth';
import { useAuthDialog } from '../auth/auth-provider';
import { useBalance } from '../auth/session';
import { useCashier } from '../cashier/cashier-provider';
import { openCasinoGameSection } from './casino-nav';
import { useDemoPlayClock } from './demo-play-clock';
import { GameWorkspace } from './game-workspace';
import { isDesktopViewport } from './viewport';
import {
  isRetryable,
  supportsLaunchMode,
  type GameLaunchers,
  type GameLaunchTarget,
} from './state';
import {
  MAX_OPEN_GAMES,
  defaultFrame,
  initialWorkspaceState,
  workspaceReducer,
  type Frame,
} from './workspace-state';

const defaultLaunchers: GameLaunchers = { demo: requestDemoLaunch, real: requestRealLaunch };
const historyKey = '__brandGameView';
const noop = () => {};

export interface GameLauncherApi {
  launch: (game: CatalogGame, opener?: HTMLElement | null, mode?: GameLaunchMode) => void;
  launchingGameId: string | null;
  launchingGameIds?: readonly string[];
  authenticated: boolean;
  focusedGame: CatalogGame | null;
}

const noopLauncher: GameLauncherApi = {
  launch: noop,
  launchingGameId: null,
  launchingGameIds: [],
  authenticated: false,
  focusedGame: null,
};
export const GameLauncherContext = createContext<GameLauncherApi>(noopLauncher);

export function useGameLauncher() {
  return useContext(GameLauncherContext);
}

export function GameLaunchProvider({
  children,
  launchers = defaultLaunchers,
  authenticated = false,
  onAuthRequired = noop,
  onSessionEnded = noop,
}: {
  children: ReactNode;
  launchers?: GameLaunchers;
  authenticated?: boolean;
  onAuthRequired?: (opener?: HTMLElement | null) => void;
  onSessionEnded?: () => void;
}) {
  const sessionEndedRef = useRef(onSessionEnded);
  useEffect(() => {
    sessionEndedRef.current = onSessionEnded;
  }, [onSessionEnded]);
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const [browsing, setBrowsing] = useState(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const openIdsRef = useRef(new Set<string>());
  const modesRef = useRef(new Map<string, GameLaunchMode>());
  const attemptsRef = useRef(new Map<string, number>());
  const controllersRef = useRef(new Map<string, AbortController>());
  const openerRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(false);
  const historyEntryRef = useRef<number | null>(null);
  const pendingBackRef = useRef<number | null>(null);
  const authenticatedRef = useRef(authenticated);
  const pathname = usePathname();
  const router = useRouter();

  const forget = useCallback((id: string) => {
    controllersRef.current.get(id)?.abort();
    controllersRef.current.delete(id);
    openIdsRef.current.delete(id);
    modesRef.current.delete(id);
  }, []);

  const request = useCallback(
    (target: GameLaunchTarget) => {
      const id = target.game.id;
      const attempt = (attemptsRef.current.get(id) ?? 0) + 1;
      attemptsRef.current.set(id, attempt);
      controllersRef.current.get(id)?.abort();
      const controller = new AbortController();
      controllersRef.current.set(id, controller);
      launchers[target.mode](target.game.id, controller.signal).then(
        (response) => {
          if (controller.signal.aborted) return;
          dispatch({
            type: 'panel',
            id,
            action: { type: 'resolved', attempt, launchUrl: response.launchUrl },
          });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          const code = error instanceof GameLaunchError ? error.code : 'launch_unavailable';
          if (code === 'auth_required') sessionEndedRef.current();
          dispatch({ type: 'panel', id, action: { type: 'failed', attempt, code } });
        },
      );
      return attempt;
    },
    [launchers],
  );

  const finishIfEmpty = useCallback(() => {
    if (openIdsRef.current.size > 0) return;
    setBrowsing(false);
    restoreFocusRef.current = true;
    if (isDesktopViewport()) {
      historyEntryRef.current = null;
      return;
    }
    const entry = historyEntryRef.current;
    historyEntryRef.current = null;
    if (entry === null || window.history.state?.[historyKey] !== entry) return;
    pendingBackRef.current = window.setTimeout(() => {
      pendingBackRef.current = null;
    }, 1_000);
    window.history.back();
  }, []);

  const launch = useCallback(
    (game: CatalogGame, opener?: HTMLElement | null, mode: GameLaunchMode = 'demo') => {
      if (pendingBackRef.current !== null) return;
      const target: GameLaunchTarget = { game, mode };
      if (mode === 'real' && !authenticated) {
        onAuthRequired(opener);
        return;
      }
      if (!supportsLaunchMode(game, mode, authenticated)) return;
      const existing = modesRef.current.get(game.id);
      if (existing === mode) {
        dispatch({ type: 'focus', id: game.id });
        setBrowsing(false);
        return;
      }
      if (existing) {
        modesRef.current.set(game.id, mode);
        const attempt = request(target);
        dispatch({ type: 'replace', id: game.id, target, attempt });
        setBrowsing(false);
        return;
      }
      const desktop = isDesktopViewport();
      const multi = stateRef.current.multiGame;
      if (desktop && !multi && openIdsRef.current.size > 0) {
        for (const id of [...openIdsRef.current]) forget(id);
        dispatch({ type: 'reset' });
      } else if (openIdsRef.current.size >= MAX_OPEN_GAMES) {
        dispatch({ type: 'showLimit' });
        setBrowsing(false);
        return;
      }
      openerRef.current ??=
        opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      openIdsRef.current.add(game.id);
      modesRef.current.set(game.id, mode);
      const attempt = request(target);
      dispatch({
        type: 'open',
        target,
        attempt,
        frame: defaultFrame(openIdsRef.current.size - 1),
        presentation: desktop && !multi ? 'page' : 'floating',
      });
      setBrowsing(false);
      if (!isDesktopViewport() && historyEntryRef.current === null) {
        window.history.pushState({ [historyKey]: attempt }, '');
        historyEntryRef.current = attempt;
      }
    },
    [authenticated, forget, onAuthRequired, request],
  );

  const closePanel = useCallback(
    (id: string) => {
      if (!openIdsRef.current.has(id)) return;
      forget(id);
      dispatch({ type: 'close', id });
      finishIfEmpty();
    },
    [finishIfEmpty, forget],
  );

  const closeAll = useCallback(() => {
    for (const id of [...openIdsRef.current]) forget(id);
    dispatch({ type: 'reset' });
    finishIfEmpty();
  }, [finishIfEmpty, forget]);

  const retry = useCallback(
    (id: string) => {
      const panel = stateRef.current.panels.find((item) => item.id === id);
      if (!panel || !isRetryable(panel.launch)) return;
      const attempt = request(panel.launch.target);
      dispatch({ type: 'panel', id, action: { type: 'retry', attempt } });
    },
    [request],
  );

  const onFrameLoad = useCallback((id: string, attempt: number) => {
    dispatch({ type: 'panel', id, action: { type: 'frameLoaded', attempt } });
  }, []);

  const onLoadTimeout = useCallback((id: string, attempt: number) => {
    dispatch({ type: 'panel', id, action: { type: 'loadTimeout', attempt } });
  }, []);

  const onMove = useCallback((id: string, x: number, y: number) => {
    const layer = document.getElementById('desktop-game-layer');
    const width = layer?.clientWidth || window.innerWidth;
    const height = layer?.clientHeight || window.innerHeight;
    const maxX = Math.max(0, width - 160);
    const maxY = Math.max(0, height - 160);
    dispatch({
      type: 'move',
      id,
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y), maxY),
    });
  }, []);

  const onResize = useCallback((id: string, frame: Frame) => {
    dispatch({ type: 'resize', id, frame });
  }, []);

  const onFocus = useCallback((id: string) => {
    dispatch({ type: 'focus', id });
    setBrowsing(false);
  }, []);

  const onAddGame = useCallback(() => {
    if (openIdsRef.current.size >= MAX_OPEN_GAMES) {
      dispatch({ type: 'showLimit' });
      if (!isDesktopViewport()) setBrowsing(false);
      return;
    }
    if (isDesktopViewport()) {
      dispatch({ type: 'enterMultiGame' });
      openCasinoGameSection(pathname, (href) => router.push(href));
      return;
    }
    setBrowsing(true);
  }, [pathname, router]);

  useEffect(() => {
    const controllers = controllersRef.current;
    const onPopState = () => {
      if (isDesktopViewport()) return;
      if (pendingBackRef.current !== null) {
        window.clearTimeout(pendingBackRef.current);
        pendingBackRef.current = null;
        return;
      }
      if (historyEntryRef.current === null) return;
      historyEntryRef.current = null;
      for (const id of [...openIdsRef.current]) forget(id);
      restoreFocusRef.current = true;
      setBrowsing(false);
      dispatch({ type: 'reset' });
    };
    addEventListener('popstate', onPopState);
    return () => {
      removeEventListener('popstate', onPopState);
      for (const controller of controllers.values()) controller.abort();
    };
  }, [forget]);

  useEffect(() => {
    const wasAuthenticated = authenticatedRef.current;
    authenticatedRef.current = authenticated;
    if (!wasAuthenticated || authenticated) return;
    const realIds = [...modesRef.current.entries()]
      .filter(([, mode]) => mode === 'real')
      .map(([id]) => id);
    for (const id of realIds) forget(id);
    if (realIds.length > 0) dispatch({ type: 'dropMode', mode: 'real' });
    finishIfEmpty();
  }, [authenticated, finishIfEmpty, forget]);

  useEffect(() => {
    if (state.panels.length > 0 || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus();
  }, [state.panels.length]);

  const launchingGameIds = state.panels
    .filter((panel) => panel.launch.status === 'launching')
    .map((panel) => panel.id);
  const focusedGame =
    state.panels.find((panel) => panel.id === state.focusedId)?.launch.target.game ?? null;
  const api = useMemo<GameLauncherApi>(
    () => ({
      launch,
      launchingGameId: launchingGameIds[0] ?? null,
      launchingGameIds,
      authenticated,
      focusedGame,
    }),
    [authenticated, focusedGame, launch, launchingGameIds],
  );

  const signIn = useCallback(
    (id: string) => {
      const opener = openerRef.current;
      openerRef.current = null;
      closePanel(id);
      onAuthRequired(opener);
    },
    [closePanel, onAuthRequired],
  );

  return (
    <GameLauncherContext.Provider value={api}>
      {children}
      {state.panels.length > 0 && (
        <WorkspaceSession
          panels={state.panels}
          focusedId={state.focusedId}
          browsing={browsing}
          limitNotice={state.limitNotice}
          authenticated={authenticated}
          onCloseAll={closeAll}
          onClosePanel={closePanel}
          onRetry={retry}
          onFrameLoad={onFrameLoad}
          onLoadTimeout={onLoadTimeout}
          onSignIn={signIn}
          onFocus={onFocus}
          onKeepOpen={() => dispatch({ type: 'enterMultiGame' })}
          onMinimize={(id) => dispatch({ type: 'minimize', id })}
          onMaximize={(id) => dispatch({ type: 'maximize', id })}
          onRestore={(id) => dispatch({ type: 'restore', id })}
          onMove={onMove}
          onResize={onResize}
          onAddGame={onAddGame}
          onDismissLimit={() => dispatch({ type: 'dismissLimit' })}
        />
      )}
    </GameLauncherContext.Provider>
  );
}

function WorkspaceSession({
  authenticated,
  browsing,
  onSignIn,
  ...workspace
}: {
  panels: Parameters<typeof GameWorkspace>[0]['panels'];
  focusedId: string | null;
  browsing: boolean;
  limitNotice: boolean;
  authenticated: boolean;
  onCloseAll: () => void;
  onClosePanel: (id: string) => void;
  onRetry: (id: string) => void;
  onFrameLoad: (id: string, attempt: number) => void;
  onLoadTimeout: (id: string, attempt: number) => void;
  onSignIn: (id: string) => void;
  onFocus: (id: string) => void;
  onKeepOpen: () => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  onRestore: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, frame: Frame) => void;
  onAddGame: () => void;
  onDismissLimit: () => void;
}) {
  const locale = useLocale();
  const { openLogin, openRegistration } = useAuthDialog();
  const { openCashier } = useCashier();
  const balance = useBalance();
  const demoActive =
    !authenticated &&
    !browsing &&
    workspace.panels.some(
      (panel) => panel.launch.target.mode === 'demo' && panel.launch.status !== 'error',
    );
  const prompt = useDemoPlayClock(demoActive, authenticated);
  const balanceLabel =
    authenticated && balance.data ? formatBalance(balance.data, locale) : null;

  return (
    <GameWorkspace
      {...workspace}
      browsing={browsing}
      showDeposit={authenticated}
      balanceLabel={balanceLabel}
      demoLevel={prompt.level}
      onDeposit={() => openCashier('deposit')}
      onDismissPrompt={prompt.dismiss}
      onRegister={(opener) => openRegistration(opener)}
      onPromptSignIn={(opener) => openLogin(opener)}
      onSignIn={onSignIn}
    />
  );
}
