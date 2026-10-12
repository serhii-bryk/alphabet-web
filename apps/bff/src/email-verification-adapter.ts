import type {
  EmailVerificationGateway,
  ResendVerificationResult,
  VerifyTokenResult,
} from '@brand/domain';
import { z } from 'zod';

const verificationConfigSchema = z.object({
  NEXUS_VERIFICATION_API_URL: z.url(),
});

const verifyResponseSchema = z.object({
  customerId: z.union([z.string(), z.number()]).optional(),
  userId: z.union([z.string(), z.number()]).optional(),
});

const resendResponseSchema = z.object({
  message: z.string().optional(),
});

const errorResponseSchema = z.object({
  error: z.string().optional(),
  errorType: z.string().optional(),
});

export function createEmailVerificationGateway(options: {
  env: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
}): EmailVerificationGateway {
  const fetcher = options.fetch ?? globalThis.fetch;

  function baseUrl(): string | null {
    const result = verificationConfigSchema.safeParse(options.env);
    return result.success ? result.data.NEXUS_VERIFICATION_API_URL.replace(/\/+$/, '') : null;
  }

  return {
    async verifyToken(token): Promise<VerifyTokenResult> {
      const base = baseUrl();
      if (!base) return { status: 'unavailable' };
      try {
        const response = await fetcher(
          `${base}/api/accounts/validate/${encodeURIComponent(token)}`,
          {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(10_000),
          },
        );
        const body = await readJson(response);
        if (response.ok) {
          const parsed = verifyResponseSchema.safeParse(body);
          const playerId = parsed.success ? (parsed.data.customerId ?? parsed.data.userId) : undefined;
          return playerId !== undefined
            ? { status: 'valid', playerId: String(playerId) }
            : { status: 'unavailable' };
        }
        return classifyVerificationFailure(body);
      } catch {
        return { status: 'unavailable' };
      }
    },
    async resend(input): Promise<ResendVerificationResult> {
      const base = baseUrl();
      if (!base) return { status: 'unavailable' };
      try {
        const response = await fetcher(`${base}/api/accounts/resend-email`, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({
            emailverificationurl: input.verificationUrl,
            ...(input.email ? { email: input.email } : { token: input.token }),
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const body = await readJson(response);
        if (response.ok && resendResponseSchema.safeParse(body).success) return { status: 'sent' };
        return classifyResendFailure(body, response.status);
      } catch {
        return { status: 'unavailable' };
      }
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function classifyVerificationFailure(body: unknown): VerifyTokenResult {
  const message = errorResponseSchema.safeParse(body);
  const normalized = message.success ? message.data.error?.toLowerCase() : '';
  if (normalized?.includes('expired')) return { status: 'expired' };
  if (normalized?.includes('invalid') || normalized?.includes('not found')) {
    return { status: 'invalid' };
  }
  return { status: 'unavailable' };
}

function classifyResendFailure(body: unknown, status: number): ResendVerificationResult {
  const parsed = errorResponseSchema.safeParse(body);
  const text = parsed.success
    ? `${parsed.data.errorType ?? ''} ${parsed.data.error ?? ''}`.toLowerCase()
    : '';
  if (status === 429 || text.includes('thrott') || text.includes('too many')) {
    return { status: 'throttled' };
  }
  if (text.includes('already') && text.includes('valid')) return { status: 'already_verified' };
  if (text.includes('invalid') || text.includes('not found')) return { status: 'invalid' };
  return { status: 'unavailable' };
}
