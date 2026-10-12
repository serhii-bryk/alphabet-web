import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PaymentIntentRecord, PaymentIntentStore } from '@brand/domain';

export function createFilePaymentIntentStore(filePath: string): PaymentIntentStore {
  let records = readRecords(filePath);
  const persist = () => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(records), { encoding: 'utf8', mode: 0o600 });
  };
  return {
    get(paymentId) {
      return copy(records.find((intent) => intent.paymentId === paymentId));
    },
    findIdempotent(playerId, idempotencyKey) {
      return copy(
        records.find(
          (intent) => intent.playerId === playerId && intent.idempotencyKey === idempotencyKey,
        ),
      );
    },
    insert(intent) {
      records = records.filter((existing) => existing.paymentId !== intent.paymentId);
      records.push(copy(intent) as PaymentIntentRecord);
      persist();
    },
    save(intent) {
      const index = records.findIndex((existing) => existing.paymentId === intent.paymentId);
      if (index === -1) {
        records.push(copy(intent) as PaymentIntentRecord);
      } else {
        records[index] = copy(intent) as PaymentIntentRecord;
      }
      persist();
    },
  };
}

function readRecords(filePath: string): PaymentIntentRecord[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const intent = normalize(entry);
      return intent ? [intent] : [];
    });
  } catch {
    return [];
  }
}

function normalize(value: unknown): PaymentIntentRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.paymentId !== 'string' ||
    typeof record.playerId !== 'string' ||
    (record.direction !== 'deposit' && record.direction !== 'withdraw') ||
    typeof record.amount !== 'number' ||
    typeof record.currency !== 'string' ||
    typeof record.methodId !== 'string' ||
    !isStatus(record.status) ||
    typeof record.idempotencyKey !== 'string' ||
    typeof record.createdAt !== 'string'
  ) {
    return undefined;
  }
  const intent: PaymentIntentRecord = {
    paymentId: record.paymentId,
    playerId: record.playerId,
    direction: record.direction,
    amount: record.amount,
    currency: record.currency,
    methodId: record.methodId,
    status: record.status,
    idempotencyKey: record.idempotencyKey,
    createdAt: record.createdAt,
  };
  if (typeof record.finalpayId === 'number') intent.finalpayId = record.finalpayId;
  if (typeof record.platformWithdrawalHash === 'string') {
    intent.platformWithdrawalHash = record.platformWithdrawalHash;
  }
  if (
    record.withdrawalStage === 'requested' ||
    record.withdrawalStage === 'approved' ||
    record.withdrawalStage === 'confirmed' ||
    record.withdrawalStage === 'rolledback'
  ) {
    intent.withdrawalStage = record.withdrawalStage;
  }
  if (typeof record.redirectUrl === 'string') intent.redirectUrl = record.redirectUrl;
  if (
    record.resultStatus === 'redirect' ||
    record.resultStatus === 'completed' ||
    record.resultStatus === 'processing' ||
    record.resultStatus === 'failed'
  ) {
    intent.resultStatus = record.resultStatus;
  }
  if (typeof record.failureCode === 'string') {
    intent.failureCode = record.failureCode as PaymentIntentRecord['failureCode'];
  }
  return intent;
}

function isStatus(value: unknown): value is PaymentIntentRecord['status'] {
  return (
    value === 'pending' ||
    value === 'processing' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
  );
}

function copy(intent: PaymentIntentRecord | undefined): PaymentIntentRecord | undefined {
  return intent ? { ...intent } : undefined;
}
