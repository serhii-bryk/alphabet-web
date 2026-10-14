'use client';

import { memo, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { ArrowLeft, Info, Maximize2, Minimize2, PictureInPicture2, Plus, Shrink, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GameThumbnail } from '../game-card';
import { Button } from '../ui';
import { GameFrame } from './game-frame';
import { GameInfo } from './game-info';
import { FavoriteButton } from '../personalization/favorite-button';
import { FullscreenButton, ToolButton } from './game-toolbar';
import type { Frame, GamePanel } from './workspace-state';

const iconButton =
  'window-control inline-grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--muted)]';

interface GameWindowProps {
  panel: GamePanel;
  focused: boolean;
  browsing?: boolean;
  showDeposit?: boolean;
  balanceLabel?: string | null;
  onDeposit?: () => void;
  onFocus: () => void;
  onClose: () => void;
  onKeepOpen: () => void;
  onAddGame: () => void;
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
  // Keep the latest handlers for pointer listeners without recreating the window.
  // eslint-disable-next-line react-hooks/refs
  live.current = props;
  return (
    <GameWindowBody
      panel={props.panel}
      focused={props.focused}
      browsing={props.browsing}
      showDeposit={props.showDeposit}
      balanceLabel={props.balanceLabel}
      live={live}
    />
  );
}

function usePopOutTransition(section: RefObject<HTMLElement | null>, presentation: GamePanel['presentation']) {
  const from = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    const start = from.current;
    from.current = null;
    const element = section.current;
    if (!start || !element || presentation !== 'floating') return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || typeof element.animate !== 'function') return;
    const end = element.getBoundingClientRect();
    if (!end.width || !end.height) return;
    const scaleX = start.width / end.width;
    const scaleY = start.height / end.height;
    element.animate(
      [
        { transformOrigin: 'top left', transform: `translate(${start.left - end.left}px, ${start.top - end.top}px) scale(${scaleX}, ${scaleY})`, opacity: 0.85 },
        { transformOrigin: 'top left', transform: 'none', opacity: 1 },
      ],
      { duration: 280, easing: 'cubic-bezier(.22, .8, .24, 1)' },
    );
  }, [presentation, section]);
  return (element: HTMLElement | null) => {
    from.current = element?.getBoundingClientRect() ?? null;
  };
}

const GameWindowBody = memo(function GameWindowBody({
  panel,
  focused,
  browsing = false,
  showDeposit = false,
  balanceLabel,
  live,
}: {
  panel: GamePanel;
  focused: boolean;
  browsing?: boolean;
  showDeposit?: boolean;
  balanceLabel?: string | null;
  live: RefObject<GameWindowProps>;
}) {
  const t = useTranslations('workspace');
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { game } = panel.launch.target;
  const provider = game.provider?.displayName || game.provider?.name || t('independent');
  const demo = panel.launch.target.mode === 'demo';
  const page = panel.presentation === 'page';
  const docked = page || panel.presentation === 'background';
  const maximized = panel.presentation === 'maximized';
  const floating = panel.presentation === 'floating';
  const titleId = `game-window-${panel.id}`;
  const infoId = `game-info-${panel.id}`;
  const capturePopOutOrigin = usePopOutTransition(section, panel.presentation);

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

  const popOut = () => {
    capturePopOutOrigin(section.current);
    live.current.onKeepOpen();
  };
  const parked =
    panel.presentation === 'minimized' ||
    panel.presentation === 'background' ||
    (browsing && page);
  const livePage = page && !parked;
  const resizable = floating;

  const style = livePage || docked || maximized
    ? { zIndex: panel.z }
    : {
        left: `calc(var(--game-origin-x) + ${panel.frame.x}px)`,
        top: `calc(var(--header-h) + ${panel.frame.y}px)`,
        width: panel.frame.width,
        height: panel.frame.height,
        zIndex: panel.z,
      };

  return (
    <section
      ref={section}
      aria-label={game.title}
      data-game-page={livePage ? '' : undefined}
      data-game-parked={parked ? '' : undefined}
      inert={parked || undefined}
      onPointerDown={() => live.current.onFocus()}
      data-focused={focused && !docked ? '' : undefined}
      data-open-game={docked ? '' : undefined}
      style={style}
      className={
        `${
          livePage
            ? 'game-page-window pointer-events-auto relative flex flex-col bg-[var(--bg)]'
            : docked
              ? 'pointer-events-auto absolute inset-0 flex flex-col overflow-hidden bg-[var(--bg)]'
              : `game-float pointer-events-auto fixed flex flex-col overflow-hidden rounded-[var(--radius-md)] border bg-[var(--surface)] shadow-[var(--shadow-1)] ${
                  maximized ? 'game-float-max' : ''
                } ${focused ? 'border-[var(--accent)]' : 'border-[var(--line)]'}`
        }${parked ? ' game-live-parked' : ''}`
      }
    >
      <div
        onPointerDown={onTitlePointerDown}
        className={`game-page-toolbar relative z-20 flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-3 ${
          docked
            ? 'h-14 bg-[var(--surface)]'
            : `game-float-chrome h-11 cursor-grab select-none px-2 active:cursor-grabbing ${focused ? 'bg-[var(--accent-soft)]' : 'bg-[var(--surface)]'}`
        }`}
      >
        {docked && (
          <button
            type="button"
            onClick={() => live.current.onClose()}
            className="btn btn-secondary inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--line)] px-3 text-sm font-semibold"
          >
            <ArrowLeft aria-hidden size={16} className="rtl:-scale-x-100" />
            <span className="sr-only sm:not-sr-only">{t('backToLobby')}</span>
          </button>
        )}
        <span className="size-7 shrink-0 overflow-hidden rounded-[var(--radius-sm)]">
          <GameThumbnail game={game} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={focused ? titleId : undefined} className="truncate text-sm font-bold">
            {game.title}
          </h2>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--muted)]">
            <span className="truncate">{provider}</span>
            {demo && <span className="game-mode-chip">{t('demo')}</span>}
          </p>
        </div>
        {docked ? (
          <div role="toolbar" aria-label={t('gameControls')} className="game-toolbar">
            {showDeposit && (
              <div className="mobile-only me-1 flex items-center gap-2">
                <p className="max-w-28 truncate text-sm font-semibold tabular-nums">
                  <span className="text-[var(--muted)]">{t('balance')} </span>
                  <span data-testid="workspace-balance">{balanceLabel ?? '—'}</span>
                </p>
                <Button type="button" onClick={() => live.current.onDeposit?.()} className="h-9 px-3">
                  {t('deposit')}
                </Button>
              </div>
            )}
            <FavoriteButton game={game} variant="tool" />
            <FullscreenButton target={stage} title={game.title} />
            <ToolButton className="desktop-only" label={t('popOutTitle', { title: game.title })} tip={t('popOut')} onClick={popOut} data-pop-out="">
              <PictureInPicture2 aria-hidden size={17} />
            </ToolButton>
            <ToolButton label={t('addGame')} onClick={() => live.current.onAddGame()} data-add-game="">
              <Plus aria-hidden size={17} />
            </ToolButton>
            <ToolButton
              label={t('infoTitle')}
              onClick={() => {
                const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
                document.getElementById(infoId)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
              }}
            >
              <Info aria-hidden size={17} />
            </ToolButton>
          </div>
        ) : (
          <>
            <FavoriteButton game={game} variant="tool" />
            <FullscreenButton target={stage} title={game.title} />
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
            <button type="button" data-close="" className={iconButton} aria-label={t('closeGame', { title: game.title })} onClick={() => live.current.onClose()}>
              <X aria-hidden size={15} />
            </button>
          </>
        )}
      </div>
      <div
        ref={stage}
        className={`game-stage flex min-h-0 flex-col bg-black ${livePage ? 'shrink-0' : 'flex-1'}`}
      >
        <GameFrame
          state={panel.launch}
          onRetry={() => live.current.onRetry()}
          onFrameLoad={(attempt) => live.current.onFrameLoad(attempt)}
          onLoadTimeout={(attempt) => live.current.onLoadTimeout(attempt)}
          onSignIn={() => live.current.onSignIn?.()}
          onBackToLobby={() => live.current.onBackToLobby()}
        />
      </div>
      {docked && <GameInfo id={infoId} game={game} />}
      {resizable && (
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
