import type {
  CoolOffReason,
  CoolOffRequest,
  ExclusionResult,
  RealityCheckPreference,
  ResponsibleGamingCatalog,
  ResponsibleGamingErrorCode,
  ResponsibleGamingPeriod,
  SelfExclusionRequest,
  SessionClock,
} from '@brand/contracts';
import { hasErrorCode, isAbortError, isRecord, readJson } from './browser-json';

const errorCodes = new Set<ResponsibleGamingErrorCode>([
  'session_ended',
  'auth_required',
  'responsible_gaming_unavailable',
  'invalid_interval',
  'invalid_period',
  'invalid_reason',
  'account_restricted',
]);

export class ResponsibleGamingRequestError extends Error {
  readonly code: ResponsibleGamingErrorCode;

  constructor(code: ResponsibleGamingErrorCode) {
    super(code);
    this.name = 'ResponsibleGamingRequestError';
    this.code = code;
  }
}

const unavailable = () => new ResponsibleGamingRequestError('responsible_gaming_unavailable');

async function send(path: string, init: RequestInit, credentials: RequestCredentials): Promise<Response> {
  try {
    return await fetch(path, {
      ...init,
      credentials,
      cache: 'no-store',
      headers: { accept: 'application/json', ...init.headers },
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw unavailable();
  }
}

function errorCode(response: Response, body: unknown): ResponsibleGamingErrorCode {
  if (response.status === 401 || hasErrorCode(body, 'session_ended')) {
    if (isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string') {
      const code = body.error.code as ResponsibleGamingErrorCode;
      if (errorCodes.has(code) && typeof body.error.message === 'string') return code;
    }
    return 'session_ended';
  }
  if (
    isRecord(body) &&
    isRecord(body.error) &&
    typeof body.error.code === 'string' &&
    typeof body.error.message === 'string' &&
    errorCodes.has(body.error.code as ResponsibleGamingErrorCode)
  ) {
    return body.error.code as ResponsibleGamingErrorCode;
  }
  return 'responsible_gaming_unavailable';
}

function fail(response: Response, body: unknown): never {
  throw new ResponsibleGamingRequestError(errorCode(response, body));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parsePeriod(value: unknown): ResponsibleGamingPeriod | null {
  const id = isRecord(value) ? finiteNumber(value.id) : null;
  if (
    !isRecord(value) ||
    id === null ||
    typeof value.text !== 'string' ||
    typeof value.dateSelector !== 'boolean'
  ) {
    return null;
  }
  return { id, text: value.text, dateSelector: value.dateSelector };
}

function parsePeriods(value: unknown): ResponsibleGamingPeriod[] | null {
  if (!Array.isArray(value)) return null;
  const periods: ResponsibleGamingPeriod[] = [];
  for (const item of value) {
    const period = parsePeriod(item);
    if (!period) return null;
    periods.push(period);
  }
  return periods;
}

function parseReason(value: unknown): CoolOffReason | null {
  const id = isRecord(value) ? finiteNumber(value.id) : null;
  if (!isRecord(value) || id === null || typeof value.text !== 'string') return null;
  return { id, text: value.text };
}

export function parseResponsibleGamingCatalog(value: unknown): ResponsibleGamingCatalog | null {
  if (!isRecord(value) || !Array.isArray(value.realityCheckIntervals) || !Array.isArray(value.coolOffReasons)) {
    return null;
  }
  const realityCheckIntervals: number[] = [];
  for (const item of value.realityCheckIntervals) {
    const interval = finiteNumber(item);
    if (interval === null || interval < 0) return null;
    realityCheckIntervals.push(interval);
  }
  const coolOffPeriods = parsePeriods(value.coolOffPeriods);
  const selfExclusionPeriods = parsePeriods(value.selfExclusionPeriods);
  if (!coolOffPeriods || !selfExclusionPeriods) return null;
  const coolOffReasons: CoolOffReason[] = [];
  for (const item of value.coolOffReasons) {
    const reason = parseReason(item);
    if (!reason) return null;
    coolOffReasons.push(reason);
  }
  return { realityCheckIntervals, coolOffPeriods, coolOffReasons, selfExclusionPeriods };
}

export function parseRealityCheckPreference(value: unknown): RealityCheckPreference | null {
  if (!isRecord(value)) return null;
  const intervalMinutes = finiteNumber(value.intervalMinutes);
  if (intervalMinutes === null || intervalMinutes < 0) return null;
  return { intervalMinutes };
}

export function parseSessionClock(value: unknown): SessionClock | null {
  if (!isRecord(value)) return null;
  if (value.source !== 'platform_login' && value.source !== 'unavailable') return null;
  if (value.startedAt !== null && typeof value.startedAt !== 'string') return null;
  return { startedAt: value.startedAt, source: value.source };
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null || typeof value === 'string') return value;
  return undefined;
}

export function parseExclusionResult(value: unknown): ExclusionResult | null {
  if (!isRecord(value)) return null;
  if (value.kind !== 'cool_off' && value.kind !== 'self_exclusion') return null;
  if (typeof value.periodText !== 'string' || typeof value.status !== 'string') return null;
  if (value.sessionEnded !== true) return null;
  const reasonText = nullableString(value.reasonText);
  const expiresAt = nullableString(value.expiresAt);
  const createdAt = nullableString(value.createdAt);
  if (reasonText === undefined || expiresAt === undefined || createdAt === undefined) return null;
  return {
    kind: value.kind,
    periodText: value.periodText,
    reasonText,
    status: value.status,
    expiresAt,
    createdAt,
    sessionEnded: true,
  };
}

async function readSuccess<T>(
  response: Response,
  parse: (value: unknown) => T | null,
): Promise<T> {
  const body = await readJson(response);
  const parsed = response.status === 200 ? parse(body) : null;
  if (!parsed) fail(response, body);
  return parsed;
}

export async function fetchResponsibleGamingCatalog(signal?: AbortSignal): Promise<ResponsibleGamingCatalog> {
  const response = await send('/api/responsible-gaming/catalog', { method: 'GET', signal }, 'omit');
  return readSuccess(response, parseResponsibleGamingCatalog);
}

export async function fetchRealityCheck(signal?: AbortSignal): Promise<RealityCheckPreference> {
  const response = await send('/api/responsible-gaming/reality-check', { method: 'GET', signal }, 'include');
  return readSuccess(response, parseRealityCheckPreference);
}

export async function updateRealityCheck(intervalMinutes: number): Promise<RealityCheckPreference> {
  const response = await send(
    '/api/responsible-gaming/reality-check',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intervalMinutes }),
    },
    'include',
  );
  return readSuccess(response, parseRealityCheckPreference);
}

export async function fetchSessionClock(signal?: AbortSignal): Promise<SessionClock> {
  const response = await send('/api/responsible-gaming/session', { method: 'GET', signal }, 'include');
  return readSuccess(response, parseSessionClock);
}

export async function startCoolOff(input: CoolOffRequest): Promise<ExclusionResult> {
  const body: CoolOffRequest = { periodId: input.periodId };
  if (input.reasonId !== undefined) body.reasonId = input.reasonId;
  const response = await send(
    '/api/responsible-gaming/cool-off',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    'include',
  );
  return readSuccess(response, parseExclusionResult);
}

export async function startSelfExclusion(input: SelfExclusionRequest): Promise<ExclusionResult> {
  const response = await send(
    '/api/responsible-gaming/self-exclusion',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ periodId: input.periodId }),
    },
    'include',
  );
  return readSuccess(response, parseExclusionResult);
}

export function endsAuthenticatedPlay(code: ResponsibleGamingErrorCode): boolean {
  return code === 'session_ended' || code === 'auth_required' || code === 'account_restricted';
}
