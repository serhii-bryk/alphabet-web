import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFileAiBudget, createMemoryAiBudget } from './budget.js';
import { readAiChatLimits } from './limits.js';

const limits = readAiChatLimits({
  AI_CHAT_MAX_CONCURRENT: '2',
  AI_CHAT_SESSION_LIMIT: '10',
  AI_CHAT_HOURLY_LIMIT: '10',
  AI_CHAT_DAILY_BUDGET_USD: '1',
  AI_CHAT_TOTAL_BUDGET_USD: '5',
});

const keys = [{ id: 'scope:abc', kind: 'session' as const }, { id: 'ip:local', kind: 'hour' as const }];

describe('ai budget ledger', () => {
  it('serializes parallel reservations and reconciles actual usage', async () => {
    const store = createMemoryAiBudget({ ...limits, maxConcurrent: 1, sessionLimit: 5 });
    const results = await Promise.all([
      store.reserve({ keys, now: 1_000 }),
      store.reserve({ keys, now: 1_000 }),
      store.reserve({ keys, now: 1_000 }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.reason === 'rate_limited')).toHaveLength(2);
    const reserved = results.find((result) => result.ok);
    if (!reserved || !reserved.ok) throw new Error('expected a reservation');
    await store.reconcile({ id: reserved.id, inputTokens: 10, outputTokens: 10, now: 1_000 });
    const next = await store.reserve({ keys, now: 1_000 });
    expect(next.ok).toBe(true);
  });

  it('keeps an uncertain reservation until it expires, then counts it as spent', async () => {
    const tight = { ...limits, maxConcurrent: 1, quoteNano: 100, dailyBudgetNano: 150, totalBudgetNano: 150, staleReservationMs: 1_000 };
    const store = createMemoryAiBudget(tight);
    const first = await store.reserve({ keys, now: 5_000 });
    if (!first.ok) throw new Error('expected a reservation');
    const blocked = await store.reserve({ keys, now: 5_100 });
    expect(blocked).toEqual({ ok: false, reason: 'rate_limited' });
    const afterExpiry = await store.reserve({ keys: [{ id: 'scope:other', kind: 'session' }, { id: 'ip:other', kind: 'hour' }], now: 7_000 });
    expect(afterExpiry).toEqual({ ok: false, reason: 'budget_exhausted' });
  });

  it('does not reset a session count for the same identity', async () => {
    const store = createMemoryAiBudget({ ...limits, sessionLimit: 1, hourlyLimit: 10 });
    expect((await store.reserve({ keys, now: 1_000 })).ok).toBe(true);
    expect(await store.reserve({ keys, now: 2_000 })).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('shares a file ledger across two store instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alphabet-ai-'));
    const path = join(dir, 'budget.json');
    const first = createFileAiBudget(path, { ...limits, sessionLimit: 1 });
    const second = createFileAiBudget(path, { ...limits, sessionLimit: 1 });
    expect((await first.reserve({ keys, now: 1_000 })).ok).toBe(true);
    expect(await second.reserve({ keys, now: 1_000 })).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('fails closed when the ledger cannot be locked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alphabet-ai-lock-'));
    const path = join(dir, 'budget.json');
    writeFileSync(`${path}.lock`, 'held');
    const store = createFileAiBudget(path, limits, { lockWaitMs: 30 });
    await expect(store.reserve({ keys, now: 1_000 })).rejects.toThrow('budget_unavailable');
  });

  it('fails closed when the saved ledger is corrupt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alphabet-ai-bad-'));
    const path = join(dir, 'budget.json');
    writeFileSync(path, '{"spentTotalNano":0}');
    const store = createFileAiBudget(path, limits, { lockWaitMs: 30 });
    await expect(store.reserve({ keys, now: 1_000 })).rejects.toThrow('budget_unavailable');
  });
});
