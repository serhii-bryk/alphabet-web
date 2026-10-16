'use client';

import { cloneElement, isValidElement, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { RegistrationOptions } from '@brand/contracts';
import {
  ExternalAuthRequestError,
  completeOnboarding,
  externalFieldOrder,
  fetchOnboarding,
  validateOnboardingValues,
  type OnboardingFormState,
} from '@/data/external-auth-browser';
import { fetchRegistrationOptions } from '@/data/registration-browser';
import { AlphaBetLoader } from '../alphabet-loader';
import { Button } from '../ui';
import { applyAuthenticatedSession } from './session';

const inputClass =
  'h-11 w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-3 text-base text-[var(--text)] outline-none transition focus-visible:border-[var(--accent)] aria-[invalid=true]:border-[var(--danger)]';

const fieldErrorKeys = {
  'Enter a valid email address.': 'emailInvalid',
  'Choose your country.': 'countryRequired',
  'Choose your currency.': 'currencyRequired',
  'Enter your first name.': 'firstName',
  'Enter your last name.': 'lastName',
  'You must be at least 18 years old.': 'adult',
  'Enter your address.': 'address',
  'Enter your city.': 'city',
  'Enter your postal code.': 'postal',
  'Enter a valid phone number.': 'phone',
  'Choose a valid calling code.': 'prefixValid',
  'Check this field.': 'required',
} as const;

const labels = {
  email: 'email',
  first_name: 'firstName',
  last_name: 'lastName',
  date_of_birth: 'birthDate',
  country: 'country',
  currency: 'currency',
  address: 'address',
  city: 'city',
  postal_code: 'postalCode',
  phone_prefix: 'prefix',
  phone: 'phone',
  username: 'username',
} as const;

export function OnboardingForm() {
  const t = useTranslations('auth');
  const fieldError = useFieldErrorText();
  const router = useRouter();
  const client = useQueryClient();
  const [form, setForm] = useState<OnboardingFormState | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<RegistrationOptions | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchOnboarding(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setForm(next);
        setValues({ ...next.prefill });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setBlocked(true);
        setNotice(
          t(
            `loginErrors.${error instanceof ExternalAuthRequestError ? error.code : 'onboarding_unavailable'}`,
          ),
        );
      });
    void fetchRegistrationOptions(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setOptions(next);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [t]);

  const fields = useMemo(
    () => (form ? externalFieldOrder(form.requiredFields, form.prefill) : []),
    [form],
  );

  const update = (field: string, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const submit = () => {
    if (!form || pending) return;
    const nextErrors = validateOnboardingValues(fields, form.requiredFields, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const payload: Record<string, string> = {};
    for (const field of fields) {
      const value = values[field]?.trim() ?? '';
      if (value) payload[field] = value;
    }
    setPending(true);
    setNotice(null);
    void completeOnboarding(payload)
      .then((result) => {
        applyAuthenticatedSession(client, result.session);
        router.replace(result.next || form.next || '/casino');
      })
      .catch((error: unknown) => {
        if (error instanceof ExternalAuthRequestError) {
          if (error.fields.length > 0) {
            const mapped: Record<string, string> = {};
            for (const field of error.fields) mapped[field] = 'Check this field.';
            setErrors(mapped);
          }
          setNotice(t(`loginErrors.${error.code}`));
          if (error.code === 'onboarding_expired' || error.code === 'onboarding_unavailable') setBlocked(true);
        } else {
          setNotice(t('loginErrors.external_auth_unavailable'));
        }
        setPending(false);
      });
  };

  if (!form && !notice) {
    return (
      <p className="mx-auto flex min-h-[40vh] max-w-md items-center justify-center gap-2 px-4 text-sm font-semibold text-[var(--muted)]">
        <AlphaBetLoader size="sm" />
        {t('callbackWorking')}
      </p>
    );
  }

  return (
    <section className="mx-auto w-full max-w-lg px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-black tracking-tight">{t('onboardingTitle')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{t('onboardingLede')}</p>
      {form && !blocked && (
        <form
          noValidate
          className="mt-6 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {fields.map((field) => (
            <OnboardingField
              key={field}
              field={field}
              required={form.requiredFields.includes(field)}
              value={values[field] ?? ''}
              error={fieldError(errors[field])}
              options={options}
              onChange={(value) => update(field, value)}
            />
          ))}
          {notice && (
            <p role="alert" className="text-sm font-semibold text-[var(--danger)]">
              {notice}
            </p>
          )}
          <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="mt-2 h-12 text-base">
            {pending && <AlphaBetLoader size="sm" className="text-current" />}
            {pending ? t('onboardingWorking') : t('onboardingSubmit')}
          </Button>
        </form>
      )}
      {(!form || blocked) && notice && (
        <div className="mt-6 flex flex-col gap-4">
          <p role="alert" className="text-sm font-semibold text-[var(--danger)]">
            {notice}
          </p>
          <Button type="button" className="h-11" onClick={() => router.replace('/casino')}>
            {t('backHome')}
          </Button>
        </div>
      )}
    </section>
  );
}

function OnboardingField({
  field,
  required,
  value,
  error,
  options,
  onChange,
}: {
  field: string;
  required: boolean;
  value: string;
  error?: string;
  options: RegistrationOptions | null;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('auth');
  const label = field in labels ? t(labels[field as keyof typeof labels]) : field.replaceAll('_', ' ');
  if (field === 'country') {
    return (
      <Field label={label} error={error}>
        <select name="country" autoComplete="country" required={required} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
          <option value="">{t('chooseCountry')}</option>
          {value && !options?.countries.some((country) => country.code === value) && <option value={value}>{value}</option>}
          {options?.countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  if (field === 'currency') {
    return (
      <Field label={label} error={error}>
        <select name="currency" autoComplete="transaction-currency" required={required} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
          <option value="">{t('chooseCurrency')}</option>
          {value && !options?.currencies.some((currency) => currency.code === value) && <option value={value}>{value}</option>}
          {options?.currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} · {currency.name}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  if (field === 'phone_prefix') {
    const prefixes = Array.from(
      new Map(
        (options?.countries ?? [])
          .filter((country) => country.callingCode)
          .map((country) => [country.callingCode, country] as const),
      ).values(),
    );
    return (
      <Field label={label} error={error}>
        <select name="tel-country-code" autoComplete="tel-country-code" required={required} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
          <option value="">{t('prefix')}</option>
          {value && !prefixes.some((country) => country.callingCode === value) && <option value={value}>+{value.replace(/^\+/, '')}</option>}
          {prefixes.map((country) => (
            <option key={country.callingCode} value={country.callingCode ?? ''}>
              +{country.callingCode}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  const type = field === 'email' ? 'email' : field === 'date_of_birth' ? 'date' : field === 'phone' ? 'tel' : 'text';
  return (
    <Field label={label} error={error}>
      <input
        name={field}
        type={type}
        inputMode={field === 'email' ? 'email' : field === 'phone' ? 'tel' : undefined}
        autoComplete={autocomplete(field)}
        autoCapitalize={field === 'email' ? 'none' : undefined}
        required={required}
        maxLength={maxLength(field)}
        max={field === 'date_of_birth' ? adultDate() : undefined}
        value={value}
        onChange={(event) => onChange(field === 'phone' ? event.target.value.replace(/\D/g, '') : event.target.value)}
        className={inputClass}
      />
    </Field>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  const id = useId();
  const errorId = useId();
  const control = isValidElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })
    : children;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-bold">
        {label}
      </label>
      {control}
      {error && (
        <span id={errorId} className="text-xs font-semibold text-[var(--danger)]">
          {error}
        </span>
      )}
    </div>
  );
}

function useFieldErrorText() {
  const t = useTranslations('auth.fieldErrors');
  return (message?: string) => {
    if (!message) return undefined;
    const key = fieldErrorKeys[message as keyof typeof fieldErrorKeys];
    return key ? t(key) : message;
  };
}

function autocomplete(field: string): string | undefined {
  switch (field) {
    case 'email':
      return 'email';
    case 'first_name':
      return 'given-name';
    case 'last_name':
      return 'family-name';
    case 'date_of_birth':
      return 'bday';
    case 'address':
      return 'street-address';
    case 'city':
      return 'address-level2';
    case 'postal_code':
      return 'postal-code';
    case 'phone':
      return 'tel-national';
    case 'username':
      return 'username';
    default:
      return undefined;
  }
}

function maxLength(field: string): number | undefined {
  if (field === 'city') return 20;
  if (field === 'postal_code') return 10;
  if (field === 'phone') return 13;
  return 255;
}

function adultDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().slice(0, 10);
}
