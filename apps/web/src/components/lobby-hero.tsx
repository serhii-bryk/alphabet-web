'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { RegistrationCountry } from '@brand/contracts';
import { Link } from '@/i18n/navigation';
import { fetchRegistrationOptions } from '@/data/registration-browser';
import { useAuthDialog } from './auth/auth-provider';
import { GuestAcquisition } from './auth/guest-acquisition';
import { readRememberedIdentity } from './auth/remembered-identity';
import { useSession, type SessionStatus } from './auth/session';
import { BrandBanner } from './brand-banner';

const primaryCta =
  'btn btn-primary inline-flex h-11 min-h-11 items-center justify-center rounded-[var(--radius-md)] px-4 text-sm font-black';
const secondaryCta =
  'btn pressable-lift inline-flex h-11 min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold hover:border-[var(--accent-line)]';
const fieldClass =
  'h-11 w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-3 text-base text-[var(--text)] outline-none transition focus-visible:border-[var(--accent)] motion-reduce:transition-none';

export function LobbyHero({ startId = 'casino' }: { startId?: string }) {
  const { status } = useSession();
  const t = useTranslations('hero');
  const live = startId === 'live';

  return (
    <section
      aria-label={t('welcome')}
      className="lobby-hero relative mb-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] sm:mb-8"
    >
      <div className="relative h-32 sm:absolute sm:inset-0 sm:h-auto">
        <BrandBanner variant="casino" scrim="stage" priority sizes="(min-width: 1100px) 1200px, 100vw" />
      </div>
      <div
        className={`banner-copy relative flex flex-col gap-6 p-5 sm:min-h-[19rem] sm:justify-end sm:p-7 lg:min-h-[23rem] lg:p-8 ${status === 'guest' ? 'lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,380px)] lg:items-end' : ''}`}
      >
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--accent)]">
            {status === 'authenticated' ? t('eyebrowMember') : t('eyebrowGuest')}
          </p>
          <h2 className="mt-2 max-w-xl text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl">
            {heroTitle(status, t)}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--muted)] sm:text-base">
            {heroBody(status, live, t)}
          </p>
          <GuestAcquisition>
            <GuestRegister />
          </GuestAcquisition>
          {status === 'authenticated' && <MemberActions live={live} />}
        </div>
        <GuestAcquisition>
          <GuestQuickForm />
        </GuestAcquisition>
      </div>
    </section>
  );
}

function heroTitle(status: SessionStatus, t: ReturnType<typeof useTranslations<'hero'>>) {
  if (status === 'authenticated') return t('titleMember');
  if (status === 'guest') return t('titleGuest');
  return t('titlePending');
}

function heroBody(status: SessionStatus, live: boolean, t: ReturnType<typeof useTranslations<'hero'>>) {
  if (status === 'authenticated') return live ? t('bodyMemberLive') : t('bodyMember');
  if (status === 'pending') return t('bodyPending');
  return live ? t('bodyGuestLive') : t('bodyGuest');
}

function GuestRegister() {
  const { openRegistration } = useAuthDialog();
  const t = useTranslations('hero');
  return (
    <div className="mt-6">
      <button
        type="button"
        className={primaryCta}
        aria-haspopup="dialog"
        onClick={(event) => openRegistration(event.currentTarget)}
      >
        {t('register')}
      </button>
    </div>
  );
}

function MemberActions({ live }: { live: boolean }) {
  const t = useTranslations('hero');
  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        <a href="#games" className={primaryCta}>
          {t('play')}
        </a>
        <Link href="/sports" className={secondaryCta}>
          {t('exploreSports')}
        </Link>
      </div>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--muted)]">
        {live ? t('memberNoteLive') : t('memberNote')}
        <Link href="/promotions" className="font-bold text-[var(--text)]">
          {t('seePromotions')}
        </Link>
      </p>
    </div>
  );
}

function GuestQuickForm() {
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
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-4 shadow-[var(--shadow-2)] backdrop-blur-md sm:p-5">
      <span aria-hidden className="absolute -end-8 -top-10 size-28 rounded-full bg-[var(--accent)] opacity-20" />
      <div className="relative">
        <p className="text-xs font-black uppercase tracking-[.14em] text-[var(--muted)]">{t('orStart')}</p>
        <div className="mt-3 grid gap-3">
          <label htmlFor={emailId} className="grid gap-1 text-xs font-bold">
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
          <label htmlFor={passwordId} className="grid gap-1 text-xs font-bold">
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
          <label htmlFor={countryId} className="grid gap-1 text-xs font-bold">
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
            className={`${primaryCta} w-full`}
            aria-haspopup="dialog"
            onClick={(event) => openPrefilled(event.currentTarget)}
          >
            {t('continue')}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label={t('moreWays')}>
          <SoonButton label={t('google')} soon={t('comingSoon', { label: t('google') })} hint={t('soon')} />
          <SoonButton label={t('apple')} soon={t('comingSoon', { label: t('apple') })} hint={t('soon')} />
          <SoonButton label={t('phone')} soon={t('comingSoon', { label: t('phone') })} hint={t('soon')} />
        </div>
      </div>
    </div>
  );
}

function SoonButton({ label, soon, hint }: { label: string; soon: string; hint: string }) {
  return (
    <button
      type="button"
      disabled
      aria-label={soon}
      className="inline-flex h-11 min-h-11 flex-col items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-2 text-sm font-bold leading-none text-[var(--text)] opacity-70"
    >
      {label}
      <span className="mt-1 text-[10px] font-black uppercase tracking-wide text-[var(--muted)]">{hint}</span>
    </button>
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
