import type { RegistrationInput } from '@brand/contracts';
import type { PlatformClient } from '@brand/platform';
import { PlatformClientError } from '@brand/platform';
import { describe, expect, it, vi } from 'vitest';
import { createRegistrationUseCases, RegistrationError } from './registration.js';

const input: RegistrationInput = {
  email: 'player@example.com',
  password: 'password-1',
  country: 'GB',
  currency: 'EUR',
  firstName: 'Test',
  lastName: 'Player',
  dateOfBirth: '1990-01-01',
  address: '1 Test Street',
  city: 'London',
  postalCode: 'SW1A 1AA',
  phonePrefix: '44',
  phone: '7700900123',
};

function platform(overrides: Partial<PlatformClient> = {}): PlatformClient {
  return {
    getRegistrationCountries: vi.fn(async () => [
      { id: 1, name: 'United Kingdom', name_common: 'United Kingdom', alpha2: 'GB', alpha3: 'GBR' },
    ]),
    getRegistrationCurrencies: vi.fn(async () => [
      { id: 1, name: 'Euro', code: 'EUR', symbol: '€' },
    ]),
    register: vi.fn(async () => ({
      profile: {
        id: 42,
        email: input.email,
        currency: { id: 1, name: 'Euro', code: 'EUR', symbol: '€' },
      },
    })),
    activateEmail: vi.fn(),
    getGames: vi.fn(),
    getProviders: vi.fn(),
    getCategories: vi.fn(),
    launchDemoGame: vi.fn(),
    launchRealGame: vi.fn(),
    requestSportsLaunchTicket: vi.fn(),
    login: vi.fn(),
    authenticateTelegram: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getProfile: vi.fn(),
    getBalance: vi.fn(),
    deposit: vi.fn(),
    requestWithdrawal: vi.fn(),
    approveWithdrawal: vi.fn(),
    confirmWithdrawal: vi.fn(),
    rollbackWithdrawal: vi.fn(),
    listFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    lastPlayed: vi.fn(),
    mostPlayed: vi.fn(),
    getRealityCheckSettings: vi.fn(),
    getPlayerRealityCheck: vi.fn(),
    setPlayerRealityCheck: vi.fn(),
    getCoolOffSettings: vi.fn(),
    getSelfExclusionSettings: vi.fn(),
    excludePlayer: vi.fn(),
    getPlayerLogins: vi.fn(),
    ...overrides,
  };
}

describe('registration use cases', () => {
  it('maps options and submits exactly the Platform registration contract', async () => {
    const client = platform();
    const useCases = createRegistrationUseCases(client);

    expect(await useCases.options()).toEqual({
      countries: [{ code: 'GB', name: 'United Kingdom', callingCode: '44' }],
      currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }],
      defaults: { country: 'GB', currency: 'EUR' },
    });
    await expect(useCases.register(input)).resolves.toEqual({ status: 'created' });
    expect(client.register).toHaveBeenCalledWith({
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
    expect(client.activateEmail).not.toHaveBeenCalled();
    expect(client.login).not.toHaveBeenCalled();
  });

  it('rejects a phone prefix that does not belong to the country', async () => {
    const client = platform();
    const error = await createRegistrationUseCases(client)
      .register({ ...input, phonePrefix: '49' })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'invalid_phone_prefix' });
    expect(client.register).not.toHaveBeenCalled();
  });

  it('maps an existing player conflict', async () => {
    const error = await createRegistrationUseCases(
      platform({
        register: vi.fn(async () => {
          throw new PlatformClientError('request_failed', 409, 'player_already_exists');
        }),
      }),
    )
      .register(input)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RegistrationError);
    expect(error).toMatchObject({ code: 'email_already_registered' });
  });
});
