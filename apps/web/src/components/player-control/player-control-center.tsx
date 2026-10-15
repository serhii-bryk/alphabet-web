'use client';

import { useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CoolOffRequest, ResponsibleGamingCatalog, ResponsibleGamingPeriod } from '@brand/contracts';
import { useLocale, useTranslations } from 'next-intl';
import {
  ResponsibleGamingRequestError,
  endsAuthenticatedPlay,
  fetchResponsibleGamingCatalog,
  startCoolOff,
  startSelfExclusion,
  updateRealityCheck,
} from '@/data/responsible-gaming-browser';
import { useAuthDialog } from '../auth/auth-provider';
import { useEndSession, useSession } from '../auth/session';
import { AlphaBetLoader } from '../alphabet-loader';
import { Badge, Button, Skeleton } from '../ui';
import { ControlDialog } from './control-dialog';
import { realityCheckKey, usePlayerControlClock } from './session-clock';
import {
  canSubmitPeriod,
  formatElapsed,
  getReceiptSnapshot,
  saveReceipt,
  subscribeReceipt,
  type LocalReceipt,
} from './storage';

type Review = 'cool_off' | 'self_exclusion' | null;

function messageFor(error: unknown, t: ReturnType<typeof useTranslations<'playerControl'>>) {
  const code = error instanceof ResponsibleGamingRequestError ? error.code : 'responsible_gaming_unavailable';
  return t(`errors.${code}`);
}

function formatStamp(value: string, locale: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function Choice({
  name,
  value,
  checked,
  disabled = false,
  label,
  description,
  tone,
  onSelect,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  tone: 'calm' | 'pause' | 'serious';
  onSelect: () => void;
}) {
  const descriptionId = `${name}-${value}-note`;
  const selected =
    tone === 'serious'
      ? 'border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,var(--surface))]'
      : tone === 'pause'
        ? 'border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_14%,var(--surface))]'
        : 'border-[var(--accent)] bg-[var(--accent-soft)]';
  return (
    <label
      className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-3 py-3 text-start focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)] ${
        disabled ? 'cursor-not-allowed opacity-60' : ''
      } ${checked && !disabled ? selected : 'border-[var(--line)] bg-[var(--bg)]'}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        data-testid={`${name}-${value}`}
        aria-describedby={description ? descriptionId : undefined}
        onChange={() => {
          if (!disabled) onSelect();
        }}
        className="mt-1 size-4 shrink-0"
        style={{ accentColor: tone === 'serious' ? 'var(--danger)' : tone === 'pause' ? 'var(--warning)' : 'var(--accent)' }}
      />
      <span className="min-w-0">
        <span className="block font-semibold" dir="auto">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="mt-1 block text-xs font-medium leading-relaxed text-[var(--muted)]">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function PeriodChoices({
  name,
  periods,
  selectedId,
  tone,
  legend,
  onSelect,
}: {
  name: string;
  periods: ResponsibleGamingPeriod[];
  selectedId: number | null;
  tone: 'pause' | 'serious';
  legend: string;
  onSelect: (period: ResponsibleGamingPeriod) => void;
}) {
  const t = useTranslations('playerControl');
  if (periods.length === 0) {
    return <p className="text-sm text-[var(--muted)]">{t('noPeriods')}</p>;
  }
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-sm font-bold">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {periods.map((period) => (
          <Choice
            key={period.id}
            name={name}
            value={String(period.id)}
            checked={selectedId === period.id}
            disabled={period.dateSelector}
            label={period.text}
            description={period.dateSelector ? t('customDate') : undefined}
            tone={tone}
            onSelect={() => {
              if (canSubmitPeriod(period)) onSelect(period);
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}

function ReceiptNote({ receipt }: { receipt: LocalReceipt }) {
  const t = useTranslations('playerControl');
  const locale = useLocale();
  return (
    <aside
      data-testid="local-receipt"
      aria-label={t('receiptLabel')}
      className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line)] bg-[var(--surface)] p-4 text-start"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{t('receiptLabel')}</Badge>
        <p className="text-sm font-bold">
          {receipt.kind === 'cool_off' ? t('receiptCoolOff') : t('receiptExclusion')}
        </p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{t('receiptDisclaimer')}</p>
      <p className="mt-3 text-sm font-semibold">{t('signedOut')}</p>
      <dl className="mt-3 grid gap-2 text-sm">
        <div>
          <dt className="text-xs font-semibold text-[var(--muted)]">{t('receiptPeriod')}</dt>
          <dd className="font-semibold" dir="auto">
            {receipt.periodText}
          </dd>
        </div>
        {receipt.reasonText && (
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">{t('receiptReason')}</dt>
            <dd className="font-semibold" dir="auto">
              {receipt.reasonText}
            </dd>
          </div>
        )}
        {receipt.expiresAt && (
          <div>
            <dt className="text-xs font-semibold text-[var(--muted)]">{t('receiptExpires')}</dt>
            <dd className="font-semibold">{formatStamp(receipt.expiresAt, locale)}</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  body,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <header className="relative text-start">
      <p className="text-[11px] font-black uppercase tracking-[.16em] text-[var(--muted)]">{eyebrow}</p>
      <h2 id={id} className="mt-1 text-2xl font-black tracking-tight">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{body}</p>
    </header>
  );
}

function ActionError({ error }: { error: unknown }) {
  const t = useTranslations('playerControl');
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-semibold text-[var(--danger)]">
      {messageFor(error, t)}
    </p>
  );
}

export function PlayerControlCenter() {
  const t = useTranslations('playerControl');
  const pages = useTranslations('pages');
  const { status } = useSession();
  const { openLogin } = useAuthDialog();
  const endSession = useEndSession();
  const client = useQueryClient();
  const clock = usePlayerControlClock();
  const receipt = useSyncExternalStore(subscribeReceipt, getReceiptSnapshot, () => null);
  const catalogQuery = useQuery({
    queryKey: ['responsible-gaming', 'catalog'],
    queryFn: ({ signal }) => fetchResponsibleGamingCatalog(signal),
    retry: false,
    staleTime: 60_000,
  });
  const [intervalTouched, setIntervalTouched] = useState(false);
  const [intervalChoice, setIntervalChoice] = useState<number | null>(null);
  const [coolPeriodId, setCoolPeriodId] = useState<number | null>(null);
  const [reasonId, setReasonId] = useState<number | null>(null);
  const [exclusionPeriodId, setExclusionPeriodId] = useState<number | null>(null);
  const [review, setReview] = useState<Review>(null);
  const [savedInterval, setSavedInterval] = useState(false);

  const report = (error: unknown) => {
    if (error instanceof ResponsibleGamingRequestError && endsAuthenticatedPlay(error.code)) endSession();
  };

  const saveInterval = useMutation({
    mutationFn: (intervalMinutes: number) => updateRealityCheck(intervalMinutes),
    onSuccess: (preference) => {
      if (clock.playerId) client.setQueryData(realityCheckKey(clock.playerId), preference);
      setSavedInterval(true);
    },
    onError: report,
  });
  const coolOff = useMutation({
    mutationFn: (input: CoolOffRequest) => startCoolOff(input),
    onSuccess: (result) => {
      saveReceipt(result);
      setReview(null);
      endSession();
    },
    onError: report,
  });
  const exclusion = useMutation({
    mutationFn: (periodId: number) => startSelfExclusion({ periodId }),
    onSuccess: (result) => {
      saveReceipt(result);
      setReview(null);
      endSession();
    },
    onError: report,
  });

  const catalog = catalogQuery.data;
  const selectedInterval = intervalTouched ? intervalChoice : (clock.intervalMinutes ?? intervalChoice);
  const coolPeriod = catalog?.coolOffPeriods.find((period) => period.id === coolPeriodId) ?? null;
  const exclusionPeriod = catalog?.selfExclusionPeriods.find((period) => period.id === exclusionPeriodId) ?? null;
  const reason = catalog?.coolOffReasons.find((item) => item.id === reasonId) ?? null;
  const authenticated = status === 'authenticated';

  const requireAuth = (opener: HTMLElement | null) => {
    if (authenticated) return false;
    openLogin(opener);
    return true;
  };

  const submitReview = (opener: HTMLElement | null) => {
    if (requireAuth(opener)) return;
    if (review === 'cool_off') {
      if (!canSubmitPeriod(coolPeriod) || !coolPeriod || coolOff.isPending) return;
      const input: CoolOffRequest = { periodId: coolPeriod.id };
      if (reason) input.reasonId = reason.id;
      coolOff.mutate(input);
      return;
    }
    if (review === 'self_exclusion') {
      if (!canSubmitPeriod(exclusionPeriod) || !exclusionPeriod || exclusion.isPending) return;
      exclusion.mutate(exclusionPeriod.id);
    }
  };

  return (
    <article data-testid="player-control" className="mx-auto flex max-w-3xl flex-col gap-6 py-2 text-start sm:py-6">
      <header>
        <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--accent)]">{pages('safeEyebrow')}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">{t('lede')}</p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{t('age')}</p>
      </header>

      {receipt && <ReceiptNote receipt={receipt} />}

      {catalogQuery.isPending ? (
        <div aria-label={t('loading')} aria-busy="true" className="grid gap-4">
          <Skeleton className="h-48 motion-reduce:animate-none" />
          <Skeleton className="h-40 motion-reduce:animate-none" />
          <Skeleton className="h-56 motion-reduce:animate-none" />
        </div>
      ) : catalogQuery.isError ? (
        <div role="alert" className="surface flex flex-col items-start gap-3 rounded-[var(--radius-lg)] p-5">
          <p className="text-sm text-[var(--muted)]">{t('loadError')}</p>
          <Button type="button" variant="secondary" onClick={() => void catalogQuery.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : catalog && isEmptyCatalog(catalog) ? (
        <div className="surface rounded-[var(--radius-lg)] p-5">
          <p className="text-sm text-[var(--muted)]">{t('empty')}</p>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => void catalogQuery.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : catalog ? (
        <>
          {!authenticated && <p className="text-sm text-[var(--muted)]">{t('guestNote')}</p>}

          <section
            aria-labelledby="reality-check-title"
            className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--accent-line)] bg-[var(--surface)] p-5"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -end-20 -top-24 size-64 rounded-full bg-[var(--accent-soft)]"
            />
            <div className="relative">
              <SectionHeading
                id="reality-check-title"
                eyebrow={t('realityEyebrow')}
                title={t('realityTitle')}
                body={t('realityBody')}
              />
              {authenticated && clock.resolved && (
                <div className="mt-5" data-testid="session-clock-hero" data-clock-kind={clock.resolved.kind}>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--muted)]">{t('sessionClock')}</p>
                  <p className="mt-1 text-5xl font-black tabular-nums tracking-tight sm:text-6xl">
                    {formatElapsed(clock.now - clock.resolved.startedAtMs)}
                  </p>
                  <p className={`mt-2 text-sm font-semibold ${clock.resolved.kind === 'device' ? 'text-[var(--warning)]' : 'text-[var(--muted)]'}`}>
                    {clock.resolved.kind === 'device' ? t('deviceTime') : t('platformTime')}
                  </p>
                </div>
              )}
              {authenticated && !clock.resolved && clock.sessionQuery.isPending && (
                <Skeleton className="mt-5 h-24 motion-reduce:animate-none" />
              )}
              {authenticated && clock.sessionQuery.isError && (
                <div className="mt-5 flex flex-col items-start gap-2">
                  <p className="text-sm text-[var(--muted)]">{t('clockUnavailable')}</p>
                  <Button type="button" variant="secondary" onClick={() => void clock.sessionQuery.refetch()}>
                    {t('retry')}
                  </Button>
                </div>
              )}

              <fieldset className="mt-6">
                <legend className="mb-3 text-sm font-bold">{t('intervalLegend')}</legend>
                {catalog.realityCheckIntervals.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">{t('noIntervals')}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {catalog.realityCheckIntervals.map((minutes) => (
                      <Choice
                        key={minutes}
                        name="reality-interval"
                        value={String(minutes)}
                        checked={selectedInterval === minutes}
                        label={minutes === 0 ? t('remindersOff') : t('everyMinutes', { count: minutes })}
                        tone="calm"
                        onSelect={() => {
                          setIntervalTouched(true);
                          setIntervalChoice(minutes);
                          setSavedInterval(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </fieldset>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={authenticated && (selectedInterval === null || saveInterval.isPending)}
                  aria-busy={saveInterval.isPending || undefined}
                  onClick={(event) => {
                    if (requireAuth(event.currentTarget)) return;
                    if (selectedInterval === null || saveInterval.isPending) return;
                    saveInterval.mutate(selectedInterval);
                  }}
                >
                  {saveInterval.isPending && <AlphaBetLoader size="sm" className="text-current" />}
                  {authenticated ? (saveInterval.isPending ? t('saving') : t('saveInterval')) : t('signInToSave')}
                </Button>
                {savedInterval && !saveInterval.isPending && (
                  <p role="status" className="text-sm font-semibold text-[var(--muted)]">
                    {t('saved')}
                  </p>
                )}
              </div>
              <ActionError error={saveInterval.error} />
            </div>
          </section>

          <section
            aria-labelledby="cool-off-title"
            className="rounded-[var(--radius-lg)] border border-[var(--line)] border-s-4 border-s-[var(--warning)] bg-[var(--surface)] p-5"
          >
            <SectionHeading id="cool-off-title" eyebrow={t('coolEyebrow')} title={t('coolTitle')} body={t('coolBody')} />
            <ul className="mt-4 grid gap-2 text-sm text-[var(--text)]">
              <li className="rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--bg))] px-3 py-2">
                {t('coolFactLogin')}
              </li>
              <li className="rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--bg))] px-3 py-2">
                {t('coolFactSession')}
              </li>
              <li className="rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--bg))] px-3 py-2">
                {t('coolFactNoCancel')}
              </li>
            </ul>
            <div className="mt-5">
              <PeriodChoices
                name="cool-off"
                periods={catalog.coolOffPeriods}
                selectedId={coolPeriodId}
                tone="pause"
                legend={t('coolPeriods')}
                onSelect={(period) => setCoolPeriodId(period.id)}
              />
            </div>
            {catalog.coolOffReasons.length > 0 && (
              <fieldset className="mt-5">
                <legend className="mb-1 text-sm font-bold">{t('coolReasons')}</legend>
                <p className="mb-3 text-xs text-[var(--muted)]">{t('reasonOptional')}</p>
                <div className="grid gap-2">
                  <Choice
                    name="cool-reason"
                    value="none"
                    checked={reasonId === null}
                    label={t('reasonNone')}
                    tone="pause"
                    onSelect={() => setReasonId(null)}
                  />
                  {catalog.coolOffReasons.map((item) => (
                    <Choice
                      key={item.id}
                      name="cool-reason"
                      value={String(item.id)}
                      checked={reasonId === item.id}
                      label={item.text}
                      tone="pause"
                      onSelect={() => setReasonId(item.id)}
                    />
                  ))}
                </div>
              </fieldset>
            )}
            <div className="mt-4">
              <Button
                type="button"
                disabled={!canSubmitPeriod(coolPeriod)}
                onClick={() => setReview('cool_off')}
              >
                {t('reviewCoolOff')}
              </Button>
            </div>
          </section>

          <section
            aria-labelledby="self-exclusion-title"
            className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--danger)_45%,var(--line))] bg-[var(--surface-2)] p-5 sm:p-6"
          >
            <SectionHeading
              id="self-exclusion-title"
              eyebrow={t('excludeEyebrow')}
              title={t('excludeTitle')}
              body={t('excludeBody')}
            />
            <div className="mt-4 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[var(--surface)] p-4">
              <h3 className="text-sm font-black">{t('excludeConsequencesTitle')}</h3>
              <ol className="mt-3 grid gap-2 text-sm">
                <li>{t('excludeConsequenceSession')}</li>
                <li>{t('excludeConsequenceLogin')}</li>
                <li>{t('excludeConsequenceNoCancel')}</li>
              </ol>
            </div>
            <div className="mt-5">
              <PeriodChoices
                name="self-exclusion"
                periods={catalog.selfExclusionPeriods}
                selectedId={exclusionPeriodId}
                tone="serious"
                legend={t('excludePeriods')}
                onSelect={(period) => setExclusionPeriodId(period.id)}
              />
            </div>
            <div className="mt-4">
              <button
                type="button"
                disabled={!canSubmitPeriod(exclusionPeriod)}
                onClick={() => setReview('self_exclusion')}
                className="btn inline-flex h-11 items-center justify-center rounded-[var(--radius-md)] border border-transparent px-4 font-semibold disabled:opacity-50"
                style={{ background: 'var(--danger)', color: 'var(--positive-contrast)' }}
              >
                {t('reviewExclusion')}
              </button>
            </div>
          </section>
        </>
      ) : null}

      <p className="text-sm leading-relaxed text-[var(--muted)]">{t('chase')}</p>

      {review === 'cool_off' && coolPeriod && (
        <ControlDialog title={t('reviewCoolOff')} description={t('coolConfirmBody')} onClose={() => setReview(null)}>
          <ReviewFacts
            period={coolPeriod.text}
            reason={reason?.text}
            facts={[t('coolFactLogin'), t('coolFactSession'), t('coolFactNoCancel')]}
          />
          <ActionError error={coolOff.error} />
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setReview(null)}>
              {t('cancel')}
            </Button>
            <Button
              type="button"
              disabled={coolOff.isPending}
              aria-busy={coolOff.isPending || undefined}
              onClick={(event) => submitReview(event.currentTarget)}
            >
              {coolOff.isPending && <AlphaBetLoader size="sm" className="text-current" />}
              {authenticated ? (coolOff.isPending ? t('submitting') : t('confirmCoolOff')) : t('signInToStart')}
            </Button>
          </div>
        </ControlDialog>
      )}

      {review === 'self_exclusion' && exclusionPeriod && (
        <ControlDialog
          title={t('reviewExclusion')}
          description={t('excludeConfirmBody')}
          onClose={() => setReview(null)}
        >
          <ReviewFacts
            period={exclusionPeriod.text}
            facts={[
              t('excludeConsequenceSession'),
              t('excludeConsequenceLogin'),
              t('excludeConsequenceNoCancel'),
            ]}
          />
          <ActionError error={exclusion.error} />
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setReview(null)}>
              {t('cancel')}
            </Button>
            <button
              type="button"
              disabled={exclusion.isPending}
              aria-busy={exclusion.isPending || undefined}
              onClick={(event) => submitReview(event.currentTarget)}
              className="btn inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-transparent px-4 font-semibold disabled:opacity-50"
              style={{ background: 'var(--danger)', color: 'var(--positive-contrast)' }}
            >
              {exclusion.isPending && <AlphaBetLoader size="sm" className="text-current" />}
              {authenticated ? (exclusion.isPending ? t('submitting') : t('confirmExclusion')) : t('signInToStart')}
            </button>
          </div>
        </ControlDialog>
      )}
    </article>
  );
}

function isEmptyCatalog(catalog: ResponsibleGamingCatalog) {
  return (
    catalog.realityCheckIntervals.length === 0 &&
    catalog.coolOffPeriods.length === 0 &&
    catalog.coolOffReasons.length === 0 &&
    catalog.selfExclusionPeriods.length === 0
  );
}

function ReviewFacts({
  period,
  reason,
  facts,
}: {
  period: string;
  reason?: string;
  facts: string[];
}) {
  const t = useTranslations('playerControl');
  return (
    <div className="grid gap-3 text-start">
      <p className="rounded-[var(--radius-md)] bg-[var(--bg)] px-3 py-3 text-base font-bold" dir="auto">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          {t('periodLabel')}
        </span>
        {period}
      </p>
      {reason && (
        <p className="text-sm" dir="auto">
          <span className="font-semibold text-[var(--muted)]">{t('reasonLabel')}: </span>
          {reason}
        </p>
      )}
      <ul className="grid gap-1.5 text-sm">
        {facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </div>
  );
}
