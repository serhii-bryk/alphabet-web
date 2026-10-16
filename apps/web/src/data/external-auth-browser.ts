import type { AuthSession } from '@brand/contracts';
import type { LoginErrorCode } from './auth-browser';
import { parseAuthSession } from './auth-browser';
import { hasErrorCode, isAbortError, isRecord, readJson } from './browser-json';

export interface ExternalAuthMethod {
  code: string;
  name: string;
  type: 'redirect';
}

export interface OnboardingFormState {
  requiredFields: string[];
  prefill: Record<string, string>;
  expiresAt: string;
  next: string;
}

export type ExternalFinishResult =
  | { status: 'authenticated'; session: AuthSession; next: string }
  | ({ status: 'onboarding_required' } & OnboardingFormState);

export class ExternalAuthRequestError extends Error {
  readonly fields: readonly string[];

  constructor(
    readonly code: LoginErrorCode,
    fields: readonly string[] = [],
  ) {
    super(`External auth failed: ${code}`);
    this.name = 'ExternalAuthRequestError';
    this.fields = fields;
  }
}

const errorCodes: LoginErrorCode[] = [
  'external_auth_rejected',
  'external_auth_unavailable',
  'external_auth_cancelled',
  'external_auth_expired',
  'external_auth_mismatch',
  'invalid_return_url',
  'account_restricted',
  'onboarding_expired',
  'onboarding_unavailable',
  'invalid_onboarding',
  'email_already_registered',
  'auth_unavailable',
];

const shownFields = [
  'email',
  'first_name',
  'last_name',
  'date_of_birth',
  'country',
  'currency',
  'address',
  'city',
  'postal_code',
  'phone_prefix',
  'phone',
  'username',
] as const;

export function externalFieldOrder(requiredFields: readonly string[], prefill: Record<string, string>): string[] {
  const shown = new Set([...requiredFields, ...Object.keys(prefill)]);
  const ordered: string[] = shownFields.filter((field) => shown.has(field));
  for (const field of requiredFields) {
    if (!ordered.includes(field)) ordered.push(field);
  }
  return ordered;
}

export function validateOnboardingValues(
  fields: readonly string[],
  requiredFields: readonly string[],
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const required = new Set(requiredFields);
  for (const field of fields) {
    const value = values[field]?.trim() ?? '';
    if (!value) {
      if (required.has(field)) errors[field] = emptyMessage(field);
      continue;
    }
    const invalid = invalidMessage(field, value);
    if (invalid) errors[field] = invalid;
  }
  return errors;
}

export async function fetchExternalAuthMethods(signal?: AbortSignal): Promise<ExternalAuthMethod[]> {
  try {
    const response = await send('/api/auth/methods', { method: 'GET', signal }, 'external_auth_unavailable');
    if (response.status !== 200) return [];
    return parseMethods(await readJson(response));
  } catch (error) {
    if (isAbortError(error)) throw error;
    return [];
  }
}

export async function startExternalAuth(method: string, nextPath: string): Promise<string> {
  const response = await send(
    '/api/auth/external/start',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, next: nextPath }),
    },
    'external_auth_unavailable',
  );
  const body = await readJson(response);
  if (response.status === 200 && isRecord(body) && typeof body.redirectUrl === 'string' && isRedirectUrl(body.redirectUrl)) {
    return body.redirectUrl;
  }
  throw errorFrom(body, 'external_auth_unavailable');
}

export async function finishExternalAuth(input: {
  ticket?: string;
  clientState?: string;
  error?: string;
}): Promise<ExternalFinishResult> {
  const response = await send(
    '/api/auth/external/finish',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    'external_auth_unavailable',
  );
  const body = await readJson(response);
  if (response.status === 200) {
    const finished = parseFinish(body);
    if (finished) return finished;
  }
  throw errorFrom(body, 'external_auth_unavailable');
}

export async function fetchOnboarding(signal?: AbortSignal): Promise<OnboardingFormState> {
  const response = await send('/api/auth/onboarding', { method: 'GET', signal }, 'onboarding_unavailable');
  const body = await readJson(response);
  if (response.status === 200) {
    const form = parseOnboarding(body);
    if (form) return form;
  }
  throw errorFrom(body, 'onboarding_unavailable');
}

export async function completeOnboarding(values: Record<string, string>): Promise<{
  session: AuthSession;
  next: string;
}> {
  const response = await send(
    '/api/auth/onboarding',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values }),
    },
    'external_auth_unavailable',
  );
  const body = await readJson(response);
  if (response.status === 200 && isRecord(body)) {
    const session = parseAuthSession(body);
    if (session) return { session, next: readNext(body.next) };
  }
  throw errorFrom(body, 'invalid_onboarding');
}

export function isRedirectUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function parseMethods(body: unknown): ExternalAuthMethod[] {
  if (!isRecord(body) || !Array.isArray(body.methods)) return [];
  const methods: ExternalAuthMethod[] = [];
  for (const item of body.methods) {
    if (
      isRecord(item) &&
      typeof item.code === 'string' &&
      /^[a-z0-9_-]{1,64}$/.test(item.code) &&
      typeof item.name === 'string' &&
      item.name.trim() !== '' &&
      item.type === 'redirect'
    ) {
      methods.push({ code: item.code, name: item.name.trim(), type: 'redirect' });
    }
  }
  return methods;
}

function parseFinish(body: unknown): ExternalFinishResult | null {
  if (!isRecord(body)) return null;
  if (body.status === 'onboarding_required') {
    const form = parseOnboarding(body);
    return form ? { status: 'onboarding_required', ...form } : null;
  }
  const session = parseAuthSession(body);
  if (!session) return null;
  return { status: 'authenticated', session, next: readNext(body.next) };
}

function parseOnboarding(body: unknown): OnboardingFormState | null {
  if (
    !isRecord(body) ||
    !Array.isArray(body.requiredFields) ||
    !body.requiredFields.every((field) => typeof field === 'string') ||
    !isRecord(body.prefill) ||
    typeof body.expiresAt !== 'string' ||
    Number.isNaN(Date.parse(body.expiresAt))
  ) {
    return null;
  }
  const prefill: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.prefill)) {
    if (typeof value === 'string') prefill[key] = value;
  }
  return {
    requiredFields: body.requiredFields.filter((field): field is string => typeof field === 'string'),
    prefill,
    expiresAt: body.expiresAt,
    next: readNext(body.next),
  };
}

function readNext(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/casino';
}

function errorFrom(body: unknown, fallback: LoginErrorCode): ExternalAuthRequestError {
  const code = errorCodes.find((candidate) => hasErrorCode(body, candidate)) ?? fallback;
  const fields =
    isRecord(body) && Array.isArray(body.fields)
      ? body.fields.filter((field): field is string => typeof field === 'string')
      : [];
  return new ExternalAuthRequestError(code, fields);
}

async function send(path: string, init: RequestInit, fallback: LoginErrorCode): Promise<Response> {
  try {
    return await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', ...init.headers },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ExternalAuthRequestError(fallback);
  }
}

function emptyMessage(field: string): string {
  switch (field) {
    case 'email':
      return 'Enter a valid email address.';
    case 'country':
      return 'Choose your country.';
    case 'currency':
      return 'Choose your currency.';
    case 'first_name':
      return 'Enter your first name.';
    case 'last_name':
      return 'Enter your last name.';
    case 'date_of_birth':
      return 'You must be at least 18 years old.';
    case 'address':
      return 'Enter your address.';
    case 'city':
      return 'Enter your city.';
    case 'postal_code':
      return 'Enter your postal code.';
    case 'phone':
      return 'Enter a valid phone number.';
    case 'phone_prefix':
      return 'Choose a valid calling code.';
    default:
      return 'Check this field.';
  }
}

function invalidMessage(field: string, value: string): string | undefined {
  switch (field) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : 'Enter a valid email address.';
    case 'date_of_birth':
      return isAdult(value) ? undefined : 'You must be at least 18 years old.';
    case 'country':
      return /^[A-Za-z]{2,3}$/.test(value) ? undefined : 'Choose your country.';
    case 'currency':
      return /^[A-Za-z]{3}$/.test(value) ? undefined : 'Choose your currency.';
    case 'postal_code':
      return value.length <= 10 ? undefined : 'Enter your postal code.';
    case 'city':
      return value.length <= 20 ? undefined : 'Enter your city.';
    case 'phone':
      return /^\d{4,13}$/.test(value) ? undefined : 'Enter a valid phone number.';
    case 'phone_prefix':
      return /^\+?\d{1,5}$/.test(value) ? undefined : 'Choose a valid calling code.';
    default:
      return value.length <= 255 ? undefined : 'Check this field.';
  }
}

function isAdult(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  return birth <= new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
}
