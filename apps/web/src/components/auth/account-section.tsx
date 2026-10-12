'use client';
import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, Skeleton } from '../ui';
import { useCashier } from '../cashier/cashier-provider';
import { useAuthDialog } from './auth-provider';
import { formatBalance } from './header-auth';
import { useBalance, useProfile, useSession } from './session';

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="surface rounded-[var(--radius-lg)] p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-[.14em] text-[var(--muted)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations('account');
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-sm text-[var(--muted)]">{message}</p>
      <Button
        type="button"
        onClick={onRetry}
        className="bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]"
      >
        <RotateCcw aria-hidden size={16} />
        {t('retry')}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-semibold text-[var(--muted)]">{label}</dt>
      <dd className="truncate font-semibold">{children}</dd>
    </div>
  );
}

function ProfilePanel() {
  const profile = useProfile();
  const t = useTranslations('account');
  return (
    <Panel title={t('profile')}>
      {profile.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-label={t('loadingProfile')}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 motion-reduce:animate-none" />
          ))}
        </div>
      ) : profile.data ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label={t('name')}>
            {`${profile.data.firstName} ${profile.data.lastName}`.trim() || '—'}
          </Field>
          <Field label={t('email')}>{profile.data.email}</Field>
          <Field label={t('currency')}>{profile.data.currency ?? '—'}</Field>
          <Field label={t('country')}>{profile.data.countryCode ?? '—'}</Field>
          <Field label={t('emailVerified')}>{profile.data.emailVerified ? t('yes') : t('no')}</Field>
        </dl>
      ) : (
        <PanelError
          message={t('profileError')}
          onRetry={() => void profile.refetch()}
        />
      )}
    </Panel>
  );
}

function BalancePanel() {
  const locale = useLocale();
  const balance = useBalance();
  const { openCashier } = useCashier();
  const t = useTranslations('account');
  return (
    <Panel title={t('balance')}>
      {balance.isPending ? (
        <Skeleton className="h-10 w-40 motion-reduce:animate-none" />
      ) : balance.data ? (
        <p data-testid="account-balance" className="text-3xl font-black tabular-nums">
          {formatBalance(balance.data, locale)}
        </p>
      ) : (
        <PanelError
          message={t('balanceError')}
          onRetry={() => void balance.refetch()}
        />
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => openCashier('deposit')}>
          {t('deposit')}
        </Button>
        <Button
          type="button"
          onClick={() => openCashier('withdraw')}
          className="bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]"
        >
          {t('withdraw')}
        </Button>
      </div>
    </Panel>
  );
}

export function AccountSection() {
  const { status } = useSession();
  const { openLogin } = useAuthDialog();
  const t = useTranslations('account');
  const auth = useTranslations('auth');

  if (status === 'pending') {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-40 motion-reduce:animate-none" />
        <Skeleton className="h-28 motion-reduce:animate-none" />
      </div>
    );
  }
  if (status === 'guest') {
    return (
      <div className="surface flex flex-col items-start gap-4 rounded-[var(--radius-lg)] p-6">
        <p className="text-[var(--muted)]">{t('signInPrompt')}</p>
        <Button type="button" onClick={(event) => openLogin(event.currentTarget)}>
          {auth('signIn')}
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <BalancePanel />
      <ProfilePanel />
    </div>
  );
}
