import {
  supportNavigateTargets,
  type SupportAction,
  type SupportChatContext,
  type SupportChatResponse,
  type SupportChatTurn,
} from '@brand/contracts';
import { z } from 'zod';

const searchSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.includes('//') && !value.includes('\\'));

export const supportActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('navigate'),
    target: z.enum(supportNavigateTargets),
    search: searchSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('open_cashier'),
    mode: z.enum(['deposit', 'withdraw']),
  }),
  z.strictObject({ type: z.literal('open_login') }),
  z.strictObject({ type: z.literal('open_registration') }),
  z.strictObject({ type: z.literal('open_human_support') }),
]);

const turnSchema = z.strictObject({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(1000),
});

export const supportContextSchema = z.strictObject({
  locale: z.enum(['en', 'ar']),
  route: z.string().trim().regex(/^\/[A-Za-z0-9/_-]*$/).max(200),
  authenticated: z.boolean(),
  section: z.enum([
    'casino',
    'live_casino',
    'sports',
    'account',
    'promotions',
    'search',
    'responsible_gaming',
    'support',
    'other',
  ]),
  gameOpen: z.boolean(),
  gameTitle: z.string().trim().min(1).max(120).optional(),
});

export const supportChatRequestSchema = z.strictObject({
  messages: z.array(turnSchema).min(1).max(12),
  context: supportContextSchema,
});

export const supportReplySchema = z.strictObject({
  message: z.string().trim().min(1).max(4000),
  actions: z.array(z.unknown()).max(3).optional(),
  confidence: z.enum(['known', 'general', 'unknown']),
  escalate: z.boolean(),
});

export interface ParsedSupportRequest {
  messages: SupportChatTurn[];
  context: SupportChatContext;
}

export function parseSupportActions(value: unknown): SupportAction[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > 3) return null;
  const actions: SupportAction[] = [];
  for (const item of value) {
    const parsed = supportActionSchema.safeParse(normalizeAction(item));
    if (!parsed.success) return null;
    actions.push(parsed.data);
  }
  return actions;
}

function normalizeAction(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (record.type === 'navigate' && (record.search === '' || record.search === null)) {
    const rest = { ...record };
    delete rest.search;
    return rest;
  }
  return value;
}

export function parseSupportReply(value: unknown): SupportChatResponse | null {
  const parsed = supportReplySchema.safeParse(value);
  if (!parsed.success) return null;
  const actions = parseSupportActions(parsed.data.actions ?? []);
  if (!actions) return null;
  return {
    message: parsed.data.message,
    actions,
    confidence: parsed.data.confidence,
    escalate: parsed.data.escalate,
  };
}
