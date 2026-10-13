'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { SportsLaunchErrorCode, SportsLaunchResponse } from '@brand/contracts';
import { isAbortError } from '@/data/browser-json';
import { SportsRequestError, requestSportsLaunch } from '@/data/sports-browser';
import { useAuthDialog } from '../auth/auth-provider';
import { useEndSession, useSession } from '../auth/session';
import { AlphaBetLoader } from '../alphabet-loader';
import { Button } from '../ui';
import {
  SPORTS_LOAD_TIMEOUT_MS,
  acceptSportsbookMessage,
  launchIsUsable,
  launchStillValid,
  sportsLaunchKey,
} from './launch';

type Launch = SportsLaunchResponse & { key: string };
type Phase = 'pending' | 'requesting' | 'loading' | 'ready' | 'error';

export function Sportsbook({ path }: { path?: string }) {
  const locale = useLocale();
  const t = useTranslations('sportsbook');
  const { status, session } = useSession();
  const endSession = useEndSession();
  const { openLogin, openRegistration } = useAuthDialog();
  const launchRef = useRef<Launch | null>(null);
  const renewingRef = useRef(false);
  const suppressGuestRef = useRef(false);
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [phase, setPhase] = useState<Phase>('pending');
  const [error, setError] = useState<SportsLaunchErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);
  const activeLocale = locale === 'ar' ? 'ar' : 'en';
  const playerId = session?.playerId ?? null;
  const identity = status === 'authenticated' ? 'authenticated' : 'guest';

  useEffect(() => {
    if (status === 'pending') return;
    if (status === 'guest' && suppressGuestRef.current) return;
    const key = sportsLaunchKey({
      status: identity,
      playerId,
      locale: activeLocale,
      path,
    });
    const renewing = renewingRef.current;
    renewingRef.current = false;
    if (!renewing && launchStillValid(launchRef.current, key, Date.now())) return;

    const controller = new AbortController();
    let cancelled = false;
    if (launchRef.current?.key !== key) {
      launchRef.current = null;
      setLaunch(null);
    }
    setPhase('requesting');
    setError(null);
    setSlow(false);

    requestSportsLaunch({ locale: activeLocale, path }, controller.signal)
      .then((result) => {
        if (cancelled) return;
        const next = { ...result, key };
        if (!launchIsUsable(next.expiresAt, Date.now())) {
          launchRef.current = null;
          setLaunch(null);
          setError('sports_unavailable');
          setPhase('error');
          return;
        }
        launchRef.current = next;
        setLaunch(next);
        setPhase('loading');
      })
      .catch((caught: unknown) => {
        if (cancelled || isAbortError(caught)) return;
        const code = caught instanceof SportsRequestError ? caught.code : 'sports_unavailable';
        if (code === 'auth_required') {
          suppressGuestRef.current = true;
          endSession();
        }
        launchRef.current = null;
        setLaunch(null);
        setError(code);
        setPhase('error');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [status, identity, playerId, activeLocale, path, attempt, endSession]);

  useEffect(() => {
    if (!launch) return;
    const delay = Date.parse(launch.expiresAt) - Date.now();
    const timer = setTimeout(() => {
      renewingRef.current = true;
      setAttempt((current) => current + 1);
    }, Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [launch]);

  useEffect(() => {
    if (phase !== 'loading') return;
    const timer = setTimeout(() => setSlow(true), SPORTS_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase, launch?.launchUrl]);

  useEffect(() => {
    if (!launch) return;
    const origin = new URL(launch.launchUrl).origin;
    const onMessage = (event: MessageEvent) => {
      const action = acceptSportsbookMessage(event, origin);
      if (action === 'sign_in') openLogin();
      if (action === 'sign_up') openRegistration();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [launch, openLogin, openRegistration]);

  const retry = () => {
    suppressGuestRef.current = false;
    renewingRef.current = true;
    launchRef.current = null;
    setLaunch(null);
    setAttempt((current) => current + 1);
  };

  const showOpaqueLoader = phase === 'pending' || (phase === 'requesting' && !launch);
  const errorCopy =
    error === 'auth_required'
      ? { title: t('sessionTitle'), body: t('sessionBody') }
      : error === 'invalid_sports_path'
        ? { title: t('pathTitle'), body: t('pathBody') }
        : { title: t('unavailableTitle'), body: t('unavailableBody') };

  return (
    <section
      className="sportsbook relative flex min-h-0 w-full flex-1 flex-col bg-[var(--bg)]"
      data-mode={launch?.mode ?? ''}
      data-phase={phase}
    >
      {launch && (
        <iframe
          key={launch.launchUrl}
          src={launch.launchUrl}
          title={t('frameTitle')}
          allow="fullscreen; payment"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setPhase('ready')}
          className="absolute inset-0 size-full border-0"
        />
      )}
      {showOpaqueLoader && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--bg)] p-6">
          <p role="status" className="fade-enter flex flex-col items-center gap-3 text-sm font-semibold">
            <AlphaBetLoader size="lg" />
            {t('loading')}
          </p>
        </div>
      )}
      {phase === 'loading' && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <p
            role="status"
            className="fade-enter flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold shadow-[var(--shadow-2)]"
          >
            <AlphaBetLoader size="sm" />
            {t('opening')}
          </p>
        </div>
      )}
      {phase === 'requesting' && launch && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <p
            role="status"
            className="fade-enter flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold shadow-[var(--shadow-2)]"
          >
            {t('reconnecting')}
          </p>
        </div>
      )}
      {slow && phase === 'loading' && (
        <div className="absolute inset-x-3 bottom-3 flex justify-center">
          <div
            role="status"
            className="panel motion-enter flex w-full max-w-md flex-col gap-3 rounded-[var(--radius-md)] p-4 text-start shadow-[var(--shadow-pop)]"
          >
            <p className="text-sm font-bold">{t('slowTitle')}</p>
            <p className="text-sm text-[var(--muted)]">{t('slowBody')}</p>
            <div className="flex justify-end">
              <Button type="button" onClick={retry}>
                <RotateCcw aria-hidden size={16} />
                {t('retry')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {phase === 'error' && error && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--bg)] p-6">
          <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
            <CircleAlert aria-hidden size={28} className="text-[var(--warning)]" />
            <p className="text-base font-bold">{errorCopy.title}</p>
            <p className="text-sm text-[var(--muted)]">{errorCopy.body}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {error === 'auth_required' ? (
                <Button type="button" onClick={() => openLogin()}>
                  {t('signIn')}
                </Button>
              ) : (
                <Button type="button" onClick={retry}>
                  <RotateCcw aria-hidden size={16} />
                  {t('retry')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
