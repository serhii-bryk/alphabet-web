import type { RegistrationInput, RegistrationOptions } from '@brand/contracts';
import { PlatformClientError } from '@brand/platform';
import type { PlatformClient } from '@brand/platform';
import { getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';

export type RegistrationDomainErrorCode =
  | 'invalid_registration'
  | 'email_already_registered'
  | 'unsupported_country'
  | 'unsupported_currency'
  | 'invalid_phone_prefix'
  | 'registration_unavailable';

export class RegistrationError extends Error {
  constructor(readonly code: RegistrationDomainErrorCode) {
    super('Registration failed');
    this.name = 'RegistrationError';
  }
}

export type VerifyTokenResult =
  | { status: 'valid'; playerId: string }
  | { status: 'invalid' | 'expired' | 'unavailable' };

export type ResendVerificationResult =
  | { status: 'sent' }
  | { status: 'throttled' | 'already_verified' | 'invalid' | 'unavailable' };

/** Isolated Nexus adapter contract. Registration does not call this. */
export interface EmailVerificationGateway {
  verifyToken(token: string): Promise<VerifyTokenResult>;
  resend(input: {
    email?: string;
    token?: string;
    verificationUrl: string;
  }): Promise<ResendVerificationResult>;
}

export interface RegistrationCreated {
  status: 'created';
}

export interface RegistrationUseCases {
  options(): Promise<RegistrationOptions>;
  register(input: RegistrationInput): Promise<RegistrationCreated>;
}

export function createRegistrationUseCases(
  platform: PlatformClient,
  options: { now?: () => number; defaultCountry?: string; defaultCurrency?: string } = {},
): RegistrationUseCases {
  const now = options.now ?? Date.now;
  let cache: { expiresAt: number; value: RegistrationOptions } | undefined;

  async function loadOptions(): Promise<RegistrationOptions> {
    if (cache && cache.expiresAt > now()) return cache.value;
    const [countries, currencies] = await Promise.all([
      platform.getRegistrationCountries(),
      platform.getRegistrationCurrencies(),
    ]);
    const value: RegistrationOptions = {
      countries: countries.map((country) => ({
        code: country.alpha2,
        name: country.name_common,
        callingCode: callingCode(country.alpha2),
      })),
      currencies: currencies.map(({ code, name, symbol }) => ({ code, name, symbol })),
      defaults: {
        country: chooseDefault(countries.map((country) => country.alpha2), options.defaultCountry),
        currency: chooseDefault(currencies.map((currency) => currency.code), options.defaultCurrency),
      },
    };
    cache = { expiresAt: now() + 300_000, value };
    return value;
  }

  return {
    options: loadOptions,
    async register(input) {
      let reference: RegistrationOptions;
      try {
        reference = await loadOptions();
      } catch {
        throw new RegistrationError('registration_unavailable');
      }
      if (!reference.countries.some(({ code }) => code === input.country)) {
        throw new RegistrationError('unsupported_country');
      }
      if (!reference.currencies.some(({ code }) => code === input.currency)) {
        throw new RegistrationError('unsupported_currency');
      }
      const expectedPrefix = reference.countries.find(({ code }) => code === input.country)?.callingCode;
      if (!expectedPrefix || expectedPrefix !== input.phonePrefix) {
        throw new RegistrationError('invalid_phone_prefix');
      }

      try {
        await platform.register({
          email: input.email,
          password: input.password,
          country: input.country,
          currency: input.currency,
          first_name: input.firstName,
          last_name: input.lastName,
          date_of_birth: input.dateOfBirth,
          address: input.address,
          city: input.city,
          postal_code: input.postalCode,
          phone_prefix: input.phonePrefix,
          phone: input.phone,
        });
        return { status: 'created' };
      } catch (error) {
        throw mapRegistrationFailure(error);
      }
    },
  };
}

function callingCode(code: string): string | null {
  try {
    return getCountryCallingCode(code as CountryCode);
  } catch {
    return null;
  }
}

function chooseDefault(values: string[], configured?: string): string | null {
  if (configured && values.includes(configured)) return configured;
  for (const preferred of ['GB', 'DE', 'SE', 'MT', 'EUR', 'USD']) {
    if (values.includes(preferred)) return preferred;
  }
  return values[0] ?? null;
}

function mapRegistrationFailure(error: unknown): RegistrationError {
  if (error instanceof PlatformClientError) {
    if (
      error.status === 409 &&
      ['player_already_exists', 'player_username_already_exists'].includes(error.platformCode ?? '')
    ) {
      return new RegistrationError('email_already_registered');
    }
    if (error.platformCode === 'invalid_player_country') {
      return new RegistrationError('unsupported_country');
    }
    if (error.status === 422) return new RegistrationError('invalid_registration');
  }
  return new RegistrationError('registration_unavailable');
}
