import type { ExclusionKind, ExclusionResult } from '@brand/contracts';

export const PLAYER_CONTROL_KEY = 'alphabet.playerControl.v1';
export const RECEIPT_KEY = 'alphabet.playerControl.receipt.v1';

export interface PlayerControlRecord {
  deviceStartedAt?: string;
  acknowledgedThrough?: number;
}

interface PlayerControlStore {
  players: Record<string, PlayerControlRecord>;
}

export interface ResolvedSessionStart {
  startedAtMs: number;
  kind: 'platform' | 'device';
  /** Set only when a device clock has to be created. Never set for a Platform start. */
  deviceStartedAtToStore: string | null;
}

export interface LocalReceipt {
  kind: ExclusionKind;
  periodText: string;
  reasonText: string | null;
  status: string;
  expiresAt: string | null;
  createdAt: string | null;
  storedAt: string;
}

function emptyStore(): PlayerControlStore {
  return { players: {} };
}

function readStore(): PlayerControlStore {
  if (typeof localStorage === 'undefined') return emptyStore();
  try {
    const raw = localStorage.getItem(PLAYER_CONTROL_KEY);
    if (!raw) return emptyStore();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyStore();
    const players = (parsed as { players?: unknown }).players;
    if (!players || typeof players !== 'object' || Array.isArray(players)) return emptyStore();
    return { players: players as Record<string, PlayerControlRecord> };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: PlayerControlStore) {
  localStorage.setItem(PLAYER_CONTROL_KEY, JSON.stringify(store));
}

export function readPlayerRecord(playerId: string): PlayerControlRecord {
  const record = readStore().players[playerId];
  if (!record || typeof record !== 'object') return {};
  const next: PlayerControlRecord = {};
  if (typeof record.deviceStartedAt === 'string') next.deviceStartedAt = record.deviceStartedAt;
  if (typeof record.acknowledgedThrough === 'number' && Number.isFinite(record.acknowledgedThrough)) {
    next.acknowledgedThrough = record.acknowledgedThrough;
  }
  return next;
}

export function updatePlayerRecord(playerId: string, patch: PlayerControlRecord): PlayerControlRecord {
  const store = readStore();
  const next = { ...readPlayerRecord(playerId), ...patch };
  store.players[playerId] = next;
  writeStore(store);
  return next;
}

/** Drops a device fallback when the signed-in player changes. Platform time is not stored here. */
export function clearDeviceClock(playerId: string) {
  const store = readStore();
  const record = store.players[playerId];
  if (!record?.deviceStartedAt) return;
  delete record.deviceStartedAt;
  if (record.acknowledgedThrough === undefined) delete store.players[playerId];
  writeStore(store);
}

/** Keeps an existing device start. A later mount must not replace it. */
export function ensureDeviceStart(playerId: string, iso: string): string {
  const existing = readPlayerRecord(playerId).deviceStartedAt;
  if (existing && !Number.isNaN(Date.parse(existing))) return existing;
  updatePlayerRecord(playerId, { deviceStartedAt: iso });
  return iso;
}

export function resolveSessionStart(input: {
  source: 'platform_login' | 'unavailable';
  startedAt: string | null;
  deviceStartedAt: string | null;
  now: number;
}): ResolvedSessionStart {
  if (input.source === 'platform_login' && input.startedAt) {
    const startedAtMs = Date.parse(input.startedAt);
    if (!Number.isNaN(startedAtMs)) {
      return { startedAtMs, kind: 'platform', deviceStartedAtToStore: null };
    }
  }
  if (input.deviceStartedAt) {
    const startedAtMs = Date.parse(input.deviceStartedAt);
    if (!Number.isNaN(startedAtMs)) {
      return { startedAtMs, kind: 'device', deviceStartedAtToStore: null };
    }
  }
  return {
    startedAtMs: input.now,
    kind: 'device',
    deviceStartedAtToStore: new Date(input.now).toISOString(),
  };
}

/** The reminder boundary that has been reached, or null when none is due yet. */
export function currentReminderBoundary(
  startedAtMs: number,
  intervalMinutes: number,
  now: number,
): number | null {
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return null;
  const intervalMs = intervalMinutes * 60_000;
  const elapsed = now - startedAtMs;
  if (elapsed < intervalMs) return null;
  const index = Math.floor(elapsed / intervalMs);
  return startedAtMs + index * intervalMs;
}

export function reminderIsDue(boundary: number | null, acknowledgedThrough: number | null): boolean {
  if (boundary === null) return false;
  if (acknowledgedThrough === null) return true;
  return boundary > acknowledgedThrough;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function canSubmitPeriod(period: { dateSelector: boolean } | null | undefined): boolean {
  return Boolean(period && period.dateSelector === false);
}

const receiptListeners = new Set<() => void>();
let receiptSnapshot: LocalReceipt | null = null;
let receiptRaw: string | null | undefined;

function publishReceipt() {
  receiptRaw = undefined;
  receiptListeners.forEach((listener) => listener());
}

export function subscribeReceipt(listener: () => void) {
  receiptListeners.add(listener);
  return () => {
    receiptListeners.delete(listener);
  };
}

export function getReceiptSnapshot(): LocalReceipt | null {
  if (typeof sessionStorage === 'undefined') return null;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(RECEIPT_KEY);
  } catch {
    return null;
  }
  if (raw === receiptRaw) return receiptSnapshot;
  receiptRaw = raw;
  receiptSnapshot = readReceipt();
  return receiptSnapshot;
}

export function saveReceipt(result: ExclusionResult, storedAt = new Date().toISOString()): LocalReceipt {
  const receipt: LocalReceipt = {
    kind: result.kind,
    periodText: result.periodText,
    reasonText: result.reasonText,
    status: result.status,
    expiresAt: result.expiresAt,
    createdAt: result.createdAt,
    storedAt,
  };
  sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
  publishReceipt();
  return receipt;
}

export function readReceipt(): LocalReceipt | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(RECEIPT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Partial<LocalReceipt>;
    if (value.kind !== 'cool_off' && value.kind !== 'self_exclusion') return null;
    if (typeof value.periodText !== 'string' || typeof value.status !== 'string') return null;
    if (value.reasonText !== null && typeof value.reasonText !== 'string') return null;
    if (value.expiresAt !== null && typeof value.expiresAt !== 'string') return null;
    if (value.createdAt !== null && typeof value.createdAt !== 'string') return null;
    if (typeof value.storedAt !== 'string') return null;
    return {
      kind: value.kind,
      periodText: value.periodText,
      reasonText: value.reasonText ?? null,
      status: value.status,
      expiresAt: value.expiresAt ?? null,
      createdAt: value.createdAt ?? null,
      storedAt: value.storedAt,
    };
  } catch {
    return null;
  }
}

export function clearPlayerControlReceipt() {
  try {
    sessionStorage.removeItem(RECEIPT_KEY);
  } catch {
    // Session storage can be unavailable. Login still proceeds.
  }
  publishReceipt();
}
