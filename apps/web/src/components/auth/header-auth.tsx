'use client';
import { LogOut, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { PlayerBalance } from '@brand/contracts';
import { Link } from '@/i18n/navigation';
import { SearchTrigger } from '../search';
import { Button } from '../ui';
import { DepositButton } from '../cashier/cashier-provider';
import { useAuthDialog } from './auth-provider';
import { useBalance, useLogout, useSession } from './session';

const registerClass =
  'btn btn-primary inline-flex h-11 min-h-11 items-center justify-center rounded-[var(--radius-md)] font-semibold';
const mobileAuthClass =
  'btn inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border px-3 text-sm font-semibold';

export function formatBalance({ balance, currency }: PlayerBalance, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(balance);
  } catch {
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(balance)} ${currency}`;
  }
}

function AuthSkeleton({ className }: { className: string }) {
  const t = useTranslations('shell');
  return (
    <span
      role="status"
      aria-label={t('loadingAccount')}
      data-testid="auth-skeleton"
      className={`skeleton block h-10 shrink-0 rounded-[var(--radius-md)] ${className}`}
    />
  );
}

export function BalanceChip({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const t = useTranslations('shell');
  const balance = useBalance();
  if (balance.isPending) {
    return (
      <span
        aria-label={t('loadingBalance')}
        className={`skeleton block rounded-[var(--radius-md)] ${compact ? 'h-9 w-16' : 'h-10 w-24'}`}
      />
    );
  }
  const amount = balance.data ? formatBalance(balance.data, locale) : '—';
  return (
    <span
      data-testid="balance"
      title={amount}
      className={`motion-enter inline-flex min-w-0 items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] font-bold tabular-nums shadow-[inset_0_1px_0_rgb(255_255_255/.06)] ${compact ? 'h-9 max-w-[6.75rem] px-2 text-xs' : 'h-10 px-3 text-sm'}`}
    >
      <span className="sr-only">{t('balance')}</span>
      <span dir="ltr" className="truncate">
        {amount}
      </span>
    </span>
  );
}

function LogoutButton({ className = '' }: { className?: string }) {
  const logout = useLogout();
  const t = useTranslations('shell');
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={logout.isPending}
      onClick={() => {
        if (!logout.isPending) logout.mutate();
      }}
      className={className}
    >
      <LogOut aria-hidden size={16} />
      {t('logout')}
    </Button>
  );
}

function AccountLink({ email, onNavigate }: { email: string | null; onNavigate?: () => void }) {
  const t = useTranslations('shell');
  const account = useTranslations('nav');
  const label = email ?? account('account');
  return (
    <Link
      href="/account"
      onClick={onNavigate}
      aria-label={email ? t('accountFor', { email }) : account('account')}
      className="pressable inline-flex h-10 min-w-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold hover:border-[var(--accent-line)] hover:bg-[var(--surface-2)]"
    >
      <UserRound aria-hidden size={16} className="shrink-0 text-[var(--accent)]" />
      <span className="max-w-[160px] truncate">{label}</span>
    </Link>
  );
}

export function HeaderAuth() {
  const { status, session } = useSession();
  const { openLogin, openRegistration } = useAuthDialog();
  const t = useTranslations('shell');
  if (status === 'pending') return <AuthSkeleton className="w-[176px]" />;
  if (!session) {
    return (
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={(event) => openLogin(event.currentTarget)}
        >
          {t('login')}
        </Button>
        <button
          type="button"
          className={`${registerClass} px-4`}
          aria-haspopup="dialog"
          onClick={(event) => openRegistration(event.currentTarget)}
        >
          {t('register')}
        </button>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <BalanceChip />
      <AccountLink email={session.email} />
      <LogoutButton />
    </div>
  );
}

export function MobileHeaderCluster() {
  const { status, session } = useSession();
  const { openLogin, openRegistration } = useAuthDialog();
  const t = useTranslations('shell');
  const account = useTranslations('nav');
  if (status === 'pending') return <AuthSkeleton className="w-[72px]" />;
  if (!session) {
    return (
      <div className="flex items-center gap-1.5">
        <SearchTrigger iconOnly compact className="shrink-0" />
        <button
          type="button"
          className={`${mobileAuthClass} btn-secondary border-[var(--line)] hover:border-[var(--accent-line)]`}
          aria-haspopup="dialog"
          onClick={(event) => openLogin(event.currentTarget)}
        >
          {t('login')}
        </button>
        <button
          type="button"
          className={`${mobileAuthClass} btn-primary border-transparent`}
          aria-haspopup="dialog"
          onClick={(event) => openRegistration(event.currentTarget)}
        >
          {t('register')}
        </button>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <BalanceChip compact />
      <DepositButton appearance="header" dense />
      <SearchTrigger iconOnly compact className="shrink-0" />
      <Link
        href="/account"
        aria-label={account('account')}
        className="pressable inline-grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent-line)] hover:text-[var(--text)]"
      >
        <UserRound aria-hidden size={16} />
      </Link>
    </div>
  );
}

export function DrawerAuth({ onNavigate }: { onNavigate: () => void }) {
  const { status, session } = useSession();
  const { openLogin, openRegistration } = useAuthDialog();
  const t = useTranslations('shell');
  if (status === 'pending') return <AuthSkeleton className="w-full" />;
  if (!session) {
    return (
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            onNavigate();
            openLogin();
          }}
        >
          {t('login')}
        </Button>
        <button
          type="button"
          className={`${registerClass} flex-1 px-4`}
          aria-haspopup="dialog"
          onClick={() => {
            onNavigate();
            openRegistration();
          }}
        >
          {t('register')}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <BalanceChip />
        <AccountLink email={session.email} onNavigate={onNavigate} />
      </div>
      <LogoutButton className="w-full" />
    </div>
  );
}
