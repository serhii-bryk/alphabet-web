import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

const pendingCookie = 'ab_ext_pending';
const onboardingCookie = 'ab_ext_onboarding';
const ivBytes = 12;
const tagBytes = 16;

const pendingSchema = z.object({
  authenticationId: z.string().min(1).max(128),
  clientState: z.string().min(16).max(512),
  next: z.string().min(1).max(200),
  method: z.string().regex(/^[a-z0-9_-]{1,64}$/),
});

const onboardingSchema = z.object({
  token: z.string().min(1).max(128),
  requiredFields: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)),
  prefill: z.record(z.string(), z.string().max(255)),
  next: z.string().min(1).max(200),
  expiresAt: z.iso.datetime(),
  method: z.string().regex(/^[a-z0-9_-]{1,64}$/).optional(),
});

export type PendingExternalAuth = z.infer<typeof pendingSchema>;
export type PendingOnboarding = z.infer<typeof onboardingSchema>;

export function externalAuthReturnUrl(webOrigin: string | undefined): string | undefined {
  if (!webOrigin) return undefined;
  let url: URL;
  try {
    url = new URL(webOrigin);
  } catch {
    return undefined;
  }
  if (url.username || url.password || url.search || url.hash) return undefined;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return undefined;
  }
  return `${url.origin}/auth/callback`;
}

export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return '/casino';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('..')) {
    return '/casino';
  }
  if (/[\s?#]/.test(value) || !/^\/[A-Za-z0-9._~/-]*$/.test(value)) return '/casino';
  return value;
}

export function sealPendingAuth(value: PendingExternalAuth, secret: string): string {
  return sealJson(pendingSchema.parse(value), secret);
}

export function openPendingAuth(value: string, secret: string): PendingExternalAuth | undefined {
  return openJson(value, secret, pendingSchema);
}

export function sealOnboarding(value: PendingOnboarding, secret: string): string {
  return sealJson(onboardingSchema.parse(value), secret);
}

export function openOnboarding(value: string, secret: string): PendingOnboarding | undefined {
  return openJson(value, secret, onboardingSchema);
}

export function pendingCookieHeader(value: string, maxAgeSeconds: number, secure: boolean): string {
  return cookieHeader(`${pendingCookie}=${value}`, maxAgeSeconds, secure);
}

export function clearPendingCookieHeader(secure: boolean): string {
  return cookieHeader(`${pendingCookie}=`, 0, secure);
}

export function onboardingCookieHeader(value: string, maxAgeSeconds: number, secure: boolean): string {
  return cookieHeader(`${onboardingCookie}=${value}`, maxAgeSeconds, secure);
}

export function clearOnboardingCookieHeader(secure: boolean): string {
  return cookieHeader(`${onboardingCookie}=`, 0, secure);
}

export function readPendingCookie(header: string | undefined): string | undefined {
  return readNamedCookie(header, pendingCookie);
}

export function readOnboardingCookie(header: string | undefined): string | undefined {
  return readNamedCookie(header, onboardingCookie);
}

export function boundedMaxAge(seconds: number, fallback: number, max: number): number {
  if (!Number.isFinite(seconds)) return fallback;
  return Math.min(max, Math.max(60, Math.trunc(seconds)));
}

function sealJson(value: unknown, secret: string): string {
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

function openJson<T>(value: string, secret: string, schema: z.ZodType<T>): T | undefined {
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length <= ivBytes + tagBytes) return undefined;
    const iv = bytes.subarray(0, ivBytes);
    const tag = bytes.subarray(ivBytes, ivBytes + tagBytes);
    const ciphertext = bytes.subarray(ivBytes + tagBytes);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv);
    decipher.setAuthTag(tag);
    const json: unknown = JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'),
    );
    const parsed = schema.safeParse(json);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function readNamedCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return undefined;
}

function cookieHeader(assignment: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [assignment, `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function encryptionKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}
