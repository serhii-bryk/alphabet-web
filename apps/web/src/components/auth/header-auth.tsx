'use client';
import { LogOut, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { PlayerBalance } from '@brand/contracts';
import { Link } from '@/i18n/navigation';
import { Button } from '../ui';
import { useAuthDialog } from './auth-provider';
import { useBalance, useLogout, useSession } from './session';

const registerClass =
  'btn btn-primary inline-flex h-11 min-h-11 items-center justify-center rounded-[var(--radius-md)] font-semibold';

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

export function BalanceChip() {
  const locale = useLocale();
  const t = useTranslations('shell');
  const balance = useBalance();
  if (balance.isPending) {
    return (
      <span
        aria-label={t('loadingBalance')}
        className="skeleton block h-10 w-24 rounded-[var(--radius-md)]"
      />
    );
  }
  return (
    <span
      data-testid="balance"
      className="motion-enter inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold tabular-nums shadow-[inset_0_1px_0_rgb(255_255_255/.06)]"
    >
      <span className="sr-only">{t('balance')}</span>
      {balance.data ? formatBalance(balance.data, locale) : '—'}
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

function AccountLink({ email, onNavigate }: { email: string; onNavigate?: () => void }) {
  const t = useTranslations('shell');
  return (
    <Link
      href="/account"
      onClick={onNavigate}
      aria-label={t('accountFor', { email })}
      className="pressable inline-flex h-10 min-w-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold hover:border-[var(--accent-line)] hover:bg-[var(--surface-2)]"
    >
      <UserRound aria-hidden size={16} className="shrink-0 text-[var(--accent)]" />
      <span className="max-w-[160px] truncate">{email}</span>
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

export function MobileHeaderAuth() {
  const { status, session } = useSession();
  const { openRegistration } = useAuthDialog();
  const t = useTranslations('shell');
  if (status === 'pending') return <AuthSkeleton className="w-[72px]" />;
  if (!session) {
    return (
      <button
        type="button"
        className={`${registerClass} px-3`}
        aria-haspopup="dialog"
        onClick={(event) => openRegistration(event.currentTarget)}
      >
        {t('register')}
      </button>
    );
  }
  return <BalanceChip />;
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
