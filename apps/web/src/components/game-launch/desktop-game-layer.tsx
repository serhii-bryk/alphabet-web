'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GameThumbnail } from '../game-card';
import { DemoPrompt } from './demo-prompt';
import { GameWindow } from './game-window';
import type { DemoPromptLevel } from './demo-play';
import { MAX_OPEN_GAMES, type Frame, type GamePanel } from './workspace-state';

export function SlotPortal({ id, children }: { id: string; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    // The slot is committed with the shell, so it is only available after this render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(document.getElementById(id));
  }, [id]);
  if (!slot) return null;
  return createPortal(children, slot);
}

export function OpenGamesBar({
  panels,
  focusedId,
  limitNotice,
  onClosePanel,
  onFocus,
  onAddGame,
  onDismissLimit,
}: {
  panels: GamePanel[];
  focusedId: string | null;
  limitNotice: boolean;
  onClosePanel: (id: string) => void;
  onFocus: (id: string) => void;
  onAddGame: () => void;
  onDismissLimit: () => void;
}) {
  const t = useTranslations('workspace');
  const atLimit = panels.length >= MAX_OPEN_GAMES;
  const minimized = panels.filter((panel) => panel.presentation === 'minimized');
  const switcherPanels = panels.filter((panel) => panel.presentation !== 'minimized');
  const pageId = panels.find((panel) => panel.presentation === 'page')?.id ?? null;
  if (panels.length === 0) return null;

  return (
    <div className="open-games-bar pointer-events-none">
      {limitNotice && (
        <p
          role="status"
          className="pointer-events-auto mb-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm shadow-[var(--shadow-2)]"
        >
          {t('gameLimit')}
          <button type="button" className="ms-3 font-semibold underline" onClick={onDismissLimit}>
            {t('dismiss')}
          </button>
        </p>
      )}
      <div className="flex items-end gap-3">
        {switcherPanels.length > 0 && (
          <div
            role="tablist"
            aria-label={t('openGames')}
            data-open-games=""
            className="pointer-events-auto flex min-w-0 flex-1 gap-2 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-2)]"
          >
            {switcherPanels.map((panel) => {
              const title = panel.launch.target.game.title;
              const selected = pageId ? panel.id === pageId : panel.id === focusedId;
              return (
                <div
                  key={panel.id}
                  className={`fade-enter flex h-12 shrink-0 items-center rounded-[var(--radius-md)] border ${
                    selected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--bg)]'
                  }`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => onFocus(panel.id)}
                    className="pressable flex h-full items-center gap-2 rounded-[var(--radius-md)] px-2"
                  >
                    <span className="size-8 overflow-hidden rounded-[var(--radius-sm)]">
                      <GameThumbnail game={panel.launch.target.game} />
                    </span>
                    <span className="max-w-40 truncate text-sm font-semibold">{title}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('closeGame', { title })}
                    onClick={() => onClosePanel(panel.id)}
                    data-close=""
                    className="window-control me-1 inline-grid size-8 place-items-center rounded-[var(--radius-sm)]"
                  >
                    <X aria-hidden size={14} />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              data-add-game=""
              onClick={onAddGame}
              disabled={atLimit}
              className="add-game-button btn inline-flex h-12 shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-dashed border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 text-sm font-semibold text-[var(--accent-strong)] disabled:opacity-50"
            >
              <Plus aria-hidden size={16} />
              {t('addGame')}
            </button>
          </div>
        )}
        {minimized.length > 0 && (
          <div
            aria-label={t('openGames')}
            className="pointer-events-auto flex min-w-0 flex-1 gap-2 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-2)]"
          >
            {minimized.map((panel) => {
              const title = panel.launch.target.game.title;
              return (
                <div
                  key={panel.id}
                  className="fade-enter flex h-12 shrink-0 items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] transition-[border-color,box-shadow] duration-[var(--dur-normal)] hover:border-[var(--accent-line)] hover:shadow-[var(--shadow-1)]"
                >
                  <button
                    type="button"
                    onClick={() => onFocus(panel.id)}
                    className="pressable flex h-full items-center gap-2 rounded-[var(--radius-md)] px-2"
                  >
                    <span className="size-8 overflow-hidden rounded-[var(--radius-sm)]">
                      <GameThumbnail game={panel.launch.target.game} />
                    </span>
                    <span className="max-w-40 truncate text-sm font-semibold">{title}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('closeGame', { title })}
                    onClick={() => onClosePanel(panel.id)}
                    data-close=""
                    className="window-control me-1 inline-grid size-8 place-items-center rounded-[var(--radius-sm)]"
                  >
                    <X aria-hidden size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function DesktopGameLayer({
  panels,
  focusedId,
  limitNotice,
  demoLevel = 'none',
  onCloseAll,
  onClosePanel,
  onRetry,
  onFrameLoad,
  onLoadTimeout,
  onSignIn,
  onFocus,
  browsing = false,
  showDeposit = false,
  balanceLabel = null,
  onDeposit,
  onKeepOpen,
  onMinimize,
  onMaximize,
  onRestore,
  onMove,
  onResize,
  onAddGame,
  onDismissLimit,
  onDismissPrompt,
  onRegister,
  onPromptSignIn,
}: {
  panels: GamePanel[];
  focusedId: string | null;
  limitNotice: boolean;
  demoLevel?: DemoPromptLevel;
  browsing?: boolean;
  showDeposit?: boolean;
  balanceLabel?: string | null;
  onDeposit?: () => void;
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
  onDismissPrompt: (level: Exclude<DemoPromptLevel, 'none'>) => void;
  onRegister: (opener: HTMLElement) => void;
  onPromptSignIn: (opener: HTMLElement) => void;
}) {
  const focused = panels.find((panel) => panel.id === focusedId) ?? panels[0];
  const pageActive = !browsing && panels.some((panel) => panel.presentation === 'page');
  if (!focused) return null;

  return (
    <>
      <OpenGamesBar
        panels={panels}
        focusedId={focused.id}
        limitNotice={limitNotice}
        onClosePanel={onClosePanel}
        onFocus={onFocus}
        onAddGame={onAddGame}
        onDismissLimit={onDismissLimit}
      />
      <div
        id="desktop-game-layer"
        data-desktop-game-layer=""
        data-game-live-host=""
        className={`game-page-host${pageActive ? '' : ' game-page-host-parked pointer-events-none'}`}
      >
        {panels.map((panel) => (
          <GameWindow
            key={panel.id}
            panel={panel}
            focused={panel.id === focused.id}
            onFocus={() => onFocus(panel.id)}
            onClose={() => onClosePanel(panel.id)}
            browsing={browsing}
            showDeposit={showDeposit}
            balanceLabel={balanceLabel}
            onDeposit={onDeposit}
            onKeepOpen={() => onKeepOpen(panel.id)}
            onAddGame={onAddGame}
            onMinimize={() => onMinimize(panel.id)}
            onMaximize={() => onMaximize(panel.id)}
            onRestore={() => onRestore(panel.id)}
            onMove={(x, y) => onMove(panel.id, x, y)}
            onResize={(frame) => onResize(panel.id, frame)}
            onRetry={() => onRetry(panel.id)}
            onFrameLoad={(attempt) => onFrameLoad(panel.id, attempt)}
            onLoadTimeout={(attempt) => onLoadTimeout(panel.id, attempt)}
            onSignIn={() => onSignIn(panel.id)}
            onBackToLobby={onCloseAll}
          />
        ))}
        <DemoPrompt
          level={demoLevel}
          className="game-demo-prompt pointer-events-none absolute inset-x-3 z-30 flex justify-center"
          onDismiss={onDismissPrompt}
          onRegister={onRegister}
          onSignIn={onPromptSignIn}
        />
      </div>
    </>
  );
}
