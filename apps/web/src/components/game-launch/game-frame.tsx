'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, LoaderCircle, LogIn, RotateCcw } from 'lucide-react';
import type { GameLaunchErrorCode, GameLaunchMode } from '@brand/contracts';
import { useTranslations } from 'next-intl';
import { Button } from '../ui';
import { GAME_LOAD_TIMEOUT_MS, isRetryable, type GameLaunchState } from './state';
import type { ActiveLaunch } from './workspace-state';

function Spinner() {
  return (
    <LoaderCircle
      aria-hidden
      size={28}
      className="animate-spin text-[var(--accent)] motion-reduce:animate-none"
    />
  );
}

function StatusPanel({
  role,
  icon,
  title,
  body,
  children,
}: {
  role: 'status' | 'alert';
  icon: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--bg)] p-6">
      <div role={role} className="flex max-w-sm flex-col items-center gap-3 text-center">
        {icon}
        <p className="text-base font-bold">{title}</p>
        {body && <p className="text-sm text-[var(--muted)]">{body}</p>}
        {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
      </div>
    </div>
  );
}

export function GameFrame({
  state,
  onRetry,
  onFrameLoad,
  onLoadTimeout,
  onSignIn,
  onBackToLobby,
}: {
  state: ActiveLaunch;
  onRetry: () => void;
  onFrameLoad: (attempt: number) => void;
  onLoadTimeout: (attempt: number) => void;
  onSignIn?: () => void;
  onBackToLobby: () => void;
}) {
  const t = useTranslations('workspace');
  const [dismissedSlowAttempt, setDismissedSlowAttempt] = useState<number | null>(null);
  const onLoadTimeoutRef = useRef(onLoadTimeout);
  useEffect(() => {
    onLoadTimeoutRef.current = onLoadTimeout;
  });
  const launchUrl = 'launchUrl' in state ? state.launchUrl : null;
  const mode: GameLaunchMode = state.target.mode;
  const title = state.target.game.title;
  const frameTitle = `${title} ${mode === 'demo' ? t('frameDemo') : t('frameReal')}`;

  useEffect(() => {
    if (state.status !== 'loading') return;
    const timer = window.setTimeout(
      () => onLoadTimeoutRef.current(state.attempt),
      GAME_LOAD_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.attempt, state.status]);

  const errorCopy: Record<GameLaunchErrorCode, { title: string; body: string }> = {
    auth_required: { title: t('errorAuthTitle'), body: t('errorAuthBody') },
    game_unavailable: { title: t('errorUnavailableTitle'), body: t('errorUnavailableBody') },
    demo_unavailable: { title: t('errorDemoTitle'), body: t('errorDemoBody') },
    game_not_found: { title: t('errorMissingTitle'), body: t('errorMissingBody') },
    invalid_game_id: { title: t('errorInvalidTitle'), body: t('errorInvalidBody') },
    launch_unavailable: {
      title: mode === 'demo' ? t('failedDemo') : t('failedReal'),
      body: t('errorLaunchBody'),
    },
  };

  return (
    <div className="relative min-h-0 flex-1 bg-black">
      {launchUrl && (
        <iframe
          key={state.attempt}
          src={launchUrl}
          title={frameTitle}
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => onFrameLoad(state.attempt)}
          className="absolute inset-0 size-full border-0"
        />
      )}
      {state.status === 'launching' && (
        <StatusPanel
          role="status"
          icon={<Spinner />}
          title={mode === 'demo' ? t('startingDemo') : t('startingReal')}
        />
      )}
      {(state.status === 'loading' ||
        (state.status === 'slow' && dismissedSlowAttempt === state.attempt)) && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <p
            role="status"
            className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold shadow"
          >
            <LoaderCircle
              aria-hidden
              size={14}
              className="animate-spin text-[var(--accent)] motion-reduce:animate-none"
            />
            {t('loading')}
          </p>
        </div>
      )}
      {state.status === 'slow' && dismissedSlowAttempt !== state.attempt && (
        <div className="absolute inset-x-3 bottom-3 flex justify-center">
          <div
            role="status"
            className="flex w-full max-w-md flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <CircleAlert aria-hidden size={20} className="mt-0.5 shrink-0 text-[var(--warning)]" />
              <div>
                <p className="text-sm font-bold">{t('slowTitle')}</p>
                <p className="text-sm text-[var(--muted)]">{t('slowBody')}</p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                onClick={onRetry}
                className="bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]"
              >
                <RotateCcw aria-hidden size={16} />
                {t('reload')}
              </Button>
              <Button type="button" onClick={() => setDismissedSlowAttempt(state.attempt)}>
                {t('keepWaiting')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {state.status === 'error' && (
        <StatusPanel
          role="alert"
          icon={<CircleAlert aria-hidden size={28} className="text-[var(--warning)]" />}
          title={errorCopy[state.code].title}
          body={errorCopy[state.code].body}
        >
          {state.code === 'auth_required' && onSignIn && (
            <Button type="button" onClick={onSignIn}>
              <LogIn aria-hidden size={16} />
              {t('signIn')}
            </Button>
          )}
          {isRetryable(state) && (
            <Button type="button" onClick={onRetry}>
              <RotateCcw aria-hidden size={16} />
              {t('retry')}
            </Button>
          )}
          <Button
            type="button"
            onClick={onBackToLobby}
            className="bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]"
          >
            {t('backToLobby')}
          </Button>
        </StatusPanel>
      )}
    </div>
  );
}

export type { GameLaunchState };
