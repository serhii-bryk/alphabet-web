const EMAIL_KEY = 'alphabet:last-email';
const COUNTRY_KEY = 'alphabet:last-country';

export interface RememberedIdentity {
  email: string;
  country: string;
}

const emptyIdentity: RememberedIdentity = { email: '', country: '' };

function rememberedEmail(value: string): string {
  const email = value.trim();
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function rememberedCountry(value: string): string {
  const country = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : '';
}

export function readRememberedIdentity(): RememberedIdentity {
  if (typeof window === 'undefined') return emptyIdentity;
  try {
    return {
      email: rememberedEmail(window.localStorage.getItem(EMAIL_KEY) ?? ''),
      country: rememberedCountry(window.localStorage.getItem(COUNTRY_KEY) ?? ''),
    };
  } catch {
    return emptyIdentity;
  }
}

/** Stores the last email and country only. Passwords are never accepted or written. */
export function rememberIdentity(identity: { email?: string; country?: string }) {
  if (typeof window === 'undefined') return;
  try {
    if (identity.email !== undefined) {
      const email = rememberedEmail(identity.email);
      if (email) window.localStorage.setItem(EMAIL_KEY, email);
    }
    if (identity.country !== undefined) {
      const country = rememberedCountry(identity.country);
      if (country) window.localStorage.setItem(COUNTRY_KEY, country);
    }
  } catch {
    // Private browsing can reject storage. Sign-in still succeeds.
  }
}
