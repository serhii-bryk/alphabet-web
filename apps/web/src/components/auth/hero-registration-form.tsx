'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { RegistrationCountry } from '@brand/contracts';
import { fetchRegistrationOptions } from '@/data/registration-browser';
import { useAuthDialog } from './auth-provider';
import { ExternalAuthButtons } from './external-auth-buttons';
import { readRememberedIdentity } from './remembered-identity';

const fieldClass =
  'h-11 w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-3 text-base text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-glow)] motion-reduce:transition-none';
const submitClass =
  'btn btn-primary inline-flex h-11 min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] px-4 text-sm font-black';

export function HeroRegistrationForm() {
  const { openRegistration } = useAuthDialog();
  const t = useTranslations('hero');
  const emailId = useId();
  const passwordId = useId();
  const countryId = useId();
  const errorId = useId();
  const continueRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('');
  const [countries, setCountries] = useState<RegistrationCountry[]>([]);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [error, setError] = useState<QuickRegistrationError | null>(null);

  useEffect(() => {
    const remembered = readRememberedIdentity();
    // Restore the browser-only preference after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (remembered.email) setEmail((current) => current || remembered.email);
    if (remembered.country) setCountry((current) => current || remembered.country);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchRegistrationOptions(controller.signal)
      .then((result) => {
        setCountries(result.countries);
        setOptionsFailed(false);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setCountries([]);
        setOptionsFailed(true);
      });
    return () => controller.abort();
  }, []);

  const openPrefilled = (opener: HTMLElement | null) => {
    const nextError = quickRegistrationError(email, password, country, t);
    setError(nextError);
    if (nextError || !opener) return;
    openRegistration(opener, { email: email.trim(), password, country });
  };

  const onEnter = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    openPrefilled(continueRef.current);
  };

  return (
    <div
      data-hero-registration
      className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-4 shadow-[var(--shadow-2)] backdrop-blur-md sm:p-5"
    >
      <span aria-hidden className="absolute -end-10 -top-12 size-32 rounded-full bg-[var(--accent)] opacity-15" />
      <div className="relative">
        <ExternalAuthButtons emailDivider />
        <div className="grid gap-3">
          <label htmlFor={emailId} className="grid gap-1.5 text-xs font-bold">
            {t('email')}
            <input
              id={emailId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              aria-invalid={error?.field === 'email' ? true : undefined}
              aria-describedby={error?.field === 'email' ? errorId : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              onKeyDown={onEnter}
              className={fieldClass}
            />
          </label>
          <label htmlFor={passwordId} className="grid gap-1.5 text-xs font-bold">
            {t('password')}
            <input
              id={passwordId}
              name="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              aria-invalid={error?.field === 'password' ? true : undefined}
              aria-describedby={error?.field === 'password' ? errorId : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              onKeyDown={onEnter}
              className={fieldClass}
            />
          </label>
          <label htmlFor={countryId} className="grid gap-1.5 text-xs font-bold">
            {t('country')}
            <select
              id={countryId}
              name="country"
              autoComplete="country"
              value={country}
              aria-invalid={error?.field === 'country' ? true : undefined}
              aria-describedby={error?.field === 'country' ? errorId : undefined}
              onChange={(event) => {
                setCountry(event.target.value);
                setError(null);
              }}
              onKeyDown={onEnter}
              className={fieldClass}
            >
              <option value="">{t('chooseCountry')}</option>
              {country && !countries.some((item) => item.code === country) && (
                <option value={country}>{country}</option>
              )}
              {countries.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p id={errorId} role="alert" className="text-xs font-semibold text-[var(--danger)]">
              {error.message}
            </p>
          )}
          {!optionsFailed && countries.length === 0 && (
            <p className="text-xs text-[var(--muted)]">{t('loadingCountries')}</p>
          )}
          {optionsFailed && (
            <p className="text-xs leading-relaxed text-[var(--muted)]">{t('countriesFailed')}</p>
          )}
          <button
            ref={continueRef}
            type="button"
            className={submitClass}
            aria-haspopup="dialog"
            onClick={(event) => openPrefilled(event.currentTarget)}
          >
            {t('continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface QuickRegistrationError {
  field: 'email' | 'password' | 'country';
  message: string;
}

function quickRegistrationError(
  email: string,
  password: string,
  country: string,
  t: ReturnType<typeof useTranslations<'hero'>>,
): QuickRegistrationError | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { field: 'email', message: t('emailInvalid') };
  }
  if (password.length < 8) return { field: 'password', message: t('passwordShort') };
  if (!country) return { field: 'country', message: t('countryRequired') };
  return null;
}
