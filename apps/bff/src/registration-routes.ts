import { createHash } from 'node:crypto';
import type { RegistrationErrorCode, RegistrationInput } from '@brand/contracts';
import {
  RegistrationError,
  toAuthSession,
  type AuthUseCases,
  type PlayerSession,
  type RegistrationUseCases,
} from '@brand/domain';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  cookieIsSecure,
  firstForwardedIp,
  loginBrowser,
  loginDomain,
  mutationOriginAllowed,
  sealSession,
  sessionCookieHeader,
  sessionMaxAgeSeconds,
} from './session-cookie.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const registrationBodySchema = z.object({
  email: z.string().trim().toLowerCase().max(255).pipe(z.email()),
  password: z.string().min(8).max(255),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  firstName: text(255),
  lastName: text(255),
  dateOfBirth: z.iso.date().refine(isAdult, 'You must be at least 18 years old'),
  address: text(255),
  city: text(20),
  postalCode: text(10),
  phonePrefix: z
    .string()
    .trim()
    .transform((value) => value.replace(/^\+/, ''))
    .pipe(z.string().regex(/^\d{1,5}$/)),
  phone: z.string().trim().regex(/^\d{4,13}$/),
});

const registrationMessages: Record<RegistrationErrorCode, string> = {
  invalid_registration: 'Check the highlighted details and try again.',
  email_already_registered: 'An account with this email already exists. Try signing in instead.',
  unsupported_country: 'Registration is not available for the selected country.',
  unsupported_currency: 'The selected currency is not available.',
  invalid_phone_prefix: 'Choose the calling code for your selected country.',
  weak_password: 'Use a password with at least 8 characters.',
  registration_unavailable: 'Registration is temporarily unavailable. Please try again.',
  sign_in_unavailable: 'Your account was created, but we could not sign you in. Please sign in.',
};

export interface RegistrationRouteDependencies {
  getRegistration: () => RegistrationUseCases;
  getAuth: () => AuthUseCases;
  secret: string | undefined;
  webOrigin: string | undefined;
  now: () => number;
}

type RegistrationAttempt =
  | { ok: true; session: PlayerSession }
  | { ok: false; code: RegistrationErrorCode };

export function registerRegistrationRoutes(
  app: Hono,
  dependencies: RegistrationRouteDependencies,
): void {
  const inflight = new Map<string, Promise<RegistrationAttempt>>();
  const secure = cookieIsSecure(dependencies.webOrigin);

  const options = async (c: Context) => {
    c.header('Cache-Control', 'private, max-age=300');
    try {
      return c.json(await dependencies.getRegistration().options());
    } catch {
      return registrationFailure(c, 'registration_unavailable');
    }
  };

  const register = async (c: Context) => {
    c.header('Cache-Control', 'no-store');
    if (!mutationAllowed(c, dependencies)) {
      const json = c.req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
      logRegistrationDiagnostic({
        status: null,
        code: null,
        classification: json ? 'origin_rejected' : 'invalid_content_type',
        contentType: null,
      });
      return registrationFailure(c, 'registration_unavailable', 403);
    }
    const payload = await parseJson(c);
    const parsed = registrationBodySchema.safeParse(payload);
    if (!parsed.success) {
      const weakPassword = parsed.error.issues.some((issue) => issue.path[0] === 'password');
      return registrationFailure(c, weakPassword ? 'weak_password' : 'invalid_registration');
    }
    const input: RegistrationInput = parsed.data;
    const key = createHash('sha256').update(input.email).digest('hex');
    const existing = inflight.get(key);
    if (existing) return createdResponse(c, dependencies, secure, await existing);

    const request = registerAndSignIn(c, dependencies, input);
    inflight.set(key, request);
    try {
      return createdResponse(c, dependencies, secure, await request);
    } finally {
      inflight.delete(key);
    }
  };

  for (const prefix of ['/registration', '/api/registration']) {
    app.get(`${prefix}/options`, options);
    app.post(prefix, register);
  }
}

export function isRegistrationPath(path: string): boolean {
  return path.startsWith('/registration') || path.startsWith('/api/registration');
}

async function registerAndSignIn(
  c: Context,
  dependencies: RegistrationRouteDependencies,
  input: RegistrationInput,
): Promise<RegistrationAttempt> {
  try {
    await dependencies.getRegistration().register(input);
  } catch (error) {
    return {
      ok: false,
      code: error instanceof RegistrationError ? error.code : 'registration_unavailable',
    };
  }

  if (!dependencies.secret) return { ok: false, code: 'sign_in_unavailable' };

  try {
    const session = await dependencies.getAuth().login({
      email: input.email,
      password: input.password,
      ipNumber: firstForwardedIp(c.req.header('x-forwarded-for')),
      browser: loginBrowser(c.req.header('user-agent')),
      domain: loginDomain(dependencies.webOrigin),
    });
    return { ok: true, session };
  } catch {
    return { ok: false, code: 'sign_in_unavailable' };
  }
}

function createdResponse(
  c: Context,
  dependencies: RegistrationRouteDependencies,
  secure: boolean,
  result: RegistrationAttempt,
): Response {
  if (!result.ok || !dependencies.secret) {
    return registrationFailure(c, result.ok ? 'sign_in_unavailable' : result.code);
  }
  c.header(
    'Set-Cookie',
    sessionCookieHeader(
      sealSession(result.session, dependencies.secret),
      sessionMaxAgeSeconds(result.session.expiresAt, dependencies.now()),
      secure,
    ),
  );
  return c.json({ status: 'created' as const, session: toAuthSession(result.session) }, 201);
}

function mutationAllowed(c: Context, dependencies: RegistrationRouteDependencies): boolean {
  return (
    c.req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json' &&
    mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin)
  );
}

async function parseJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function registrationFailure(
  c: Context,
  code: RegistrationErrorCode,
  status?: 400 | 403 | 409 | 502,
): Response {
  const resolvedStatus =
    status ??
    (code === 'email_already_registered'
      ? 409
      : code === 'registration_unavailable' || code === 'sign_in_unavailable'
        ? 502
        : 400);
  return c.json({ error: { code, message: registrationMessages[code] } }, resolvedStatus);
}

function logRegistrationDiagnostic(diagnostic: {
  status: number | null;
  code: string | null;
  classification: string;
  contentType: string | null;
}): void {
  console.error(
    JSON.stringify({
      event: 'registration_failure',
      status: diagnostic.status,
      code: diagnostic.code,
      classification: diagnostic.classification,
      contentType: diagnostic.contentType,
    }),
  );
}

function isAdult(value: string): boolean {
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  const cutoff = new Date(
    Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()),
  );
  return birth <= cutoff;
}
