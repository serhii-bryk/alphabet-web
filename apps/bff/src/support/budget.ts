import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AiChatLimits } from './limits.js';

export class AiBudgetError extends Error {
  constructor() {
    super('budget_unavailable');
    this.name = 'AiBudgetError';
  }
}

export interface BudgetKey {
  id: string;
  kind: 'session' | 'hour';
}

export type ReserveResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'rate_limited' | 'budget_exhausted' };

export interface AiBudgetStore {
  reserve(input: { keys: BudgetKey[]; now: number }): Promise<ReserveResult>;
  reconcile(input: { id: string; inputTokens?: number; outputTokens?: number; now: number }): Promise<void>;
}

interface Bucket {
  sessionCount: number;
  hourCount: number;
  hourStartedAt: number;
}

interface Reservation {
  id: string;
  nano: number;
  at: number;
}

interface Ledger {
  day: string;
  spentDailyNano: number;
  spentTotalNano: number;
  inflight: number;
  reservations: Reservation[];
  buckets: Record<string, Bucket>;
}

export function createMemoryAiBudget(limits: AiChatLimits): AiBudgetStore {
  let ledger = emptyLedger(0);
  return createQueuedStore(limits, {
    read: () => ledger,
    write: (next) => {
      ledger = next;
    },
  });
}

export function createFileAiBudget(
  filePath: string,
  limits: AiChatLimits,
  options: { lockWaitMs?: number } = {},
): AiBudgetStore {
  const lockPath = `${filePath}.lock`;
  const lockWaitMs = options.lockWaitMs ?? 1_500;
  let chain = Promise.resolve();
  const run = <T>(now: number, fn: (ledger: Ledger) => T): Promise<T> => {
    const task = chain.then(() =>
      withLock(lockPath, lockWaitMs, () => {
        const ledger = sweep(readLedger(filePath), limits, now);
        const result = fn(ledger);
        writeLedger(filePath, ledger);
        return result;
      }),
    );
    chain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };
  return {
    reserve({ keys, now }) {
      return run(now, (ledger) => reserveOn(ledger, limits, keys, now));
    },
    reconcile({ id, inputTokens, outputTokens, now }) {
      return run(now, (ledger) => {
        reconcileOn(ledger, limits, id, inputTokens, outputTokens, now);
      });
    },
  };
}

function createQueuedStore(
  limits: AiChatLimits,
  io: { read: () => Ledger; write: (ledger: Ledger) => void },
): AiBudgetStore {
  let chain = Promise.resolve();
  const locked = <T>(fn: () => T): Promise<T> => {
    const run = chain.then(() => fn());
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  return {
    reserve({ keys, now }) {
      return locked(() => {
        const ledger = sweep(io.read(), limits, now);
        const result = reserveOn(ledger, limits, keys, now);
        io.write(ledger);
        return result;
      });
    },
    reconcile({ id, inputTokens, outputTokens, now }) {
      return locked(() => {
        const ledger = sweep(io.read(), limits, now);
        reconcileOn(ledger, limits, id, inputTokens, outputTokens, now);
        io.write(ledger);
      });
    },
  };
}

function reserveOn(ledger: Ledger, limits: AiChatLimits, keys: BudgetKey[], now: number): ReserveResult {
  const day = dayKey(now);
  if (ledger.day !== day) {
    ledger.day = day;
    ledger.spentDailyNano = 0;
  }
  const quote = limits.quoteNano;
  if (ledger.inflight >= limits.maxConcurrent) return { ok: false, reason: 'rate_limited' };
  if (ledger.spentDailyNano + reservedNano(ledger) + quote > limits.dailyBudgetNano) {
    return { ok: false, reason: 'budget_exhausted' };
  }
  if (ledger.spentTotalNano + reservedNano(ledger) + quote > limits.totalBudgetNano) {
    return { ok: false, reason: 'budget_exhausted' };
  }
  const unique = uniqueKeys(keys);
  for (const key of unique) {
    const bucket = bucketAt(ledger, key.id, now, limits.hourWindowMs);
    if (key.kind === 'session' && bucket.sessionCount >= limits.sessionLimit) {
      return { ok: false, reason: 'rate_limited' };
    }
    if (key.kind === 'hour' && bucket.hourCount >= limits.hourlyLimit) {
      return { ok: false, reason: 'rate_limited' };
    }
  }
  for (const key of unique) {
    const bucket = bucketAt(ledger, key.id, now, limits.hourWindowMs);
    if (key.kind === 'session') bucket.sessionCount += 1;
    else bucket.hourCount += 1;
  }
  ledger.inflight += 1;
  ledger.reservations.push({ id: randomUUID(), nano: quote, at: now });
  return { ok: true, id: ledger.reservations[ledger.reservations.length - 1]?.id ?? '' };
}

function reconcileOn(
  ledger: Ledger,
  limits: AiChatLimits,
  id: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  now: number,
): void {
  const index = ledger.reservations.findIndex((item) => item.id === id);
  if (index === -1) return;
  const reservation = ledger.reservations[index];
  if (!reservation) return;
  const known =
    inputTokens !== undefined &&
    outputTokens !== undefined &&
    inputTokens >= 0 &&
    outputTokens >= 0 &&
    inputTokens + outputTokens > 0;
  const actual = known ? tokenCost(inputTokens, outputTokens, limits) : reservation.nano;
  addSpend(ledger, actual, now);
  ledger.reservations.splice(index, 1);
  ledger.inflight = Math.max(0, ledger.inflight - 1);
}

function sweep(ledger: Ledger, limits: AiChatLimits, now: number): Ledger {
  const stale = ledger.reservations.filter((item) => now - item.at >= limits.staleReservationMs);
  if (stale.length === 0) return ledger;
  for (const reservation of stale) addSpend(ledger, reservation.nano, now);
  ledger.reservations = ledger.reservations.filter((item) => now - item.at < limits.staleReservationMs);
  ledger.inflight = Math.max(0, ledger.inflight - stale.length);
  return ledger;
}

function addSpend(ledger: Ledger, nano: number, now: number): void {
  const day = dayKey(now);
  if (ledger.day !== day) {
    ledger.day = day;
    ledger.spentDailyNano = 0;
  }
  ledger.spentDailyNano += nano;
  ledger.spentTotalNano += nano;
}

function tokenCost(inputTokens: number, outputTokens: number, limits: AiChatLimits): number {
  const input = Math.ceil((inputTokens * limits.inputUsdPerMillion * 1_000_000_000) / 1_000_000);
  const output = Math.ceil((outputTokens * limits.outputUsdPerMillion * 1_000_000_000) / 1_000_000);
  return input + output;
}

function reservedNano(ledger: Ledger): number {
  return ledger.reservations.reduce((sum, item) => sum + item.nano, 0);
}

function uniqueKeys(keys: BudgetKey[]): BudgetKey[] {
  const seen = new Set<string>();
  const unique: BudgetKey[] = [];
  for (const key of keys) {
    if (!/^[a-z0-9:._|-]{1,80}$/i.test(key.id)) continue;
    const mark = `${key.kind}:${key.id}`;
    if (seen.has(mark)) continue;
    seen.add(mark);
    unique.push(key);
  }
  return unique;
}

function bucketAt(ledger: Ledger, id: string, now: number, windowMs: number): Bucket {
  const current = ledger.buckets[id];
  if (!current || now - current.hourStartedAt >= windowMs) {
    const next = { sessionCount: current?.sessionCount ?? 0, hourCount: 0, hourStartedAt: now };
    ledger.buckets[id] = next;
    return next;
  }
  return current;
}

function emptyLedger(now: number): Ledger {
  return { day: dayKey(now), spentDailyNano: 0, spentTotalNano: 0, inflight: 0, reservations: [], buckets: {} };
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function readLedger(filePath: string): Ledger {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    const ledger = normalizeLedger(parsed);
    if (!ledger) throw new AiBudgetError();
    return ledger;
  } catch (error) {
    if (isMissing(error)) return emptyLedger(Date.now());
    if (error instanceof AiBudgetError) throw error;
    throw new AiBudgetError();
  }
}

function writeLedger(filePath: string, ledger: Ledger): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(ledger), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, filePath);
  } catch {
    throw new AiBudgetError();
  }
}

function normalizeLedger(value: unknown): Ledger | null {
  if (!isRecord(value)) return null;
  if (typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day)) return null;
  if (!isSafeInt(value.spentDailyNano) || !isSafeInt(value.spentTotalNano) || !isSafeInt(value.inflight)) return null;
  if (!Array.isArray(value.reservations) || !isRecord(value.buckets)) return null;
  const reservations: Reservation[] = [];
  for (const item of value.reservations) {
    if (!isRecord(item) || typeof item.id !== 'string' || !isSafeInt(item.nano) || !isSafeInt(item.at)) return null;
    reservations.push({ id: item.id, nano: item.nano, at: item.at });
  }
  const buckets: Record<string, Bucket> = {};
  for (const [id, bucket] of Object.entries(value.buckets)) {
    if (!isRecord(bucket) || !isSafeInt(bucket.sessionCount) || !isSafeInt(bucket.hourCount) || !isSafeInt(bucket.hourStartedAt)) {
      return null;
    }
    buckets[id] = {
      sessionCount: bucket.sessionCount,
      hourCount: bucket.hourCount,
      hourStartedAt: bucket.hourStartedAt,
    };
  }
  return {
    day: value.day,
    spentDailyNano: value.spentDailyNano,
    spentTotalNano: value.spentTotalNano,
    inflight: value.inflight,
    reservations,
    buckets,
  };
}

function withLock<T>(lockPath: string, waitMs: number, fn: () => T): T {
  mkdirSync(dirname(lockPath), { recursive: true });
  const started = Date.now();
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = openSync(lockPath, 'wx');
    } catch (error) {
      if (!isExists(error)) throw new AiBudgetError();
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 5_000) unlinkSync(lockPath);
      } catch {
        // Another process released or replaced the lock.
      }
      if (Date.now() - started > waitMs) throw new AiBudgetError();
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(lockPath);
    } catch {
      // The next caller treats a stale lock as expired.
    }
  }
}

function isSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return isErrno(error, 'ENOENT');
}

function isExists(error: unknown): boolean {
  return isErrno(error, 'EEXIST');
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
