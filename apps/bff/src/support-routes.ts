import { randomBytes } from 'node:crypto';
import type { SupportCatalogGame, SupportChannelsResponse, SupportChatResponse } from '@brand/contracts';
import { AccountError, type AccountUseCases } from '@brand/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { resolvePlayerSession, type AuthRouteDependencies } from './auth-routes.js';
import { cookieIsSecure, firstForwardedIp, mutationOriginAllowed, readCookie } from './session-cookie.js';
import { answerSupportChat } from './support/answer.js';
import { AiBudgetError, type AiBudgetStore, type BudgetKey } from './support/budget.js';
import { balanceReply, decideSupportTurn, searchReply } from './support/faq.js';
import type { AiChatLimits } from './support/limits.js';
import { SupportAiError, type SupportAiProvider } from './support/provider.js';
import { supportActionSchema, supportChatRequestSchema } from './support/schema.js';

const scopeCookie = 'ab_ai_scope';
const scopePattern = /^[a-f0-9]{32}$/;

const channelsResponseSchema = z.strictObject({
  available: z.boolean(),
  channels: z
    .array(
      z.strictObject({
        id: z.enum(['email', 'telegram', 'whatsapp', 'helpdesk']),
        kind: z.enum(['email', 'link']),
        value: z.string().min(1).max(300),
      }),
    )
    .max(4),
});

const chatResponseSchema = z.strictObject({
  message: z.string().min(1).max(2000),
  actions: z.array(supportActionSchema).max(8),
  confidence: z.enum(['known', 'general', 'unknown']),
  escalate: z.boolean(),
  source: z.enum(['faq', 'rules', 'assistant', 'model']),
  autoRun: z.boolean(),
  games: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[1-9]\d{0,11}$/),
        slug: z.string().min(1).max(200),
        title: z.string().min(1).max(120),
        kind: z.enum(['casino', 'live']),
        imageUrl: z.string().max(500).nullable(),
        demoPlayEnabled: z.boolean(),
        active: z.boolean(),
      }),
    )
    .max(8)
    .optional(),
  related: z
    .array(
      z.enum([
        'registration',
        'verification',
        'deposits',
        'withdrawals',
        'wallet',
        'casino',
        'sports',
        'promotions',
        'favorites',
        'account',
        'responsible',
        'contact',
      ]),
    )
    .max(3)
    .optional(),
});

const messages = {
  invalid_support_request: 'Support chat could not read that message.',
  ai_unavailable: 'Support chat is unavailable right now.',
  ai_timeout: 'Support chat took too long to respond.',
  ai_response_invalid: 'Support chat could not use that response.',
  support_unavailable: 'Support chat is unavailable right now.',
  rate_limited: 'The assistant has reached its limit for now.',
  budget_exhausted: 'The assistant is paused to stay within its limit.',
} as const;

export interface SupportRouteDependencies extends AuthRouteDependencies {
  ai: SupportAiProvider | null;
  modelEnabled: boolean;
  limits: AiChatLimits;
  budget: AiBudgetStore;
  channels: SupportChannelsResponse;
  testDepositAvailable: boolean;
  secrets: string[];
  searchGames: (query: string) => Promise<SupportCatalogGame[]>;
  getAccount: () => AccountUseCases;
}

export function isSupportPath(path: string): boolean {
  const pathname = path.split('?')[0] ?? path;
  return /^\/(?:api\/)?support(?:\/|$)/.test(pathname);
}

export function registerSupportRoutes(app: Hono, dependencies: SupportRouteDependencies) {
  const routes = new Hono();
  const secure = cookieIsSecure(dependencies.webOrigin);

  routes.get('/channels', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(channelsResponseSchema.parse(dependencies.channels));
  });

  routes.post('/chat', async (c) => {
    c.header('Cache-Control', 'no-store');
    const scope = readOrCreateScope(c.req.header('cookie'));
    const finish = (body: unknown, status: 200 | 400 | 403 | 429 | 502 | 503 | 504 = 200) => {
      const response = c.json(body, status);
      response.headers.append('Set-Cookie', scopeCookieHeader(scope.id, secure));
      response.headers.append('Cache-Control', 'no-store');
      return response;
    };
    if (!mutationOriginAllowed(c.req.header('origin'), dependencies.webOrigin)) {
      return finish(errorBody('support_unavailable'), 403);
    }
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return finish(errorBody('invalid_support_request'), 400);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return finish(errorBody('invalid_support_request'), 400);
    }
    const request = supportChatRequestSchema.safeParse(body);
    const latest = request.success ? request.data.messages[request.data.messages.length - 1] : undefined;
    if (!request.success || latest?.role !== 'user') return finish(errorBody('invalid_support_request'), 400);
    if (latest.content.length > dependencies.limits.maxMessageChars) {
      return finish(errorBody('invalid_support_request'), 400);
    }

    const decision = decideSupportTurn({
      mode: request.data.mode ?? 'support',
      faqId: request.data.faqId,
      text: latest.content,
      locale: request.data.context.locale,
      testDepositAvailable: dependencies.testDepositAvailable,
      gameTitle: request.data.context.gameTitle,
      authenticated: request.data.context.authenticated,
      history: request.data.messages,
    });
    if (decision.kind === 'reply') return finish(chatResponseSchema.parse(decision.response));
    if (decision.kind === 'search') {
      try {
        const games = await dependencies.searchGames(decision.query);
        return finish(chatResponseSchema.parse(searchReply(request.data.context.locale, decision.query, games, 'assistant')));
      } catch {
        const unavailable =
          request.data.context.locale === 'ar'
            ? 'تعذر البحث في الكتالوج الآن. لم أخترع نتائج.'
            : 'Catalog search is unavailable right now. I did not invent results.';
        return finish(
          chatResponseSchema.parse({
            message: unavailable,
            actions: [],
            confidence: 'unknown',
            escalate: false,
            source: 'rules',
            autoRun: false,
          }),
        );
      }
    }
    if (decision.kind === 'balance') {
      return finish(chatResponseSchema.parse(await readOwnBalance(c, dependencies, request.data.context.locale)));
    }
    if (!dependencies.modelEnabled || !dependencies.ai) return finish(errorBody('ai_unavailable'), 503);

    const playerId = await playerIdForLimit(c, dependencies);
    const ip = clientIp(c.req.header('x-forwarded-for'), c.req.header('x-real-ip'));
    const keys = budgetKeys(playerId, scope.id, ip);
    let reservation: Awaited<ReturnType<AiBudgetStore['reserve']>>;
    try {
      reservation = await dependencies.budget.reserve({ keys, now: dependencies.now() });
    } catch (error) {
      if (error instanceof AiBudgetError) return finish(errorBody('ai_unavailable'), 503);
      return finish(errorBody('ai_unavailable'), 503);
    }
    if (!reservation.ok) return finish(errorBody(reservation.reason), 429);

    try {
      const answered = await answerSupportChat({
        provider: dependencies.ai,
        messages: request.data.messages,
        context: request.data.context,
        mode: request.data.mode ?? 'support',
        limits: dependencies.limits,
        testDepositAvailable: dependencies.testDepositAvailable,
        secrets: dependencies.secrets,
        searchGames: dependencies.searchGames,
      });
      await reconcile(dependencies, reservation.id, answered.inputTokens, answered.outputTokens);
      return finish(chatResponseSchema.parse(answered.response));
    } catch (error) {
      await reconcile(dependencies, reservation.id);
      if (error instanceof SupportAiError) return finish(errorBody(error.code), error.status);
      return finish(errorBody('support_unavailable'), 502);
    }
  });

  app.route('/support', routes);
  app.route('/api/support', routes);
}

export function supportSecretValues(env: Record<string, string | undefined>): string[] {
  const names = [
    'OPENAI_API_KEY',
    'SUPPORT_AI_API_KEY',
    'FINAL_PLATFORM_API_KEY',
    'FINAL_PLATFORM_API_SECRET',
    'FINALPAY_SECRET',
    'SESSION_SECRET',
  ];
  return names.flatMap((name) => {
    const value = env[name]?.trim();
    return value && value.length >= 8 ? [value] : [];
  });
}

function budgetKeys(playerId: string | undefined, scopeId: string, ip: string): BudgetKey[] {
  const keys: BudgetKey[] = [{ id: playerId ? `player:${playerId}` : `scope:${scopeId}`, kind: 'session' }];
  if (playerId) keys.push({ id: `player:${playerId}`, kind: 'hour' });
  keys.push({ id: `ip:${ip}`, kind: 'hour' });
  return keys;
}

async function playerIdForLimit(c: Parameters<typeof resolvePlayerSession>[0], dependencies: SupportRouteDependencies) {
  try {
    const resolved = await resolvePlayerSession(c, dependencies, dependencies.inflight ?? new Map());
    if (resolved.status === 'ready') return resolved.session.playerId;
  } catch {
    return undefined;
  }
  return undefined;
}

async function readOwnBalance(
  c: Parameters<typeof resolvePlayerSession>[0],
  dependencies: SupportRouteDependencies,
  locale: 'en' | 'ar',
): Promise<SupportChatResponse> {
  let resolved: Awaited<ReturnType<typeof resolvePlayerSession>>;
  try {
    resolved = await resolvePlayerSession(c, dependencies, dependencies.inflight ?? new Map());
  } catch {
    return balanceReply(locale, 'unavailable');
  }
  if (resolved.status !== 'ready') return balanceReply(locale, 'guest');
  try {
    const balance = await dependencies.getAccount().getBalance(resolved.session);
    if (String(balance.currency).length > 8) return balanceReply(locale, 'unavailable');
    return balanceReply(locale, balance);
  } catch (error) {
    if (error instanceof AccountError) return balanceReply(locale, 'unavailable');
    return balanceReply(locale, 'unavailable');
  }
}

async function reconcile(
  dependencies: SupportRouteDependencies,
  id: string,
  inputTokens?: number,
  outputTokens?: number,
) {
  try {
    await dependencies.budget.reconcile({ id, inputTokens, outputTokens, now: dependencies.now() });
  } catch {
    // The reservation stays until it expires, and then counts as spent.
  }
}

function readOrCreateScope(cookieHeader: string | undefined): { id: string } {
  const existing = readCookie(cookieHeader, scopeCookie);
  if (existing && scopePattern.test(existing)) return { id: existing };
  return { id: randomBytes(16).toString('hex') };
}

function scopeCookieHeader(id: string, secure: boolean): string {
  const parts = [`${scopeCookie}=${id}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=2592000'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clientIp(forwarded: string | undefined, real: string | undefined): string {
  return firstForwardedIp(forwarded) ?? firstForwardedIp(real) ?? 'local';
}

function errorBody(code: keyof typeof messages) {
  return { error: { code, message: messages[code] } };
}
