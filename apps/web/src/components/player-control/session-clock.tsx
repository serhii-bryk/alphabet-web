'use client';

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  endsAuthenticatedPlay,
  fetchRealityCheck,
  fetchSessionClock,
  ResponsibleGamingRequestError,
} from '@/data/responsible-gaming-browser';
import { Button } from '../ui';
import { useEndSession, useLogout, useSession } from '../auth/session';
import { ControlDialog } from './control-dialog';
import {
  PLAYER_CONTROL_KEY,
  currentReminderBoundary,
  ensureDeviceStart,
  formatElapsed,
  readPlayerRecord,
  reminderIsDue,
  resolveSessionStart,
  updatePlayerRecord,
} from './storage';

export const realityCheckKey = (playerId: string) => ['responsible-gaming', 'reality-check', playerId] as const;
export const sessionClockKey = (playerId: string) => ['responsible-gaming', 'session', playerId] as const;

/** The session timer is visible only for a saved interval above 0. */
export function sessionTimerVisible(intervalMinutes: number | null) {
  return intervalMinutes !== null && intervalMinutes > 0;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function usePlayerControlClock() {
  const { status, session } = useSession();
  const endSession = useEndSession();
  const playerId = session?.playerId ?? null;
  const enabled = status === 'authenticated' && playerId !== null;
  const sessionQuery = useQuery({
    queryKey: playerId ? sessionClockKey(playerId) : ['responsible-gaming', 'session', 'guest'],
    queryFn: ({ signal }) => fetchSessionClock(signal),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  const intervalQuery = useQuery({
    queryKey: playerId ? realityCheckKey(playerId) : ['responsible-gaming', 'reality-check', 'guest'],
    queryFn: ({ signal }) => fetchRealityCheck(signal),
    enabled,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    for (const error of [sessionQuery.error, intervalQuery.error]) {
      if (error instanceof ResponsibleGamingRequestError && endsAuthenticatedPlay(error.code)) endSession();
    }
  }, [endSession, intervalQuery.error, sessionQuery.error]);

  const now = useNow(enabled);
  const data = sessionQuery.data;
  const deviceStartedAt = enabled && playerId ? (readPlayerRecord(playerId).deviceStartedAt ?? null) : null;
  const resolved = useMemo(() => {
    if (!enabled || !playerId || !data) return null;
    return resolveSessionStart({
      source: data.source,
      startedAt: data.startedAt,
      deviceStartedAt,
      now,
    });
  }, [data, deviceStartedAt, enabled, now, playerId]);

  useEffect(() => {
    if (!playerId || !resolved?.deviceStartedAtToStore) return;
    ensureDeviceStart(playerId, resolved.deviceStartedAtToStore);
  }, [playerId, resolved]);

  return {
    status,
    playerId,
    resolved,
    intervalMinutes: intervalQuery.data?.intervalMinutes ?? null,
    now,
    sessionQuery,
    intervalQuery,
  };
}

function clockLabel(
  t: ReturnType<typeof useTranslations<'playerControl'>>,
  kind: 'platform' | 'device',
  elapsed: string,
) {
  const source = kind === 'device' ? t('deviceTime') : t('platformTime');
  return t('clockName', { time: elapsed, source });
}

export function SessionClockLink({ placement }: { placement: 'header' | 'bar' }) {
  const t = useTranslations('playerControl');
  const clock = usePlayerControlClock();
  if (clock.status !== 'authenticated' || !sessionTimerVisible(clock.intervalMinutes)) return null;

  if (!clock.resolved) {
    if (clock.sessionQuery.isError) {
      return (
        <button
          type="button"
          onClick={() => void clock.sessionQuery.refetch()}
          className={
            placement === 'header'
              ? 'inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[var(--line)] px-3 text-xs font-semibold text-[var(--muted)]'
              : 'mb-2 flex h-9 w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--muted)]'
          }
        >
          {t('clockUnavailable')}
        </button>
      );
    }
    return placement === 'header' ? (
      <span aria-hidden className="skeleton block h-10 w-24 rounded-[var(--radius-md)]" />
    ) : (
      <span aria-hidden className="skeleton mb-2 block h-9 w-full rounded-[var(--radius-md)]" />
    );
  }

  const elapsed = formatElapsed(clock.now - clock.resolved.startedAtMs);
  const label = clockLabel(t, clock.resolved.kind, elapsed);
  const device = clock.resolved.kind === 'device';

  if (placement === 'bar') {
    return (
      <Link
        href="/responsible-gaming"
        data-testid="session-clock"
        data-clock-kind={clock.resolved.kind}
        aria-label={label}
        className="mb-2 flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
      >
        <span className="text-xs font-semibold text-[var(--muted)]">{t('sessionClock')}</span>
        <span className="ms-auto font-bold tabular-nums">{elapsed}</span>
        {device && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--warning)]">
            {t('deviceShort')}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href="/responsible-gaming"
      data-testid="session-clock"
      data-clock-kind={clock.resolved.kind}
      aria-label={label}
      title={device ? t('deviceTime') : t('platformTime')}
      className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-sm font-semibold"
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: device ? 'var(--warning)' : 'var(--accent)' }}
      />
      <span className="tabular-nums">{elapsed}</span>
      {device && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--warning)]">
          {t('deviceShort')}
        </span>
      )}
    </Link>
  );
}

function useAcknowledgedThrough(playerId: string | null) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== PLAYER_CONTROL_KEY) return;
      setVersion((current) => current + 1);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const acknowledgedThrough = playerId
    ? acknowledgedValue(readPlayerRecord(playerId), version)
    : null;
  const acknowledge = (boundary: number) => {
    if (!playerId) return;
    updatePlayerRecord(playerId, { acknowledgedThrough: boundary });
    setVersion((current) => current + 1);
  };
  return { acknowledgedThrough, acknowledge };
}

function acknowledgedValue(record: { acknowledgedThrough?: number }, generation: number): number | null {
  if (!Number.isFinite(generation)) return null;
  return record.acknowledgedThrough ?? null;
}

let reminderLeaderId: string | null = null;
const reminderListeners = new Set<() => void>();

function subscribeReminderLeader(listener: () => void) {
  reminderListeners.add(listener);
  return () => {
    reminderListeners.delete(listener);
  };
}

function publishReminderLeader() {
  reminderListeners.forEach((listener) => listener());
}

function claimReminderLeader(id: string) {
  if (reminderLeaderId !== null) return;
  reminderLeaderId = id;
  publishReminderLeader();
}

function releaseReminderLeader(id: string) {
  if (reminderLeaderId !== id) return;
  reminderLeaderId = null;
  publishReminderLeader();
}

export function resetReminderLeader() {
  reminderLeaderId = null;
  publishReminderLeader();
}

function ReminderBody() {
  const t = useTranslations('playerControl');
  const clock = usePlayerControlClock();
  const logout = useLogout();
  const { acknowledgedThrough, acknowledge } = useAcknowledgedThrough(clock.playerId);
  const boundary =
    clock.resolved && clock.intervalMinutes !== null
      ? currentReminderBoundary(clock.resolved.startedAtMs, clock.intervalMinutes, clock.now)
      : null;
  const due =
    clock.status === 'authenticated' &&
    clock.resolved !== null &&
    reminderIsDue(boundary, acknowledgedThrough);

  if (!due || !clock.resolved || boundary === null) return null;
  const elapsed = formatElapsed(clock.now - clock.resolved.startedAtMs);

  return (
    <ControlDialog
      testId="reality-reminder"
      title={t('reminderTitle')}
      description={t('reminderBody', { time: elapsed })}
      dismissible={false}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          disabled={logout.isPending}
          onClick={() => {
            if (!logout.isPending) logout.mutate();
          }}
        >
          {t('endSession')}
        </Button>
        <Button type="button" onClick={() => acknowledge(boundary)}>
          {t('acknowledge')}
        </Button>
      </div>
    </ControlDialog>
  );
}

export function RealityCheckReminder() {
  const id = useId();
  const leaderId = useSyncExternalStore(subscribeReminderLeader, () => reminderLeaderId, () => null);
  useEffect(() => {
    claimReminderLeader(id);
    return () => releaseReminderLeader(id);
  }, [id]);
  if (leaderId !== id) return null;
  return <ReminderBody />;
}
