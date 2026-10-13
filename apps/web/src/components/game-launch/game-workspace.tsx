'use client';

import { useEffect, useId, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GameThumbnail } from '../game-card';
import { Button } from '../ui';
import { DesktopGameLayer, ShellPortal } from './desktop-game-layer';
import { DemoPrompt } from './demo-prompt';
import { GameFrame } from './game-frame';
import { GameInfo } from './game-info';
import { FavoriteButton } from '../personalization/favorite-button';
import { FullscreenButton } from './game-toolbar';
import type { DemoPromptLevel } from './demo-play';
import { useClientDesktop } from './viewport';
import {
  MAX_OPEN_GAMES,
  defaultFrame,
  type Frame,
  type GamePanel,
  type WorkspaceState,
} from './workspace-state';
import type { GameLaunchState } from './state';

const focusableSelector =
  'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

function providerName(panel: GamePanel, independent: string) {
  return panel.launch.target.game.provider?.displayName || panel.launch.target.game.provider?.name || independent;
}

export function GameWorkspace({
  panels,
  focusedId,
  browsing,
  limitNotice,
  layout,
  balanceLabel,
  showDeposit = false,
  demoLevel = 'none',
  onCloseAll,
  onClosePanel,
  onRetry,
  onFrameLoad,
  onLoadTimeout,
  onSignIn,
  onFocus,
  onKeepOpen,
  onMinimize,
  onMaximize,
  onRestore,
  onMove,
  onResize,
  onAddGame,
  onDismissLimit,
  onDeposit,
  onDismissPrompt,
  onRegister,
  onPromptSignIn,
}: {
  panels: GamePanel[];
  focusedId: string | null;
  browsing: boolean;
  limitNotice: boolean;
  layout?: 'desktop' | 'mobile';
  balanceLabel?: string | null;
  showDeposit?: boolean;
  demoLevel?: DemoPromptLevel;
  onCloseAll: () => void;
  onClosePanel: (id: string) => void;
  onRetry: (id: string) => void;
  onFrameLoad: (id: string, attempt: number) => void;
  onLoadTimeout: (id: string, attempt: number) => void;
  onSignIn: (id: string) => void;
  onFocus: (id: string) => void;
  onKeepOpen: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  onRestore: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, frame: Frame) => void;
  onAddGame: () => void;
  onDismissLimit: () => void;
  onDeposit?: () => void;
  onDismissPrompt: (level: Exclude<DemoPromptLevel, 'none'>) => void;
  onRegister: (opener: HTMLElement) => void;
  onPromptSignIn: (opener: HTMLElement) => void;
}) {
  const t = useTranslations('workspace');
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const committed = useClientDesktop();
  const desktop = layout ? layout === 'desktop' : committed === true;
  const mobile = layout ? layout === 'mobile' : committed === false;
  const focused = panels.find((panel) => panel.id === focusedId) ?? panels[0];
  const atLimit = panels.length >= MAX_OPEN_GAMES;

  useEffect(() => {
    if (!mobile || browsing || panels.length === 0) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('[data-overlay]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseAll();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== 'Tab' || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.closest('[inert]'),
      );
      if (!focusable.length) return;
      event.preventDefault();
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const next = current < 0 ? (event.shiftKey ? focusable.length - 1 : 0) : current + step;
      focusable[(next + focusable.length) % focusable.length]?.focus();
    };
    const keepFocusInside = (event: FocusEvent) => {
      if (document.querySelector('[data-overlay]')) return;
      if (!dialog.current?.contains(event.target as Node)) closeButton.current?.focus();
    };
    addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', keepFocusInside);
    return () => {
      document.body.style.overflow = previousOverflow;
      removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', keepFocusInside);
    };
  }, [browsing, mobile, onCloseAll, panels.length]);

  useEffect(() => {
    if (!mobile || browsing || panels.length === 0) return;
    if (!dialog.current?.contains(document.activeElement)) closeButton.current?.focus();
  }, [browsing, mobile, panels.length, focusedId]);

  if (!focused) return null;

  if (desktop) {
    return (
      <ShellPortal>
        <DesktopGameLayer
          panels={panels}
          focusedId={focused.id}
          limitNotice={limitNotice}
          demoLevel={demoLevel}
          onCloseAll={onCloseAll}
          onClosePanel={onClosePanel}
          onRetry={onRetry}
          onFrameLoad={onFrameLoad}
          onLoadTimeout={onLoadTimeout}
          onSignIn={onSignIn}
          onFocus={onFocus}
          browsing={browsing}
          onKeepOpen={onKeepOpen}
          onMinimize={onMinimize}
          onMaximize={onMaximize}
          onRestore={onRestore}
          onMove={onMove}
          onResize={onResize}
          onAddGame={onAddGame}
          onDismissLimit={onDismissLimit}
          onDismissPrompt={onDismissPrompt}
          onRegister={onRegister}
          onPromptSignIn={onPromptSignIn}
        />
      </ShellPortal>
    );
  }

  if (!mobile) return null;

  const labelledBy = titleId;

  return (
    <div
      ref={dialog}
      role={browsing ? undefined : 'dialog'}
      aria-modal={browsing ? undefined : true}
      aria-labelledby={browsing ? undefined : labelledBy}
      className={
        browsing
          ? 'fixed inset-x-0 bottom-0 z-[80] border-t border-[var(--line)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)]'
          : 'fixed inset-0 z-[90] flex h-dvh flex-col bg-[var(--bg)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]'
      }
    >
      {!browsing && (
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-3">
          <button
            ref={closeButton}
            type="button"
            onClick={onCloseAll}
            className="btn btn-secondary inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] px-3 text-sm font-semibold"
          >
            <X aria-hidden size={18} />
            <span className="sr-only sm:not-sr-only">{t('backToLobby')}</span>
          </button>
          {showDeposit && (
            <div className="ms-auto flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-semibold tabular-nums">
                <span className="text-[var(--muted)]">{t('balance')} </span>
                <span data-testid="workspace-balance">{balanceLabel ?? '—'}</span>
              </p>
              <Button type="button" onClick={onDeposit} className="h-9 px-3">
                {t('deposit')}
              </Button>
            </div>
          )}
          <div className={`flex shrink-0 items-center gap-1.5 ${showDeposit ? '' : 'ms-auto'}`}>
            <FavoriteButton game={focused.launch.target.game} variant="tool" />
            <FullscreenButton target={stage} title={focused.launch.target.game.title} />
            <Button
              type="button"
              variant="secondary"
              onClick={onAddGame}
              disabled={atLimit}
              aria-label={t('addGame')}
              className="add-game-button h-9 px-2.5 sm:px-3"
            >
              <Plus aria-hidden size={16} />
              <span className="sr-only sm:not-sr-only">{t('addGame')}</span>
            </Button>
          </div>
        </div>
      )}
      {limitNotice && !browsing && (
        <p role="status" className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm">
          {t('gameLimit')}
          <button type="button" className="ms-3 font-semibold underline" onClick={onDismissLimit}>
            {t('dismiss')}
          </button>
        </p>
      )}
      {(browsing || mobile) && (
        <GameSwitcher
          panels={panels}
          focusedId={focused.id}
          onFocus={onFocus}
          onClose={onClosePanel}
          onAdd={onAddGame}
          addDisabled={atLimit}
        />
      )}
      <div
        ref={stage}
        data-game-live-host=""
        aria-hidden={browsing || undefined}
        inert={browsing || undefined}
        className={
          browsing
            ? 'game-live-parked pointer-events-none fixed top-0 left-0 h-dvh w-screen'
            : 'relative min-h-0 flex-1 bg-[var(--bg)]'
        }
      >
        {panels.map((panel) => {
          const parked = panel.id !== focused.id;
          return (
            <div
              key={panel.id}
              data-game-parked={parked ? '' : undefined}
              inert={parked || undefined}
              className={`absolute inset-0 flex flex-col${parked ? ' game-live-parked' : ''}`}
            >
              <div className="shrink-0 px-3 py-2">
                <h2 id={panel.id === focused.id ? titleId : undefined} className="truncate text-sm font-bold">
                  {panel.launch.target.game.title}
                </h2>
                <p className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--muted)]">
                  <span className="truncate">{providerName(panel, t('independent'))}</span>
                  {panel.launch.target.mode === 'demo' && <span className="game-mode-chip">{t('demo')}</span>}
                </p>
              </div>
              <GameFrame
                state={panel.launch}
                onRetry={() => onRetry(panel.id)}
                onFrameLoad={(attempt) => onFrameLoad(panel.id, attempt)}
                onLoadTimeout={(attempt) => onLoadTimeout(panel.id, attempt)}
                onSignIn={() => onSignIn(panel.id)}
                onBackToLobby={onCloseAll}
              />
            </div>
          );
        })}
        {!browsing && (
          <DemoPrompt
            level={demoLevel}
            onDismiss={onDismissPrompt}
            onRegister={onRegister}
            onSignIn={onPromptSignIn}
          />
        )}
      </div>
      {!browsing && <GameInfo compact game={focused.launch.target.game} />}
    </div>
  );
}

function GameSwitcher({
  panels,
  focusedId,
  onFocus,
  onClose,
  onAdd,
  addDisabled,
}: {
  panels: GamePanel[];
  focusedId: string;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  addDisabled: boolean;
}) {
  const t = useTranslations('workspace');
  return (
    <div role="tablist" aria-label={t('openGames')} className="flex gap-2 overflow-x-auto px-3 py-2">
      {panels.map((panel) => {
        const title = panel.launch.target.game.title;
        const selected = panel.id === focusedId;
        return (
          <div
            key={panel.id}
            className={`fade-enter flex h-12 shrink-0 items-center rounded-[var(--radius-pill)] border transition-[border-color,background-color,box-shadow] duration-[var(--dur-normal)] ${
              selected
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[inset_0_0_0_1px_var(--accent)]'
                : 'border-[var(--line)] bg-[var(--surface)]'
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onFocus(panel.id)}
              className="pressable flex h-full min-w-0 items-center gap-2 rounded-[var(--radius-pill)] px-2 text-start"
            >
              <span className="size-8 shrink-0 overflow-hidden rounded-full">
                <GameThumbnail game={panel.launch.target.game} />
              </span>
              <span className="max-w-32 truncate text-sm font-semibold">{title}</span>
            </button>
            <button
              type="button"
              aria-label={t('closeGame', { title })}
              onClick={() => onClose(panel.id)}
              data-close=""
              className="window-control me-1 inline-grid size-8 items-center justify-center rounded-full"
            >
              <X aria-hidden size={14} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        disabled={addDisabled}
        className="add-game-button btn inline-flex h-12 shrink-0 items-center gap-1 rounded-[var(--radius-pill)] border border-dashed border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 text-sm font-semibold text-[var(--accent-strong)] disabled:opacity-50"
      >
        <Plus aria-hidden size={16} />
        {t('addGame')}
      </button>
    </div>
  );
}

export function GameView({
  state,
  onClose,
  onRetry,
  onFrameLoad,
  onSignIn,
}: {
  state: GameLaunchState;
  onClose: () => void;
  onRetry: () => void;
  onFrameLoad: (attempt: number) => void;
  onSignIn?: () => void;
}) {
  if (state.status === 'idle') return null;
  const panel: GamePanel = {
    id: state.target.game.id,
    launch: state,
    presentation: 'floating',
    frame: defaultFrame(0),
    restoreFrame: null,
    z: 1,
  };
  const noop = () => {};
  return (
    <GameWorkspace
      panels={[panel]}
      focusedId={panel.id}
      browsing={false}
      limitNotice={false}
      layout="mobile"
      demoLevel="none"
      onCloseAll={onClose}
      onClosePanel={onClose}
      onRetry={onRetry}
      onFrameLoad={(_id, attempt) => onFrameLoad(attempt)}
      onLoadTimeout={noop}
      onSignIn={() => onSignIn?.()}
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
  );
}

export type { WorkspaceState };
