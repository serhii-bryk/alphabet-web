'use client';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { isValidLoginInput, type LoginErrorCode, type LoginInput } from '@/data/auth-browser';
import { AlphaBetLoader } from '../alphabet-loader';
import { Button } from '../ui';
import { AuthDialog } from './auth-dialog';
import { readRememberedIdentity } from './remembered-identity';
import { ExternalAuthButtons } from './external-auth-buttons';

const inputClass =
  'h-11 w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-3 text-base text-[var(--text)] outline-none focus-visible:border-[var(--accent)] aria-[invalid=true]:border-[var(--danger)]';

export function LoginForm({
  pending,
  error,
  onSubmit,
  onCreateAccount,
}: {
  pending: boolean;
  error: LoginErrorCode | null;
  onSubmit: (input: LoginInput) => void;
  onCreateAccount?: (opener: HTMLElement) => void;
}) {
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invalid, setInvalid] = useState(false);
  const t = useTranslations('auth');
  const shownError: LoginErrorCode | null = invalid ? 'invalid_login' : error;

  useEffect(() => {
    const remembered = readRememberedIdentity();
    if (remembered.email) setEmail((current) => current || remembered.email);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const input = { email, password };
    if (!isValidLoginInput(input)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSubmit(input);
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <ExternalAuthButtons />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-sm font-semibold">
          {t('email')}
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={255}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? errorId : undefined}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordId} className="text-sm font-semibold">
          {t('password')}
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          maxLength={255}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? errorId : undefined}
          className={inputClass}
        />
      </div>
      {shownError && (
        <p id={errorId} role="alert" className="text-sm font-semibold text-[var(--danger)]">
          {t(`loginErrors.${shownError}`)}
        </p>
      )}
      <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="h-11">
        {pending && (
          <AlphaBetLoader size="sm" className="text-current" />
        )}
        {pending ? t('signingIn') : t('signIn')}
      </Button>
      {onCreateAccount && (
        <p className="text-center text-sm text-[var(--muted)]">
          {t('newHere')}{' '}
          <button
            type="button"
            className="font-bold text-[var(--text)] underline decoration-[var(--accent)] underline-offset-4"
            onClick={(event) => onCreateAccount(event.currentTarget)}
          >
            {t('createAccount')}
          </button>
        </p>
      )}
    </form>
  );
}

export function LoginDialog({
  open,
  pending,
  error,
  onSubmit,
  onClose,
  onCreateAccount,
}: {
  open: boolean;
  pending: boolean;
  error: LoginErrorCode | null;
  onSubmit: (input: LoginInput) => void;
  onClose: () => void;
  onCreateAccount: (opener: HTMLElement) => void;
}) {
  const t = useTranslations('auth');
  // Unmounting the form on close drops the typed password.
  if (!open) return null;
  return (
    <AuthDialog title={t('signInTitle')} description={t('signInDescription')} onClose={onClose}>
      <LoginForm
        pending={pending}
        error={error}
        onSubmit={onSubmit}
        onCreateAccount={onCreateAccount}
      />
    </AuthDialog>
  );
}
