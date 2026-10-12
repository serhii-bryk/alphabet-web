import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { RegistrationInput, RegistrationOptions } from '@brand/contracts';
import messages from '../../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/casino',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));

import { RegistrationDialog, applyRegistrationOptions } from './registration-dialog';

const options: RegistrationOptions = {
  countries: [
    { code: 'GB', name: 'United Kingdom', callingCode: '44' },
    { code: 'DE', name: 'Germany', callingCode: '49' },
  ],
  currencies: [
    { code: 'GBP', name: 'Pound', symbol: '£' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
  ],
  defaults: { country: 'DE', currency: 'EUR' },
};

const empty: RegistrationInput = {
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

describe('registration prefill', () => {
  it('seeds step 1 from the hero without skipping ahead', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={new QueryClient()}>
        <RegistrationDialog
          open
          initial={{ email: 'ada@arcade.test', password: 'password-1', country: 'GB' }}
          onClose={() => undefined}
          onSignIn={() => undefined}
        />
      </QueryClientProvider>
      </NextIntlClientProvider>,
    );

    expect(html).toContain('value="ada@arcade.test"');
    expect(html).toContain('value="password-1"');
    expect(html).toContain('value="GB"');
    expect(html).toContain('1/2');
    expect(html).toContain('>Continue<');
    expect(html).not.toContain('>Create account<');
  });

  it('keeps a prefilled email, password, and country when defaults arrive', () => {
    const next = applyRegistrationOptions(
      { ...empty, email: 'ada@arcade.test', password: 'password-1', country: 'GB', currency: 'GBP' },
      options,
    );

    expect(next.email).toBe('ada@arcade.test');
    expect(next.password).toBe('password-1');
    expect(next.country).toBe('GB');
    expect(next.currency).toBe('GBP');
    expect(next.phonePrefix).toBe('44');
  });

  it('still applies defaults when the hero did not prefill them', () => {
    const next = applyRegistrationOptions(empty, options);

    expect(next.country).toBe('DE');
    expect(next.currency).toBe('EUR');
    expect(next.phonePrefix).toBe('49');
    expect(next.email).toBe('');
    expect(next.password).toBe('');
  });
});
