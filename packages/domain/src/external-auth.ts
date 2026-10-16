import { PlatformClientError } from '@brand/platform';
import type {
  PlatformClient,
  PlatformExternalAuthExchange,
  PlatformLoginResponse,
} from '@brand/platform';
import { establishPlayerSession } from './auth.js';
import type { PlayerSession } from './auth.js';

export type ExternalAuthErrorCode =
  | 'external_auth_unavailable'
  | 'external_auth_rejected'
  | 'external_auth_cancelled'
  | 'external_auth_expired'
  | 'external_auth_mismatch'
  | 'invalid_return_url'
  | 'account_restricted'
  | 'onboarding_expired'
  | 'onboarding_unavailable'
  | 'invalid_onboarding'
  | 'email_already_registered';

export class ExternalAuthError extends Error {
  readonly fields: readonly string[];

  constructor(
    readonly code: ExternalAuthErrorCode,
    fields: readonly string[] = [],
  ) {
    super('External authentication failed');
    this.name = 'ExternalAuthError';
    this.fields = fields;
  }
}

export interface ExternalAuthMethod {
  code: string;
  name: string;
  type: 'redirect';
}

export interface ExternalOnboarding {
  token: string;
  expiresIn: number;
  requiredFields: string[];
  prefill: Record<string, string>;
}

export type ExternalAuthResult =
  | { status: 'authenticated'; session: PlayerSession }
  | { status: 'onboarding_required'; onboarding: ExternalOnboarding };

export interface ExternalAuthUseCases {
  listMethods(): Promise<ExternalAuthMethod[]>;
  start(input: {
    method: string;
    returnUrl: string;
    clientState: string;
    ipNumber?: string;
    browser?: string;
    domain?: string;
  }): Promise<{ authenticationId: string; redirectUrl: string; expiresIn: number }>;
  exchange(input: { ticket: string; authenticationId: string }): Promise<ExternalAuthResult>;
  completeOnboarding(input: {
    token: string;
    requiredFields: readonly string[];
    values: Record<string, string>;
  }): Promise<PlayerSession>;
}

const optionalPlayerFields = new Set([
  'first_name',
  'last_name',
  'address',
  'city',
  'postal_code',
  'phone_prefix',
  'phone',
  'username',
  'btag',
]);

export function createExternalAuthUseCases(
  platform: PlatformClient,
  options: { now?: () => number } = {},
): ExternalAuthUseCases {
  const now = options.now ?? Date.now;

  return {
    async listMethods() {
      try {
        return await platform.listExternalAuthMethods();
      } catch (error) {
        throw mapExternalFailure(error);
      }
    },

    async start(input) {
      let methods: ExternalAuthMethod[];
      try {
        methods = await platform.listExternalAuthMethods();
      } catch (error) {
        throw mapExternalFailure(error);
      }
      if (!methods.some((method) => method.code === input.method)) {
        throw new ExternalAuthError('external_auth_unavailable');
      }
      try {
        const started = await platform.startExternalAuth({
          method: input.method,
          returnUrl: input.returnUrl,
          clientState: input.clientState,
          ...(input.ipNumber ? { ipNumber: input.ipNumber } : {}),
          ...(input.browser ? { browser: input.browser } : {}),
          ...(input.domain ? { domain: input.domain } : {}),
        });
        return {
          authenticationId: started.authentication_id,
          redirectUrl: started.redirect_url,
          expiresIn: started.expires_in,
        };
      } catch (error) {
        throw mapExternalFailure(error);
      }
    },

    async exchange(input) {
      let exchanged: PlatformExternalAuthExchange;
      try {
        exchanged = await platform.exchangeExternalAuth({
          ticket: input.ticket,
          authenticationId: input.authenticationId,
        });
      } catch (error) {
        throw mapExternalFailure(error);
      }
      if (exchanged.status === 'onboarding_required') {
        return {
          status: 'onboarding_required',
          onboarding: {
            token: exchanged.onboarding_token,
            expiresIn: exchanged.expires_in,
            requiredFields: exchanged.required_fields,
            prefill: exchanged.prefill,
          },
        };
      }
      return {
        status: 'authenticated',
        session: await sessionFromExternal(platform, exchanged.session, now),
      };
    },

    async completeOnboarding(input) {
      const player = playerPayload(input.requiredFields, input.values, now);
      let authenticated: PlatformLoginResponse;
      try {
        authenticated = await platform.completeExternalOnboarding({
          onboardingToken: input.token,
          player,
        });
      } catch (error) {
        throw mapExternalFailure(error);
      }
      return sessionFromExternal(platform, authenticated, now);
    },
  };
}

async function sessionFromExternal(
  platform: PlatformClient,
  authenticated: PlatformLoginResponse,
  now: () => number,
): Promise<PlayerSession> {
  try {
    return await establishPlayerSession(platform, authenticated, now);
  } catch (error) {
    if (error instanceof ExternalAuthError) throw error;
    const fallback = sessionFromPayload(authenticated, now);
    if (!fallback) throw new ExternalAuthError('external_auth_unavailable');
    return fallback;
  }
}

function sessionFromPayload(
  authenticated: PlatformLoginResponse,
  now: () => number,
): PlayerSession | undefined {
  const expiresAt = new Date(now() + authenticated.expires_in * 1000);
  if (Number.isNaN(expiresAt.getTime()) || !Number.isSafeInteger(authenticated.profile.id)) {
    return undefined;
  }
  return {
    accessToken: authenticated.access_token,
    playerId: String(authenticated.profile.id),
    email: authenticated.profile.email,
    currency: authenticated.profile.currency?.code ?? null,
    expiresAt: expiresAt.toISOString(),
  };
}

function playerPayload(
  requiredFields: readonly string[],
  values: Record<string, string>,
  now: () => number,
): Record<string, string> {
  const invalid: string[] = [];
  const player: Record<string, string> = {};
  const allowed = new Set([...requiredFields, ...optionalPlayerFields]);

  for (const field of requiredFields) {
    const value = normalizePlayerField(field, values[field] ?? '');
    if (!value || !playerFieldIsValid(field, value, now)) invalid.push(field);
    else player[field] = value;
  }

  for (const [field, raw] of Object.entries(values)) {
    if (field in player || !allowed.has(field)) continue;
    const value = normalizePlayerField(field, raw);
    if (!value) continue;
    if (!playerFieldIsValid(field, value, now)) invalid.push(field);
    else player[field] = value;
  }

  if (invalid.length > 0) throw new ExternalAuthError('invalid_onboarding', invalid);
  return player;
}

function normalizePlayerField(field: string, value: string): string {
  const trimmed = value.trim();
  if (field === 'email') return trimmed.toLowerCase();
  if (field === 'country' || field === 'currency') return trimmed.toUpperCase();
  return trimmed;
}

function playerFieldIsValid(field: string, value: string, now: () => number): boolean {
  switch (field) {
    case 'email':
      return value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'country':
      return /^[A-Z]{2,3}$/.test(value);
    case 'currency':
      return /^[A-Z]{3}$/.test(value);
    case 'date_of_birth':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && isAdultBirthDate(value, now);
    case 'city':
      return value.length <= 20;
    case 'postal_code':
      return value.length <= 10;
    case 'phone_prefix':
      return /^\+?\d{1,5}$/.test(value);
    case 'phone':
      return /^\d{1,13}$/.test(value);
    case 'first_name':
    case 'last_name':
    case 'address':
    case 'username':
    case 'btag':
      return value.length <= 255;
    default:
      return value.length <= 255;
  }
}

function isAdultBirthDate(value: string, now: () => number): boolean {
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date(now());
  const adult = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
  return birth <= adult;
}

function mapExternalFailure(error: unknown): ExternalAuthError {
  if (!(error instanceof PlatformClientError) || error.code !== 'request_failed') {
    return new ExternalAuthError('external_auth_unavailable');
  }
  const code = error.platformCode;
  if (code === 'invalid_return_url') return new ExternalAuthError('invalid_return_url');
  if (code === 'authentication_ticket_expired' || code === 'authentication_expired') {
    return new ExternalAuthError('external_auth_expired');
  }
  if (code === 'authentication_cancelled') return new ExternalAuthError('external_auth_cancelled');
  if (
    code === 'authentication_ticket_invalid' ||
    code === 'authentication_ticket_used' ||
    code === 'authentication_failed' ||
    code === 'invalid_login_method_authentication'
  ) {
    return new ExternalAuthError('external_auth_rejected');
  }
  if (
    code === 'authentication_binding_mismatch' ||
    code === 'authentication_partner_mismatch' ||
    code === 'invalid_authentication_state'
  ) {
    return new ExternalAuthError('external_auth_mismatch');
  }
  if (code === 'player_has_excluded' || code === 'player_login_unavailable') {
    return new ExternalAuthError('account_restricted');
  }
  if (code === 'onboarding_expired') return new ExternalAuthError('onboarding_expired');
  if (
    code === 'onboarding_token_invalid' ||
    code === 'onboarding_already_completed' ||
    code === 'identity_already_registered'
  ) {
    return new ExternalAuthError('onboarding_unavailable');
  }
  if (
    code === 'player_already_exists' ||
    code === 'player_username_already_exists' ||
    code === 'external_login_email_already_exists'
  ) {
    return new ExternalAuthError('email_already_registered');
  }
  if (code === 'registration_validation_failed') {
    return new ExternalAuthError('invalid_onboarding', error.fields ?? []);
  }
  if (code === 'registration_not_allowed') {
    if (error.status === 403) return new ExternalAuthError('external_auth_unavailable');
    return new ExternalAuthError('invalid_onboarding', error.field ? [error.field] : []);
  }
  return new ExternalAuthError('external_auth_unavailable');
}
