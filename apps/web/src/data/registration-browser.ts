import type {
  RegistrationErrorCode,
  RegistrationInput,
  RegistrationOptions,
  RegistrationSuccess,
} from '@brand/contracts';
import { getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';
import { hasErrorCode, isAbortError, isRecord, readJson } from './browser-json';
import { parseAuthSession } from './auth-browser';

export class RegistrationRequestError extends Error {
  constructor(readonly code: RegistrationErrorCode) {
    super(`Registration request failed: ${code}`);
    this.name = 'RegistrationRequestError';
  }
}

export type RegistrationFieldErrors = Partial<Record<keyof RegistrationInput, string>>;

export function validateRegistrationStep(
  input: RegistrationInput,
  step: 1 | 2,
): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {};
  if (step === 1) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (input.password.length < 8) errors.password = 'Use at least 8 characters.';
    if (!input.country) errors.country = 'Choose your country.';
    if (!input.currency) errors.currency = 'Choose your currency.';
    return errors;
  }
  if (!input.firstName.trim()) errors.firstName = 'Enter your first name.';
  if (!input.lastName.trim()) errors.lastName = 'Enter your last name.';
  if (!isAdult(input.dateOfBirth)) errors.dateOfBirth = 'You must be at least 18 years old.';
  if (!input.address.trim()) errors.address = 'Enter your address.';
  if (!input.city.trim()) errors.city = 'Enter your city.';
  if (!input.postalCode.trim()) errors.postalCode = 'Enter your postal code.';
  if (!/^\d{4,13}$/.test(input.phone)) errors.phone = 'Enter a valid phone number.';
  try {
    if (getCountryCallingCode(input.country as CountryCode) !== input.phonePrefix) {
      errors.phonePrefix = 'Choose the calling code for your country.';
    }
  } catch {
    errors.phonePrefix = 'Choose a valid calling code.';
  }
  return errors;
}

export async function fetchRegistrationOptions(signal?: AbortSignal): Promise<RegistrationOptions> {
  const response = await send('/api/registration/options', { method: 'GET', signal });
  const body = await readJson(response);
  if (response.status !== 200 || !isRegistrationOptions(body)) {
    throw new RegistrationRequestError('registration_unavailable');
  }
  return body;
}

export async function register(input: RegistrationInput): Promise<RegistrationSuccess> {
  const response = await send('/api/registration', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJson(response);
  if (response.status === 201 && isRecord(body) && body.status === 'created') {
    const session = parseAuthSession(body.session);
    if (session) return { status: 'created', session };
  }
  const codes: RegistrationErrorCode[] = [
    'invalid_registration',
    'email_already_registered',
    'unsupported_country',
    'unsupported_currency',
    'invalid_phone_prefix',
    'weak_password',
    'registration_unavailable',
    'sign_in_unavailable',
  ];
  const code = codes.find((candidate) => hasErrorCode(body, candidate));
  throw new RegistrationRequestError(code ?? 'registration_unavailable');
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', ...init.headers },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new RegistrationRequestError('registration_unavailable');
  }
}

function isRegistrationOptions(body: unknown): body is RegistrationOptions {
  return (
    isRecord(body) &&
    Array.isArray(body.countries) &&
    body.countries.every(
      (item) =>
        isRecord(item) &&
        typeof item.code === 'string' &&
        typeof item.name === 'string' &&
        (item.callingCode === null || typeof item.callingCode === 'string'),
    ) &&
    Array.isArray(body.currencies) &&
    body.currencies.every(
      (item) =>
        isRecord(item) &&
        typeof item.code === 'string' &&
        typeof item.name === 'string' &&
        typeof item.symbol === 'string',
    ) &&
    isRecord(body.defaults)
  );
}

function isAdult(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  return (
    birth <=
    new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()))
  );
}
