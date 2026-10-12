import type { RegistrationInput } from '@brand/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  register,
  RegistrationRequestError,
  validateRegistrationStep,
} from './registration-browser';

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

afterEach(() => vi.unstubAllGlobals());

describe('registration browser contract', () => {
  it('validates account and profile steps independently', () => {
    expect(validateRegistrationStep(input, 1)).toEqual({});
    expect(validateRegistrationStep(input, 2)).toEqual({});
    expect(
      validateRegistrationStep(
        { ...input, email: 'bad', password: 'short', phonePrefix: '49' },
        1,
      ),
    ).toEqual({
      email: 'Enter a valid email address.',
      password: 'Use at least 8 characters.',
    });
    expect(validateRegistrationStep({ ...input, phonePrefix: '49' }, 2)).toMatchObject({
      phonePrefix: 'Choose the calling code for your country.',
    });
  });

  it('posts registration once and parses the created session', async () => {
    const session = {
      authenticated: true,
      playerId: '42',
      email: input.email,
      currency: 'EUR',
      expiresAt: '2026-10-08T12:00:00.000Z',
    };
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        { status: 'created', session, access_token: 'hidden-token' },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetcher);

    const result = await register(input);
    expect(result).toEqual({ status: 'created', session });
    expect(JSON.stringify(result)).not.toContain('hidden-token');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(input);
  });

  it('maps duplicate email by stable code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'email_already_registered', message: 'hidden' } },
          { status: 409 },
        ),
      ),
    );
    const error = await register(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RegistrationRequestError);
    expect(error).toMatchObject({ code: 'email_already_registered' });
  });

  it('rejects a created response that is missing a session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: 'created' }, { status: 201 })),
    );
    const error = await register(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RegistrationRequestError);
    expect(error).toMatchObject({ code: 'registration_unavailable' });
  });
});
