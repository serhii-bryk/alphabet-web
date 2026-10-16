import type {
  AccountErrorCode,
  AuthErrorCode,
  AuthSession,
  GuestSession,
  PlayerBalance,
  PlayerProfile,
  SessionResponse,
} from '@brand/contracts';
import { hasErrorCode, isAbortError, isRecord, readJson } from './browser-json';

export type LoginErrorCode = Exclude<AuthErrorCode, 'session_ended'>;

export class AuthRequestError extends Error {
  readonly code: LoginErrorCode;

  constructor(code: LoginErrorCode) {
    super(`Auth request failed: ${code}`);
    this.name = 'AuthRequestError';
    this.code = code;
  }
}

export class AccountRequestError extends Error {
  readonly code: AccountErrorCode;

  constructor(code: AccountErrorCode) {
    super(`Account request failed: ${code}`);
    this.name = 'AccountRequestError';
    this.code = code;
  }
}

export interface LoginInput {
  email: string;
  password: string;
}

export const guestSession: GuestSession = { authenticated: false };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidLoginInput({ email, password }: LoginInput) {
  const trimmed = email.trim();
  return (
    trimmed.length <= 255 &&
    emailPattern.test(trimmed) &&
    password.length >= 8 &&
    password.length <= 255
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isSessionEmail(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0);
}

export function parseAuthSession(body: unknown): AuthSession | null {
  if (
    !isRecord(body) ||
    body.authenticated !== true ||
    typeof body.playerId !== 'string' ||
    !isSessionEmail(body.email) ||
    !isNullableString(body.currency) ||
    typeof body.expiresAt !== 'string' ||
    Number.isNaN(Date.parse(body.expiresAt))
  ) {
    return null;
  }
  return {
    authenticated: true,
    playerId: body.playerId,
    email: body.email,
    currency: body.currency,
    expiresAt: body.expiresAt,
  };
}

export function parseSessionResponse(body: unknown): SessionResponse | null {
  if (isRecord(body) && body.authenticated === false) return guestSession;
  return parseAuthSession(body);
}

export function parsePlayerProfile(body: unknown): PlayerProfile | null {
  if (
    !isRecord(body) ||
    typeof body.playerId !== 'string' ||
    !isSessionEmail(body.email) ||
    typeof body.firstName !== 'string' ||
    typeof body.lastName !== 'string' ||
    !isNullableString(body.currency) ||
    !isNullableString(body.countryCode) ||
    typeof body.emailVerified !== 'boolean'
  ) {
    return null;
  }
  return {
    playerId: body.playerId,
    email: body.email,
    firstName: body.firstName,
    lastName: body.lastName,
    currency: body.currency,
    countryCode: body.countryCode,
    emailVerified: body.emailVerified,
  };
}

export function parsePlayerBalance(body: unknown): PlayerBalance | null {
  if (
    !isRecord(body) ||
    typeof body.balance !== 'number' ||
    !Number.isFinite(body.balance) ||
    typeof body.currency !== 'string'
  ) {
    return null;
  }
  return { balance: body.balance, currency: body.currency };
}

async function send(
  path: string,
  init: RequestInit,
  onNetworkError: () => Error,
): Promise<Response> {
  try {
    return await fetch(path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', ...init.headers },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw onNetworkError();
  }
}

export async function fetchSession(signal?: AbortSignal): Promise<SessionResponse> {
  const unavailable = () => new AuthRequestError('auth_unavailable');
  const response = await send('/api/session', { method: 'GET', signal }, unavailable);
  const session = response.status === 200 ? parseSessionResponse(await readJson(response)) : null;
  if (!session) throw unavailable();
  return session;
}

const loginErrorByStatus: Partial<Record<number, LoginErrorCode>> = {
  400: 'invalid_login',
  401: 'invalid_credentials',
  502: 'auth_unavailable',
};

export async function login(input: LoginInput): Promise<AuthSession> {
  const response = await send(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: input.email.trim(), password: input.password }),
    },
    () => new AuthRequestError('auth_unavailable'),
  );
  const body = await readJson(response);
  if (response.status === 200) {
    const session = parseAuthSession(body);
    if (session) return session;
    throw new AuthRequestError('auth_unavailable');
  }
  if (hasErrorCode(body, 'account_restricted')) throw new AuthRequestError('account_restricted');
  const expected = loginErrorByStatus[response.status];
  throw new AuthRequestError(
    expected && hasErrorCode(body, expected) ? expected : 'auth_unavailable',
  );
}

export async function logout(): Promise<GuestSession> {
  const response = await send(
    '/api/auth/logout',
    { method: 'POST' },
    () => new AuthRequestError('auth_unavailable'),
  );
  if (response.status !== 200) throw new AuthRequestError('auth_unavailable');
  return guestSession;
}

async function fetchAccount<T>(
  path: string,
  parse: (body: unknown) => T | null,
  signal?: AbortSignal,
): Promise<T> {
  const unavailable = () => new AccountRequestError('account_unavailable');
  const response = await send(path, { method: 'GET', signal }, unavailable);
  if (response.status === 401) throw new AccountRequestError('session_ended');
  const value = response.status === 200 ? parse(await readJson(response)) : null;
  if (value === null) throw unavailable();
  return value;
}

export function fetchProfile(signal?: AbortSignal) {
  return fetchAccount('/api/account/profile', parsePlayerProfile, signal);
}

export function fetchBalance(signal?: AbortSignal) {
  return fetchAccount('/api/account/balance', parsePlayerBalance, signal);
}
