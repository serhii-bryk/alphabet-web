import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  completeOnboarding,
  externalFieldOrder,
  fetchExternalAuthMethods,
  finishExternalAuth,
  isRedirectUrl,
  startExternalAuth,
  validateOnboardingValues,
  withGooglePhone,
  ExternalAuthRequestError,
} from './external-auth-browser';

const session = {
  authenticated: true,
  playerId: '42',
  email: 'ada@example.com',
  currency: 'EUR',
  expiresAt: '2026-10-08T18:00:00.000Z',
};

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const fetcher = vi.fn(handler);
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('external auth browser', () => {
  it('shows only redirect methods returned by the BFF', async () => {
    stubFetch(async () =>
      Response.json({
        methods: [
          { code: 'telegram', name: 'Telegram', type: 'redirect' },
          { code: 'phone', name: 'Phone', type: 'otp' },
        ],
      }),
    );
    await expect(fetchExternalAuthMethods()).resolves.toEqual([
      { code: 'telegram', name: 'Telegram', type: 'redirect' },
    ]);
  });

  it('starts a redirect and refuses a non-https provider URL', async () => {
    const fetcher = stubFetch(async () =>
      Response.json({ redirectUrl: 'https://oauth.telegram.org/auth', authenticationId: 'AUTH_hidden' }),
    );
    await expect(startExternalAuth('telegram', '/account')).resolves.toBe('https://oauth.telegram.org/auth');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      method: 'telegram',
      next: '/account',
    });
    stubFetch(async () => Response.json({ redirectUrl: 'http://evil.example/auth' }));
    await expect(startExternalAuth('telegram', '/casino')).rejects.toBeInstanceOf(ExternalAuthRequestError);
  });

  it('reads an onboarding result without treating a token as a session', async () => {
    stubFetch(async () =>
      Response.json({
        status: 'onboarding_required',
        requiredFields: ['email'],
        prefill: { first_name: 'Ada' },
        expiresAt: '2026-10-16T12:00:00.000Z',
        next: '/casino',
        onboarding_token: 'OB_hidden',
      }),
    );
    const result = await finishExternalAuth({ ticket: 'LT_ticket', clientState: 'a'.repeat(32) });
    expect(result).toEqual({
      status: 'onboarding_required',
      requiredFields: ['email'],
      prefill: { first_name: 'Ada' },
      expiresAt: '2026-10-16T12:00:00.000Z',
      next: '/casino',
    });
    stubFetch(async () => Response.json({ ...session, accessToken: 'secret', next: '/account' }));
    await expect(finishExternalAuth({ ticket: 'LT_ticket', clientState: 'a'.repeat(32) })).resolves.toEqual({
      status: 'authenticated',
      session,
      next: '/account',
    });
  });

  it('submits onboarding values and keeps field names from a validation error', async () => {
    const fetcher = stubFetch(async () => Response.json({ ...session, next: '/casino' }));
    await expect(completeOnboarding({ email: 'ada@example.com', first_name: 'Ada' })).resolves.toMatchObject({
      session,
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      values: { email: 'ada@example.com', first_name: 'Ada' },
    });
    stubFetch(async () =>
      Response.json({ error: { code: 'invalid_onboarding', message: 'Check' }, fields: ['email'] }, { status: 422 }),
    );
    const error = await completeOnboarding({ email: 'nope' }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'invalid_onboarding', fields: ['email'] });
  });

  it('orders required and prefilled fields and validates only those', () => {
    expect(externalFieldOrder(['email', 'country'], { first_name: 'Ada', last_name: 'Lovelace' })).toEqual([
      'email',
      'first_name',
      'last_name',
      'country',
    ]);
    expect(
      validateOnboardingValues(['email', 'first_name'], ['email'], { email: 'ada@example.com', first_name: 'Ada' }),
    ).toEqual({});
    expect(validateOnboardingValues(['email'], ['email'], { email: '' })).toMatchObject({
      email: 'Enter a valid email address.',
    });
    expect(isRedirectUrl('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true);
    expect(isRedirectUrl('javascript:alert(1)')).toBe(false);
  });

  it('asks Google onboarding for a phone without dropping prefilled profile fields', () => {
    const required = withGooglePhone('google', ['email', 'country', 'date_of_birth', 'currency']);
    expect(required).toEqual(['email', 'country', 'date_of_birth', 'currency', 'phone_prefix', 'phone']);
    expect(withGooglePhone('telegram', ['email', 'country'])).toEqual(['email', 'country']);
    expect(
      externalFieldOrder(required, { email: 'ada@example.com', first_name: 'Ada', last_name: 'Lovelace' }),
    ).toEqual([
      'email',
      'first_name',
      'last_name',
      'date_of_birth',
      'country',
      'currency',
      'phone_prefix',
      'phone',
    ]);
    expect(
      validateOnboardingValues(required, required, {
        email: 'ada@example.com',
        country: 'GB',
        date_of_birth: '1990-01-02',
        currency: 'EUR',
        first_name: 'Ada',
        phone_prefix: '49',
        phone: '7700900123',
      }),
    ).toMatchObject({ phone_prefix: 'Choose the calling code for your country.' });
    expect(
      validateOnboardingValues(required, required, {
        email: 'ada@example.com',
        country: 'GB',
        date_of_birth: '1990-01-02',
        currency: 'EUR',
        first_name: 'Ada',
        phone_prefix: '44',
        phone: '7700900123',
      }),
    ).toEqual({});
  });
});
