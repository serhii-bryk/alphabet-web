'use client';

import { useEffect } from 'react';
import { DesktopGameLayer, SlotPortal } from './desktop-game-layer';
import type { DemoPromptLevel } from './demo-play';
import { defaultFrame, type Frame, type GamePanel, type WorkspaceState } from './workspace-state';
import type { GameLaunchState } from './state';

const pageSlotId = 'game-page-slot';

export function GameWorkspaceView({
  onCloseAll,
  browsing,
  panels,
  focusedId,
  ...rest
}: Parameters<typeof DesktopGameLayer>[0]) {
  const pageActive = !browsing && panels.some((panel) => panel.presentation === 'page');

  useEffect(() => {
    const shell = document.getElementById('app-shell');
    if (!shell) return;
    shell.setAttribute('data-has-open-games', '');
    if (pageActive) shell.setAttribute('data-game-page-active', '');
    else shell.removeAttribute('data-game-page-active');
  }, [pageActive]);

  useEffect(() => {
    return () => {
      const shell = document.getElementById('app-shell');
      shell?.removeAttribute('data-has-open-games');
      shell?.removeAttribute('data-game-page-active');
    };
  }, []);

  useEffect(() => {
    if (!pageActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[data-overlay]')) return;
      event.preventDefault();
      onCloseAll();
    };
    addEventListener('keydown', onKeyDown);
    return () => removeEventListener('keydown', onKeyDown);
  }, [pageActive, onCloseAll]);

  useEffect(() => {
    if (!pageActive) return;
    // The shell padding already sits the player below the fixed header.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pageActive, focusedId]);

  return (
    <DesktopGameLayer
      {...rest}
      onCloseAll={onCloseAll}
      browsing={browsing}
      panels={panels}
      focusedId={focusedId}
    />
  );
}

export function GameWorkspace(props: Parameters<typeof GameWorkspaceView>[0]) {
  return (
    <SlotPortal id={pageSlotId}>
      <GameWorkspaceView {...props} />
    </SlotPortal>
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
    presentation: 'page',
    frame: defaultFrame(0),
    restoreFrame: null,
    z: 1,
  };
  const noop = () => {};
  return (
    <GameWorkspaceView
      panels={[panel]}
      focusedId={panel.id}
      browsing={false}
      limitNotice={false}
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

export type { DemoPromptLevel, Frame, WorkspaceState };
