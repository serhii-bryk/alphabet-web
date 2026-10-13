'use client';

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, LogIn, RotateCcw } from 'lucide-react';
import type { GameLaunchErrorCode, GameLaunchMode } from '@brand/contracts';
import { useTranslations } from 'next-intl';
import { AlphaBetLoader } from '../alphabet-loader';
import { Button } from '../ui';
import { GAME_LOAD_TIMEOUT_MS, isRetryable, type GameLaunchState } from './state';
import type { ActiveLaunch } from './workspace-state';

function Spinner() {
  return <AlphaBetLoader size="lg" />;
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
      <div role={role} className="motion-enter flex max-w-sm flex-col items-center gap-3 text-center">
        {icon}
        <p className="text-base font-bold">{title}</p>
        {body && <p className="text-sm text-[var(--muted)]">{body}</p>}
        {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
      </div>
    </div>
  );
}

const StableGameIframe = memo(function StableGameIframe({
  attempt,
  src,
  title,
  onLoad,
}: {
  attempt: number;
  src: string;
  title: string;
  onLoad: () => void;
}) {
  return (
    <iframe
      key={attempt}
      src={src}
      title={title}
      allow="autoplay; fullscreen; encrypted-media"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={onLoad}
      className="absolute inset-0 size-full border-0"
    />
  );
});

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
  const onFrameLoadRef = useRef(onFrameLoad);
  onFrameLoadRef.current = onFrameLoad;
  const handleFrameLoad = useCallback(() => {
    onFrameLoadRef.current(state.attempt);
  }, [state.attempt]);

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
        <StableGameIframe
          attempt={state.attempt}
          src={launchUrl}
          title={frameTitle}
          onLoad={handleFrameLoad}
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
            className="fade-enter flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold shadow-[var(--shadow-2)]"
          >
            <AlphaBetLoader size="sm" />
            {t('loading')}
          </p>
        </div>
      )}
      {state.status === 'slow' && dismissedSlowAttempt !== state.attempt && (
        <div className="absolute inset-x-3 bottom-3 flex justify-center">
          <div
            role="status"
            className="panel motion-enter flex w-full max-w-md flex-col gap-3 rounded-[var(--radius-md)] p-4 shadow-[var(--shadow-pop)]"
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
                variant="secondary"
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
            variant="secondary"
          >
            {t('backToLobby')}
          </Button>
        </StatusPanel>
      )}
    </div>
  );
}

export type { GameLaunchState };
