'use client';
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Eye,
  EyeOff,
  Gift,
} from 'lucide-react';
import type {
  RegistrationErrorCode,
  RegistrationInput,
  RegistrationOptions,
} from '@brand/contracts';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  fetchRegistrationOptions,
  RegistrationRequestError,
  register,
  validateRegistrationStep,
  type RegistrationFieldErrors,
} from '@/data/registration-browser';
import { AlphaBetLoader } from '../alphabet-loader';
import { Button, IconButton } from '../ui';
import { AuthDialog } from './auth-dialog';
import { readRememberedIdentity, rememberIdentity } from './remembered-identity';
import { applyAuthenticatedSession } from './session';
import { ExternalAuthButtons } from './external-auth-buttons';

const inputClass =
  'h-11 w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-3 text-base text-[var(--text)] outline-none transition focus-visible:border-[var(--accent)] aria-[invalid=true]:border-[var(--danger)]';

const fieldErrorKeys = {
  'Enter a valid email address.': 'emailInvalid',
  'Use at least 8 characters.': 'passwordShort',
  'Choose your country.': 'countryRequired',
  'Choose your currency.': 'currencyRequired',
  'Enter your first name.': 'firstName',
  'Enter your last name.': 'lastName',
  'You must be at least 18 years old.': 'adult',
  'Enter your address.': 'address',
  'Enter your city.': 'city',
  'Enter your postal code.': 'postal',
  'Enter a valid phone number.': 'phone',
  'Choose the calling code for your country.': 'prefixCountry',
  'Choose a valid calling code.': 'prefixValid',
} as const;

function useFieldErrorText() {
  const t = useTranslations('auth.fieldErrors');
  return (message?: string) => {
    if (!message) return undefined;
    const key = fieldErrorKeys[message as keyof typeof fieldErrorKeys];
    return key ? t(key) : message;
  };
}

export interface RegistrationPrefill {
  email?: string;
  password?: string;
  country?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

const emptyInput: RegistrationInput = {
  email: '',
  password: '',
  country: '',
  currency: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  address: '',
  city: '',
  postalCode: '',
  phonePrefix: '',
  phone: '',
};

export function applyRegistrationOptions(
  current: RegistrationInput,
  result: RegistrationOptions,
): RegistrationInput {
  const country = current.country || result.defaults.country || '';
  return {
    ...current,
    country,
    currency: current.currency || result.defaults.currency || '',
    phonePrefix:
      current.phonePrefix ||
      result.countries.find((item) => item.code === country)?.callingCode ||
      '',
  };
}

function withPrefill(initial?: RegistrationPrefill): RegistrationInput {
  return {
    ...emptyInput,
    email: initial?.email ?? '',
    password: initial?.password ?? '',
    country: initial?.country ?? '',
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    phone: initial?.phone ?? '',
  };
}

export function RegistrationDialog({
  open,
  onClose,
  onSignIn,
  presentation = 'dialog',
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSignIn: () => void;
  presentation?: 'dialog' | 'page';
  initial?: RegistrationPrefill;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [input, setInput] = useState(() => withPrefill(initial));
  const [options, setOptions] = useState<RegistrationOptions | null>(null);
  const [fieldErrors, setFieldErrors] = useState<RegistrationFieldErrors>({});
  const [error, setError] = useState<RegistrationErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const inflight = useRef(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    const remembered = readRememberedIdentity();
    if (!remembered.email && !remembered.country) return;
    setInput((current) => ({
      ...current,
      email: current.email || remembered.email,
      country: remembered.country || current.country,
    }));
  }, []);
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('auth');

  useEffect(() => {
    if (!open || options) return;
    const controller = new AbortController();
    fetchRegistrationOptions(controller.signal)
      .then((result) => {
        setOptions(result);
        setInput((current) => applyRegistrationOptions(current, result));
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setError('registration_unavailable');
        }
      });
    return () => controller.abort();
  }, [open, options]);

  const update = (field: keyof RegistrationInput, value: string) => {
    setInput((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || inflight.current) return;
    const validation = validateRegistrationStep(input, step);
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      return;
    }
    if (step === 1) {
      setStep(2);
      setFieldErrors({});
      return;
    }
    inflight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await register(input);
      rememberIdentity({ email: input.email, country: input.country });
      applyAuthenticatedSession(queryClient, result.session);
      onClose();
      if (pathname !== '/casino') router.push('/casino');
    } catch (caught) {
      setError(
        caught instanceof RegistrationRequestError ? caught.code : 'registration_unavailable',
      );
    } finally {
      inflight.current = false;
      setPending(false);
    }
  };

  if (presentation !== 'page' && !open) return null;

  const flow = (
    <>
      {step === 1 && (
        <ExternalAuthButtons />
      )}
      <div className="mb-5 flex items-center gap-2" aria-label={t('stepOf', { step, total: 2 })}>
        {[1, 2].map((item) => (
          <span
            key={item}
            className="h-1.5 flex-1 rounded-full transition-colors"
            style={{ background: item <= step ? 'var(--accent)' : 'var(--surface-2)' }}
          />
        ))}
        <span className="ms-1 text-xs font-bold text-[var(--muted)]">{step}/2</span>
      </div>

      <form noValidate onSubmit={(event) => void submit(event)}>
        {step === 1 ? (
          <AccountStep
            input={input}
            options={options}
            errors={fieldErrors}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            update={update}
          />
        ) : (
          <ProfileStep input={input} options={options} errors={fieldErrors} update={update} />
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-[var(--danger)]">
            {t(`errors.${error}`)}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          {step === 2 && (
            <Button
              type="button"
              disabled={pending}
              variant="secondary"
              className="h-12"
              onClick={() => setStep(1)}
            >
              {t('back')}
            </Button>
          )}
          <Button type="submit" disabled={pending || !options} aria-busy={pending || undefined} className="h-12 flex-1 text-base">
            {pending && <AlphaBetLoader size="sm" className="text-current" />}
            {pending ? t('creating') : step === 1 ? t('continue') : t('createAccount')}
          </Button>
        </div>
      </form>

      <WelcomeOffer />
      <p className="mt-4 text-center text-xs text-[var(--muted)]">
        {t('already')}{' '}
        <button type="button" className="font-bold text-[var(--text)]" onClick={onSignIn}>
          {t('signIn')}
        </button>
      </p>
    </>
  );

  if (presentation === 'page') {
    return (
      <section className="mx-auto w-full max-w-lg">
        <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--accent)]">{t('joinBrand')}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">{t('createTitle')}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{t('createPageLede')}</p>
        <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6">
          {flow}
        </div>
      </section>
    );
  }

  return (
    <AuthDialog
      title={t('createTitle')}
      description={t('createLede')}
      onClose={onClose}
      panelClassName="sm:max-w-lg"
    >
      {flow}
    </AuthDialog>
  );
}

function AccountStep({
  input,
  options,
  errors,
  showPassword,
  setShowPassword,
  update,
}: StepProps & { showPassword: boolean; setShowPassword: (value: boolean) => void }) {
  const passwordId = useId();
  const t = useTranslations('auth');
  const fieldError = useFieldErrorText();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t('email')} error={fieldError(errors.email)} className="sm:col-span-2">
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={input.email}
          onChange={(event) => update('email', event.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
        <label htmlFor={passwordId} className="text-xs font-bold">
          {t('password')}
        </label>
        <div className="relative">
          <input
            id={passwordId}
            name="new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={8}
            value={input.password}
            onChange={(event) => update('password', event.target.value)}
            aria-invalid={errors.password ? true : undefined}
            className={`${inputClass} pe-12`}
          />
          <IconButton
            type="button"
            label={showPassword ? t('hidePassword') : t('showPassword')}
            className="absolute end-0.5 top-0.5 border-0 bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </IconButton>
        </div>
        {errors.password && (
          <span className="text-xs font-semibold text-[var(--danger)]">{fieldError(errors.password)}</span>
        )}
      </div>
      <Field label={t('country')} error={fieldError(errors.country)}>
        <select
          name="country"
          autoComplete="country"
          required
          value={input.country}
          onChange={(event) => {
            const country = event.target.value;
            update('country', country);
            update(
              'phonePrefix',
              options?.countries.find((item) => item.code === country)?.callingCode ?? '',
            );
          }}
          className={inputClass}
        >
          <option value="">{t('chooseCountry')}</option>
          {input.country && !options?.countries.some((item) => item.code === input.country) && (
            <option value={input.country}>{input.country}</option>
          )}
          {options?.countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('currency')} error={fieldError(errors.currency)}>
        <select
          name="currency"
          autoComplete="transaction-currency"
          required
          value={input.currency}
          onChange={(event) => update('currency', event.target.value)}
          className={inputClass}
        >
          <option value="">{t('chooseCurrency')}</option>
          {options?.currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} · {currency.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function ProfileStep({ input, options, errors, update }: StepProps) {
  const prefixes = useMemo(
    () =>
      Array.from(
        new Map(
          (options?.countries ?? [])
            .filter((country) => country.callingCode)
            .map((country) => [country.callingCode, country] as const),
        ).values(),
      ).sort((left, right) => Number(left.callingCode) - Number(right.callingCode)),
    [options],
  );
  const t = useTranslations('auth');
  const fieldError = useFieldErrorText();
  const shown = {
    ...errors,
    firstName: fieldError(errors.firstName),
    lastName: fieldError(errors.lastName),
    dateOfBirth: fieldError(errors.dateOfBirth),
    postalCode: fieldError(errors.postalCode),
    address: fieldError(errors.address),
    city: fieldError(errors.city),
    phonePrefix: fieldError(errors.phonePrefix),
    phone: fieldError(errors.phone),
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label={t('firstName')} field="firstName" autoComplete="given-name" {...{ input, errors: shown, update }} />
      <TextField label={t('lastName')} field="lastName" autoComplete="family-name" {...{ input, errors: shown, update }} />
      <TextField label={t('birthDate')} field="dateOfBirth" type="date" autoComplete="bday" max={adultDate()} {...{ input, errors: shown, update }} />
      <TextField label={t('postalCode')} field="postalCode" autoComplete="postal-code" maxLength={10} {...{ input, errors: shown, update }} />
      <TextField label={t('address')} field="address" autoComplete="street-address" className="sm:col-span-2" {...{ input, errors: shown, update }} />
      <TextField label={t('city')} field="city" autoComplete="address-level2" maxLength={20} {...{ input, errors: shown, update }} />
      <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <Field label={t('prefix')} error={shown.phonePrefix}>
          <select
            name="tel-country-code"
            autoComplete="tel-country-code"
            value={input.phonePrefix}
            onChange={(event) => update('phonePrefix', event.target.value)}
            className="h-11 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-2 text-base text-[var(--text)] outline-none transition focus-visible:border-[var(--accent)] aria-[invalid=true]:border-[var(--danger)] sm:px-3"
          >
            {prefixes.map((country) => (
              <option key={country.callingCode} value={country.callingCode ?? ''}>
                +{country.callingCode}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('phone')} error={shown.phone}>
          <input
            name="tel-national"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={input.phone}
            onChange={(event) => update('phone', event.target.value.replace(/\D/g, ''))}
            className={`${inputClass} min-w-0`}
          />
        </Field>
      </div>
    </div>
  );
}

interface StepProps {
  input: RegistrationInput;
  options: RegistrationOptions | null;
  errors: RegistrationFieldErrors;
  update: (field: keyof RegistrationInput, value: string) => void;
}

function TextField({
  label,
  field,
  input,
  errors,
  update,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  label: string;
  field: keyof RegistrationInput;
  input: RegistrationInput;
  errors: RegistrationFieldErrors;
  update: StepProps['update'];
}) {
  return (
    <Field label={label} error={errors[field]} className={className}>
      <input
        name={field}
        required
        value={input[field]}
        onChange={(event) => update(field, event.target.value)}
        aria-invalid={errors[field] ? true : undefined}
        className={inputClass}
        {...props}
      />
    </Field>
  );
}

function Field({
  label,
  error,
  className = '',
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const errorId = useId();
  const control = isValidElement<{
    id?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }>(children)
    ? cloneElement(children, {
        id: children.props.id ?? generatedId,
        'aria-invalid': error ? true : children.props['aria-invalid'],
        'aria-describedby': error ? errorId : children.props['aria-describedby'],
      })
    : children;
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={generatedId} className="text-xs font-bold">
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

function WelcomeOffer() {
  const t = useTranslations('auth');
  return (
    <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent)_28%,var(--line))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
        <Gift aria-hidden size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-wide text-[var(--accent-strong)]">{t('welcomeOffer')}</p>
        <p className="text-sm font-semibold">{t('welcomeOfferBody')}</p>
      </div>
    </div>
  );
}

function adultDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().slice(0, 10);
}
