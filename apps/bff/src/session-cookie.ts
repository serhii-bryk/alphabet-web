import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import type { PlayerSession } from '@brand/domain';
import { z } from 'zod';

const cookieName = 'brand_session';
const ivBytes = 12;
const tagBytes = 16;

const sessionPayloadSchema = z.object({
  accessToken: z.string().min(1),
  playerId: z.string().regex(/^[1-9]\d*$/),
  email: z.string().min(1),
  currency: z.string().min(1).nullable(),
  expiresAt: z.iso.datetime(),
});

export function readSessionSecret(env: Record<string, string | undefined>): string | undefined {
  const secret = env.SESSION_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) return undefined;
  return secret;
}

export function cookieIsSecure(webOrigin: string | undefined): boolean {
  return typeof webOrigin === 'string' && webOrigin.startsWith('https://');
}

export function firstForwardedIp(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(',')) {
    const candidate = part.trim();
    if (isIP(candidate) !== 0) return candidate;
  }
  return undefined;
}

export function loginBrowser(userAgent: string | undefined): string | undefined {
  if (!userAgent) return undefined;
  return userAgent.slice(0, 255);
}

export function loginDomain(webOrigin: string | undefined): string | undefined {
  if (!webOrigin) return undefined;
  try {
    const url = new URL(webOrigin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.origin.length === 0 || url.origin.length > 255) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function readCookie(header: string | undefined, name = cookieName): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return undefined;
}

export function sessionMaxAgeSeconds(expiresAt: string, now: number): number {
  const remainingMs = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remainingMs)) return 1;
  return Math.max(1, Math.floor(remainingMs / 1000));
}

export function sealSession(session: PlayerSession, secret: string): string {
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const plaintext = JSON.stringify({
    accessToken: session.accessToken,
    playerId: session.playerId,
    email: session.email,
    currency: session.currency,
    expiresAt: session.expiresAt,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

export function openSession(value: string, secret: string): PlayerSession | undefined {
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
    const parsed = sessionPayloadSchema.safeParse(json);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// Classic cross-site form POST does not send a SameSite=Lax cookie and cannot
// set Content-Type: application/json, so a separate CSRF token is not used.
// Mutations still reject a present Origin that is not WEB_ORIGIN and leave the
// session unchanged. Requests without Origin are allowed.
export function mutationOriginAllowed(
  origin: string | undefined,
  webOrigin: string | undefined,
): boolean {
  if (origin === undefined) return true;
  return webOrigin !== undefined && origin === webOrigin;
}

export function sessionCookieHeader(value: string, maxAgeSeconds: number, secure: boolean): string {
  return cookieHeader(`${cookieName}=${value}`, Math.max(1, Math.trunc(maxAgeSeconds)), secure);
}

export function clearSessionCookieHeader(secure: boolean): string {
  return cookieHeader(`${cookieName}=`, 0, secure);
}

function cookieHeader(assignment: string, maxAgeSeconds: number, secure: boolean): string {
  const parts = [assignment, `Max-Age=${maxAgeSeconds}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function encryptionKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}
