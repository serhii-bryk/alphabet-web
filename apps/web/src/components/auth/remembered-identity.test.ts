/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readRememberedIdentity, rememberIdentity } from './remembered-identity';

function storageKeys(): string[] {
  return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? '');
}

beforeEach(() => {
  localStorage.clear();
});

describe('remembered identity', () => {
  it('stores email and country and leaves every other key untouched', () => {
    rememberIdentity({ email: ' Ada@Arcade.test ', country: 'gb' });

    expect(localStorage.getItem('alphabet:last-email')).toBe('Ada@Arcade.test');
    expect(localStorage.getItem('alphabet:last-country')).toBe('GB');
    expect(storageKeys().sort()).toEqual(['alphabet:last-country', 'alphabet:last-email']);
    expect(storageKeys().join(' ')).not.toMatch(/password/i);
    expect(readRememberedIdentity()).toEqual({ email: 'Ada@Arcade.test', country: 'GB' });
  });

  it('ignores blank, invalid, and oversized values', () => {
    rememberIdentity({ email: 'not-an-email', country: 'Germany' });
    rememberIdentity({ email: `${'a'.repeat(252)}@x.co`, country: '' });

    expect(readRememberedIdentity()).toEqual({ email: '', country: '' });
    expect(localStorage.length).toBe(0);
  });
});
