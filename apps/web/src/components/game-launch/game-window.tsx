'use client';

import { memo, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Maximize2, Minimize2, Shrink, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GameThumbnail } from '../game-card';
import { GameFrame } from './game-frame';
import { GameInfo } from './game-info';
import type { Frame, GamePanel } from './workspace-state';

const iconButton =
  'inline-grid size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]';

interface GameWindowProps {
  panel: GamePanel;
  focused: boolean;
  onFocus: () => void;
  onClose: () => void;
  onKeepOpen: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onRestore: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (frame: Frame) => void;
  onRetry: () => void;
  onFrameLoad: (attempt: number) => void;
  onLoadTimeout: (attempt: number) => void;
  onSignIn?: () => void;
  onBackToLobby: () => void;
}

export function GameWindow(props: GameWindowProps) {
  const live = useRef(props);
  live.current = props;
  return <GameWindowBody panel={props.panel} focused={props.focused} live={live} />;
}

const GameWindowBody = memo(function GameWindowBody({
  panel,
  focused,
  live,
}: {
  panel: GamePanel;
  focused: boolean;
  live: RefObject<GameWindowProps>;
}) {
  const t = useTranslations('workspace');
  const { game } = panel.launch.target;
  const provider = game.provider?.displayName || game.provider?.name || t('independent');
  const modeLabel = panel.launch.target.mode === 'demo' ? t('demo') : t('real');
  const page = panel.presentation === 'page';
  const maximized = panel.presentation === 'maximized';
  const floating = panel.presentation === 'floating';
  const titleId = `game-window-${panel.id}`;

  const onTitlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!floating || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    live.current.onFocus();
    const originX = panel.frame.x;
    const originY = panel.frame.y;
    const startX = event.clientX;
    const startY = event.clientY;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      live.current.onMove(originX + ev.clientX - startX, originY + ev.clientY - startY);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!floating || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    live.current.onFocus();
    const origin = panel.frame;
    const startX = event.clientX;
    const startY = event.clientY;
    const rtl = document.documentElement.dir === 'rtl';
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      live.current.onResize(
        rtl
          ? { x: origin.x + dx, y: origin.y, width: origin.width - dx, height: origin.height + dy }
          : { x: origin.x, y: origin.y, width: origin.width + dx, height: origin.height + dy },
      );
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const style = page || maximized
    ? { zIndex: panel.z }
    : { left: panel.frame.x, top: panel.frame.y, width: panel.frame.width, height: panel.frame.height, zIndex: panel.z };

  return (
    <section
      aria-label={game.title}
      data-game-page={page ? '' : undefined}
      hidden={panel.presentation === 'minimized'}
      onPointerDown={() => live.current.onFocus()}
      style={style}
      className={
        page
          ? 'pointer-events-auto absolute inset-0 flex flex-col overflow-hidden bg-[var(--bg)] pb-20'
          : `game-float pointer-events-auto absolute flex flex-col overflow-hidden rounded-[var(--radius-md)] border bg-[var(--surface)] shadow-[var(--shadow-1)] ${
              maximized ? 'inset-2' : ''
            } ${focused ? 'border-[var(--accent)]' : 'border-[var(--line)]'}`
      }
    >
      <div
        onPointerDown={onTitlePointerDown}
        className={`relative z-20 flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-3 ${
          page ? 'h-14 bg-[var(--surface)]' : 'h-11 cursor-grab px-2 active:cursor-grabbing'
        }`}
      >
        {page && (
          <button
            type="button"
            onClick={() => live.current.onClose()}
            className="inline-flex h-9 shrink-0 items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-sm font-semibold hover:bg-[var(--surface-3)]"
          >
            {t('backToLobby')}
          </button>
        )}
        <span className="size-7 shrink-0 overflow-hidden rounded-[var(--radius-sm)]">
          <GameThumbnail game={game} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={focused ? titleId : undefined} className="truncate text-sm font-bold">
            {game.title}
          </h2>
          <p className="truncate text-xs text-[var(--muted)]">
            {provider} · {modeLabel}
          </p>
        </div>
        {page ? (
          <button
            type="button"
            data-keep-open=""
            onClick={() => live.current.onKeepOpen()}
            className="inline-flex h-9 shrink-0 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-sm font-black text-[var(--accent-contrast)] hover:bg-[var(--accent-strong)]"
          >
            {t('keepOpen')}
          </button>
        ) : (
          <>
            <button type="button" className={iconButton} aria-label={t('minimize', { title: game.title })} onClick={() => live.current.onMinimize()}>
              <Minimize2 aria-hidden size={15} />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={maximized ? t('restore', { title: game.title }) : t('maximize', { title: game.title })}
              onClick={() => (maximized ? live.current.onRestore() : live.current.onMaximize())}
            >
              {maximized ? <Shrink aria-hidden size={15} /> : <Maximize2 aria-hidden size={15} />}
            </button>
            <button type="button" className={iconButton} aria-label={t('closeGame', { title: game.title })} onClick={() => live.current.onClose()}>
              <X aria-hidden size={15} />
            </button>
          </>
        )}
      </div>
      <GameFrame
        state={panel.launch}
        onRetry={() => live.current.onRetry()}
        onFrameLoad={(attempt) => live.current.onFrameLoad(attempt)}
        onLoadTimeout={(attempt) => live.current.onLoadTimeout(attempt)}
        onSignIn={() => live.current.onSignIn?.()}
        onBackToLobby={() => live.current.onBackToLobby()}
      />
      {page && <GameInfo game={game} />}
      {floating && (
        <button
          type="button"
          aria-label={t('resize', { title: game.title })}
          onPointerDown={onResizePointerDown}
          className="absolute bottom-0 end-0 z-20 size-4 cursor-nwse-resize"
        />
      )}
      {!focused && (
        <button
          type="button"
          aria-label={t('focus', { title: game.title })}
          className="absolute inset-0 z-10"
          onClick={() => live.current.onFocus()}
        />
      )}
    </section>
  );
});

export function focusedWindowTitleId(panelId: string) {
  return `game-window-${panelId}`;
}
