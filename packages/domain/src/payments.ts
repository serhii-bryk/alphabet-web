import { randomUUID } from 'node:crypto';
import type {
  PaymentDirection,
  PaymentErrorCode,
  PaymentIntentStatus,
  PaymentMethod,
  PaymentMethodsResponse,
  PaymentMutationResponse,
  PaymentStatusResponse,
} from '@brand/contracts';
import { PlatformClientError } from '@brand/platform';
import type { PlatformClient, PlatformProfileResponse } from '@brand/platform';
import { isPlayerSessionEnded, playerIdNumber } from './auth.js';
import type { PlayerSession } from './auth.js';

export const testDepositMethodId = 'test-deposit';
const methodCacheTtlMs = 20 * 60 * 1000;
const testDepositCooldownMs = 15_000;

const failureStates = new Set(['DECLINED', 'CANCELLED', 'ERROR', 'FAILED']);

export class PaymentError extends Error {
  readonly code: PaymentErrorCode;

  constructor(code: PaymentErrorCode) {
    super(code);
    this.name = 'PaymentError';
    this.code = code;
  }
}

export interface PaymentCustomer {
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  city: string;
  address: string;
  zip: string;
  phone: string;
  birthdate: string;
}

export interface ProviderPaymentMethod {
  id: string;
  label: string;
  minAmount: number | null;
  maxAmount: number | null;
  fields: { name: string; label: string }[];
  submitUrl: string | null;
  submitChecksum: string | null;
}

export interface PaymentProvider {
  init(input: {
    paymentId: string;
    playerId: string;
    direction: PaymentDirection;
    amount?: number;
    currency: string;
    customer: PaymentCustomer;
    ip: string;
    browser: string;
    locale: 'en' | 'ar';
  }): Promise<{ providerPaymentId: number | null; methods: ProviderPaymentMethod[] }>;
  submit(input: {
    url: string;
    checksum: string;
    amount: string;
    fields: Record<string, string>;
  }): Promise<{ redirectUrl: string | null; state: string | null }>;
}

export type WithdrawalStage = 'requested' | 'approved' | 'confirmed' | 'rolledback';

export interface PaymentIntentRecord {
  paymentId: string;
  playerId: string;
  direction: PaymentDirection;
  amount: number;
  currency: string;
  methodId: string;
  status: PaymentIntentStatus;
  finalpayId?: number;
  platformWithdrawalHash?: string;
  withdrawalStage?: WithdrawalStage;
  idempotencyKey: string;
  createdAt: string;
  redirectUrl?: string;
  resultStatus?: PaymentMutationResponse['status'];
  failureCode?: PaymentErrorCode;
}

export interface PaymentIntentStore {
  get(paymentId: string): PaymentIntentRecord | undefined;
  findIdempotent(playerId: string, idempotencyKey: string): PaymentIntentRecord | undefined;
  insert(intent: PaymentIntentRecord): void;
  save(intent: PaymentIntentRecord): void;
}

export interface PaymentsRuntimeConfig {
  providerConfigured: boolean;
  testMode: boolean;
  testMaxAmount: number;
}

export interface PaymentActor {
  session: PlayerSession;
  ip?: string;
  browser?: string;
  locale: 'en' | 'ar';
}

export interface PaymentUseCases {
  listMethods(actor: PaymentActor): Promise<PaymentMethodsResponse>;
  deposit(
    actor: PaymentActor,
    input: { methodId: string; amount: number; idempotencyKey: string },
  ): Promise<PaymentMutationResponse>;
  withdraw(
    actor: PaymentActor,
    input: {
      methodId: string;
      amount: number;
      idempotencyKey: string;
      details?: Record<string, string>;
    },
  ): Promise<PaymentMutationResponse>;
  status(actor: PaymentActor, paymentId: string): Promise<PaymentStatusResponse>;
  handleCallback(input: {
    paymentId: string;
    providerPaymentId: number;
    state: string;
  }): Promise<{ ack: 'ok' | 'fail'; outcome: string }>;
}

interface MethodCacheEntry {
  paymentId: string;
  providerPaymentId: number | null;
  options: ProviderPaymentMethod[];
  expiresAt: number;
}

export function resolveTestMaxAmount(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 50;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1000) return 50;
  return value;
}

export function isTestDepositEnabled(
  flag: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  return flag === 'true' && nodeEnv !== 'production';
}

export function parsePaymentAmount(amount: number): number | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return undefined;
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 1e-6) return undefined;
  if (!Number.isSafeInteger(cents)) return undefined;
  return cents / 100;
}

export function formatPaymentAmount(amount: number): string {
  const cents = Math.round(amount * 100);
  const whole = Math.trunc(cents / 100);
  const fraction = Math.abs(cents % 100);
  if (fraction === 0) return String(whole);
  if (fraction % 10 === 0) return `${whole}.${fraction / 10}`;
  return `${whole}.${String(fraction).padStart(2, '0')}`;
}

export function createMemoryPaymentIntentStore(): PaymentIntentStore {
  const byId = new Map<string, PaymentIntentRecord>();
  return {
    get(paymentId) {
      const found = byId.get(paymentId);
      return found ? copyIntent(found) : undefined;
    },
    findIdempotent(playerId, idempotencyKey) {
      for (const intent of byId.values()) {
        if (intent.playerId === playerId && intent.idempotencyKey === idempotencyKey) {
          return copyIntent(intent);
        }
      }
      return undefined;
    },
    insert(intent) {
      if (byId.has(intent.paymentId)) throw new PaymentError('duplicate_request');
      byId.set(intent.paymentId, copyIntent(intent));
    },
    save(intent) {
      if (!byId.has(intent.paymentId)) throw new PaymentError('provider_unavailable');
      byId.set(intent.paymentId, copyIntent(intent));
    },
  };
}

export function createPaymentUseCases(
  platform: PlatformClient,
  provider: PaymentProvider,
  intents: PaymentIntentStore,
  config: PaymentsRuntimeConfig,
  options: { now?: () => number; ids?: () => string } = {},
): PaymentUseCases {
  const now = options.now ?? Date.now;
  const ids = options.ids ?? randomUUID;
  const methodCache = new Map<string, MethodCacheEntry>();
  const inflight = new Map<string, Promise<PaymentMutationResponse>>();
  const callbackLocks = new Map<string, Promise<void>>();
  const testCreditAt = new Map<string, number>();
  const testInFlight = new Set<string>();

  return {
    listMethods(actor) {
      return listMethods(actor);
    },
    deposit(actor, input) {
      const amount = parsePaymentAmount(input.amount);
      if (amount === undefined) throw new PaymentError('invalid_amount');
      return startMutation(actor.session.playerId, input.idempotencyKey, () =>
        performDeposit(actor, input.methodId, amount, input.idempotencyKey),
      );
    },
    withdraw(actor, input) {
      const amount = parsePaymentAmount(input.amount);
      if (amount === undefined) throw new PaymentError('invalid_amount');
      return startMutation(actor.session.playerId, input.idempotencyKey, () =>
        performWithdraw(actor, input.methodId, amount, input.idempotencyKey, input.details),
      );
    },
    async status(actor, paymentId) {
      const intent = intents.get(paymentId);
      if (!intent || intent.playerId !== actor.session.playerId) {
        throw new PaymentError('method_unavailable');
      }
      return { status: intent.status, direction: intent.direction };
    },
    handleCallback(input) {
      return exclusive(callbackLocks, input.paymentId, () => applyCallback(input));
    },
  };

  async function listMethods(actor: PaymentActor): Promise<PaymentMethodsResponse> {
    const player = await readPlayer(platform, actor.session);
    const currency = paymentCurrency(actor.session, player.balance.currency);
    const customer = customerFromProfile(player.profile.profile);
    const [depositCache, withdrawCache] = await Promise.all([
      loadMethods(actor, player.playerId, currency, customer, 'deposit'),
      loadMethods(actor, player.playerId, currency, customer, 'withdraw'),
    ]);
    const depositMethods = (depositCache?.options ?? [])
      .filter(
        (method) =>
          method.submitUrl !== null &&
          method.submitChecksum !== null &&
          depositCache?.providerPaymentId !== null &&
          depositCache?.providerPaymentId !== undefined,
      )
      .map((method) => toPublicMethod(method));
    if (config.testMode) depositMethods.unshift(testMethod(config.testMaxAmount));
    const withdrawMethods = withdrawCache?.options.map((method) => toPublicMethod(method)) ?? [];
    if (depositMethods.length === 0 && withdrawMethods.length === 0) {
      throw new PaymentError('provider_unavailable');
    }
    return {
      currency,
      balance: player.balance.balance,
      depositMethods,
      withdrawMethods,
    };
  }

  async function loadMethods(
    actor: PaymentActor,
    playerId: number,
    currency: string,
    customer: PaymentCustomer,
    direction: PaymentDirection,
  ): Promise<MethodCacheEntry | undefined> {
    const key = cacheKey(actor.session.playerId, direction);
    const cached = methodCache.get(key);
    if (cached && cached.expiresAt > now()) return cached;
    methodCache.delete(key);
    if (!config.providerConfigured) return undefined;
    try {
      const paymentId = ids();
      const initiated = await provider.init({
        paymentId,
        playerId: String(playerId),
        direction,
        currency,
        customer,
        ip: actor.ip ?? '',
        browser: actor.browser ?? '',
        locale: actor.locale,
      });
      const entry: MethodCacheEntry = {
        paymentId,
        providerPaymentId: initiated.providerPaymentId,
        options: initiated.methods,
        expiresAt: now() + methodCacheTtlMs,
      };
      methodCache.set(key, entry);
      return entry;
    } catch {
      return undefined;
    }
  }

  function startMutation(
    playerId: string,
    idempotencyKey: string,
    run: () => Promise<PaymentMutationResponse>,
  ): Promise<PaymentMutationResponse> {
    const existing = intents.findIdempotent(playerId, idempotencyKey);
    if (existing) return Promise.resolve(replay(existing));
    const mapKey = `${playerId}:${idempotencyKey}`;
    const pending = inflight.get(mapKey);
    if (pending) return pending;
    const promise = run().finally(() => {
      inflight.delete(mapKey);
    });
    inflight.set(mapKey, promise);
    return promise;
  }

  async function performDeposit(
    actor: PaymentActor,
    methodId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<PaymentMutationResponse> {
    const player = await readPlayer(platform, actor.session);
    const currency = paymentCurrency(actor.session, player.balance.currency);
    if (methodId === testDepositMethodId) {
      return testDeposit(actor, player.playerId, amount, currency, idempotencyKey);
    }
    if (!config.providerConfigured) throw new PaymentError('provider_unavailable');
    const customer = customerFromProfile(player.profile.profile);
    const prepared = await prepareDepositMethod(
      actor,
      player.playerId,
      currency,
      customer,
      methodId,
      amount,
    );
    if (!prepared.option.submitUrl || !prepared.option.submitChecksum || !prepared.providerPaymentId) {
      throw new PaymentError('method_unavailable');
    }
    const intent = newIntent({
      actor,
      direction: 'deposit',
      amount,
      currency,
      methodId,
      paymentId: prepared.paymentId,
      idempotencyKey,
      finalpayId: prepared.providerPaymentId,
    });
    intents.insert(intent);
    try {
      const submitted = await provider.submit({
        url: prepared.option.submitUrl,
        checksum: prepared.option.submitChecksum,
        amount: formatPaymentAmount(amount),
        fields: {},
      });
      return finishDepositSubmit(intent, submitted);
    } catch (error) {
      return failIntent(intent, error, 'deposit_failed');
    }
  }

  async function prepareDepositMethod(
    actor: PaymentActor,
    playerId: number,
    currency: string,
    customer: PaymentCustomer,
    methodId: string,
    amount: number,
  ): Promise<{ paymentId: string; providerPaymentId: number | null; option: ProviderPaymentMethod }> {
    const key = cacheKey(actor.session.playerId, 'deposit');
    const cached = methodCache.get(key);
    const cachedOption =
      cached && cached.expiresAt > now()
        ? cached.options.find((option) => option.id === methodId)
        : undefined;
    if (cached && cachedOption) {
      if (outsideLimits(amount, cachedOption.minAmount, cachedOption.maxAmount)) {
        throw new PaymentError('invalid_amount');
      }
      methodCache.delete(key);
      return {
        paymentId: cached.paymentId,
        providerPaymentId: cached.providerPaymentId,
        option: cachedOption,
      };
    }
    const paymentId = ids();
    const initiated = await provider.init({
      paymentId,
      playerId: String(playerId),
      direction: 'deposit',
      currency,
      customer,
      ip: actor.ip ?? '',
      browser: actor.browser ?? '',
      locale: actor.locale,
    });
    const option = initiated.methods.find((method) => method.id === methodId);
    if (!option) throw new PaymentError('method_unavailable');
    if (outsideLimits(amount, option.minAmount, option.maxAmount)) {
      throw new PaymentError('invalid_amount');
    }
    return { paymentId, providerPaymentId: initiated.providerPaymentId, option };
  }

  function finishDepositSubmit(
    intent: PaymentIntentRecord,
    submitted: { redirectUrl: string | null; state: string | null },
  ): PaymentMutationResponse {
    const state = normalizeState(submitted.state);
    if (state === 'CANCELLED') return failSaved(intent, 'cancelled', 'payment_cancelled');
    if (state && failureStates.has(state)) return failSaved(intent, 'failed', 'deposit_failed');
    if (submitted.redirectUrl) {
      intent.status = 'processing';
      intent.resultStatus = 'redirect';
      intent.redirectUrl = submitted.redirectUrl;
      intents.save(intent);
      return { status: 'redirect', paymentId: intent.paymentId, redirectUrl: submitted.redirectUrl };
    }
    intent.status = 'processing';
    intent.resultStatus = 'processing';
    intents.save(intent);
    return { status: 'processing', paymentId: intent.paymentId };
  }

  async function testDeposit(
    actor: PaymentActor,
    playerId: number,
    amount: number,
    currency: string,
    idempotencyKey: string,
  ): Promise<PaymentMutationResponse> {
    if (!config.testMode) throw new PaymentError('method_unavailable');
    if (outsideLimits(amount, 1, config.testMaxAmount)) throw new PaymentError('invalid_amount');
    if (testInFlight.has(actor.session.playerId)) throw new PaymentError('duplicate_request');
    const previous = testCreditAt.get(actor.session.playerId);
    if (previous !== undefined && now() - previous < testDepositCooldownMs) {
      throw new PaymentError('duplicate_request');
    }
    testInFlight.add(actor.session.playerId);
    const intent = newIntent({
      actor,
      direction: 'deposit',
      amount,
      currency,
      methodId: testDepositMethodId,
      paymentId: ids(),
      idempotencyKey,
    });
    intents.insert(intent);
    try {
      await platform.deposit({
        playerId,
        amount,
        currency,
        transactionReference: intent.paymentId,
        ...(actor.ip ? { ip: actor.ip } : {}),
      });
      intent.status = 'completed';
      intent.resultStatus = 'completed';
      intents.save(intent);
      testCreditAt.set(actor.session.playerId, now());
      return { status: 'completed', paymentId: intent.paymentId };
    } catch (error) {
      return failIntent(intent, error, 'deposit_failed');
    } finally {
      testInFlight.delete(actor.session.playerId);
    }
  }

  async function performWithdraw(
    actor: PaymentActor,
    methodId: string,
    amount: number,
    idempotencyKey: string,
    details: Record<string, string> | undefined,
  ): Promise<PaymentMutationResponse> {
    if (methodId === testDepositMethodId) throw new PaymentError('method_unavailable');
    const player = await readPlayer(platform, actor.session);
    const currency = paymentCurrency(actor.session, player.balance.currency);
    if (toCents(amount) > toCents(player.balance.balance)) {
      throw new PaymentError('insufficient_balance');
    }
    const customer = customerFromProfile(player.profile.profile);
    const option = await resolveWithdrawMethod(actor, player.playerId, currency, customer, methodId);
    if (outsideLimits(amount, option.minAmount, option.maxAmount)) {
      throw new PaymentError('invalid_amount');
    }
    const fields = cleanDetails(option, details);
    if (!config.providerConfigured) throw new PaymentError('withdrawal_unavailable');
    const intent = newIntent({
      actor,
      direction: 'withdraw',
      amount,
      currency,
      methodId,
      paymentId: ids(),
      idempotencyKey,
    });
    intents.insert(intent);
    try {
      const reserved = await platform.requestWithdrawal({
        playerId: player.playerId,
        amount,
        currency,
        transactionReference: intent.paymentId,
        ...(actor.ip ? { ip: actor.ip } : {}),
      });
      intent.platformWithdrawalHash = reserved.hash;
      intent.withdrawalStage = 'requested';
      intent.status = 'processing';
      intents.save(intent);
    } catch (error) {
      const mapped = mapPlatformPaymentError(error, 'withdrawal_unavailable');
      intent.status = 'failed';
      intent.failureCode = mapped.code;
      intents.save(intent);
      throw mapped;
    }
    try {
      const initiated = await provider.init({
        paymentId: intent.paymentId,
        playerId: String(player.playerId),
        direction: 'withdraw',
        amount,
        currency,
        customer,
        ip: actor.ip ?? '',
        browser: actor.browser ?? '',
        locale: actor.locale,
      });
      const submittedMethod = initiated.methods.find((method) => method.id === methodId);
      if (!initiated.providerPaymentId || !submittedMethod?.submitUrl || !submittedMethod.submitChecksum) {
        throw new PaymentError('method_unavailable');
      }
      intent.finalpayId = initiated.providerPaymentId;
      intents.save(intent);
      const submitted = await provider.submit({
        url: submittedMethod.submitUrl,
        checksum: submittedMethod.submitChecksum,
        amount: formatPaymentAmount(amount),
        fields,
      });
      const state = normalizeState(submitted.state);
      if (state && failureStates.has(state)) {
        throw new PaymentError(state === 'CANCELLED' ? 'payment_cancelled' : 'withdrawal_rejected');
      }
      if (state === 'CAPTURED') {
        await confirmWithdrawal(intent);
        return { status: 'completed', paymentId: intent.paymentId };
      }
      intent.status = 'processing';
      intent.resultStatus = 'processing';
      intents.save(intent);
      return { status: 'processing', paymentId: intent.paymentId };
    } catch (error) {
      if (intent.withdrawalStage === 'requested' || intent.withdrawalStage === 'approved') {
        try {
          await rollback(intent);
        } catch {
          intent.failureCode = 'withdrawal_unavailable';
          intents.save(intent);
          throw new PaymentError('withdrawal_unavailable');
        }
      }
      const mapped =
        error instanceof PaymentError &&
        (error.code === 'payment_cancelled' ||
          error.code === 'withdrawal_rejected' ||
          error.code === 'provider_unavailable' ||
          error.code === 'method_unavailable')
          ? error.code === 'method_unavailable'
            ? new PaymentError('provider_unavailable')
            : error
          : new PaymentError('provider_unavailable');
      intent.status = mapped.code === 'payment_cancelled' ? 'cancelled' : 'failed';
      intent.failureCode = mapped.code;
      intents.save(intent);
      throw mapped;
    }
  }

  async function resolveWithdrawMethod(
    actor: PaymentActor,
    playerId: number,
    currency: string,
    customer: PaymentCustomer,
    methodId: string,
  ): Promise<ProviderPaymentMethod> {
    const key = cacheKey(actor.session.playerId, 'withdraw');
    const cached = methodCache.get(key);
    const cachedOption =
      cached && cached.expiresAt > now()
        ? cached.options.find((option) => option.id === methodId)
        : undefined;
    if (cachedOption) return cachedOption;
    if (!config.providerConfigured) throw new PaymentError('withdrawal_unavailable');
    const initiated = await provider.init({
      paymentId: ids(),
      playerId: String(playerId),
      direction: 'withdraw',
      currency,
      customer,
      ip: actor.ip ?? '',
      browser: actor.browser ?? '',
      locale: actor.locale,
    });
    const option = initiated.methods.find((method) => method.id === methodId);
    if (!option) throw new PaymentError('method_unavailable');
    methodCache.set(key, {
      paymentId: ids(),
      providerPaymentId: initiated.providerPaymentId,
      options: initiated.methods,
      expiresAt: now() + methodCacheTtlMs,
    });
    return option;
  }

  async function applyCallback(input: {
    paymentId: string;
    providerPaymentId: number;
    state: string;
  }): Promise<{ ack: 'ok' | 'fail'; outcome: string }> {
    const intent = intents.get(input.paymentId);
    if (!intent) return { ack: 'fail', outcome: 'missing' };
    if (intent.status === 'completed' || intent.status === 'failed' || intent.status === 'cancelled') {
      return { ack: 'ok', outcome: 'duplicate' };
    }
    if (intent.finalpayId === undefined || intent.finalpayId !== input.providerPaymentId) {
      return { ack: 'fail', outcome: 'rejected' };
    }
    const state = normalizeState(input.state) ?? '';
    try {
      if (intent.direction === 'deposit') return await applyDepositCallback(intent, state);
      return await applyWithdrawCallback(intent, state);
    } catch {
      return { ack: 'fail', outcome: 'retry' };
    }
  }

  async function applyDepositCallback(
    intent: PaymentIntentRecord,
    state: string,
  ): Promise<{ ack: 'ok' | 'fail'; outcome: string }> {
    if (state === 'CAPTURED') {
      const playerId = playerIdNumber(intent.playerId);
      if (playerId === undefined) return { ack: 'fail', outcome: 'rejected' };
      await platform.deposit({
        playerId,
        amount: intent.amount,
        currency: intent.currency,
        transactionReference: intent.paymentId,
      });
      intent.status = 'completed';
      intent.resultStatus = 'completed';
      intents.save(intent);
      return { ack: 'ok', outcome: 'completed' };
    }
    if (state === 'CANCELLED') {
      intent.status = 'cancelled';
      intents.save(intent);
      return { ack: 'ok', outcome: 'cancelled' };
    }
    if (failureStates.has(state)) {
      intent.status = 'failed';
      intents.save(intent);
      return { ack: 'ok', outcome: 'failed' };
    }
    return { ack: 'ok', outcome: 'pending' };
  }

  async function applyWithdrawCallback(
    intent: PaymentIntentRecord,
    state: string,
  ): Promise<{ ack: 'ok' | 'fail'; outcome: string }> {
    if (state === 'ACCEPTED') {
      await approveWithdrawal(intent);
      intent.status = 'processing';
      intents.save(intent);
      return { ack: 'ok', outcome: 'approved' };
    }
    if (state === 'CAPTURED') {
      await confirmWithdrawal(intent);
      return { ack: 'ok', outcome: 'completed' };
    }
    if (failureStates.has(state)) {
      await rollback(intent);
      intent.status = state === 'CANCELLED' ? 'cancelled' : 'failed';
      intents.save(intent);
      return { ack: 'ok', outcome: state === 'CANCELLED' ? 'cancelled' : 'rolled_back' };
    }
    return { ack: 'ok', outcome: 'pending' };
  }

  async function approveWithdrawal(intent: PaymentIntentRecord): Promise<void> {
    if (intent.withdrawalStage === 'approved' || intent.withdrawalStage === 'confirmed') return;
    if (!intent.platformWithdrawalHash) throw new PaymentError('withdrawal_unavailable');
    await platform.approveWithdrawal(intent.platformWithdrawalHash);
    intent.withdrawalStage = 'approved';
    intents.save(intent);
  }

  async function confirmWithdrawal(intent: PaymentIntentRecord): Promise<void> {
    if (intent.status === 'completed' || intent.withdrawalStage === 'confirmed') return;
    await approveWithdrawal(intent);
    if (!intent.platformWithdrawalHash) throw new PaymentError('withdrawal_unavailable');
    await platform.confirmWithdrawal(intent.platformWithdrawalHash);
    intent.withdrawalStage = 'confirmed';
    intent.status = 'completed';
    intent.resultStatus = 'completed';
    intents.save(intent);
  }

  async function rollback(intent: PaymentIntentRecord): Promise<void> {
    if (intent.withdrawalStage === 'rolledback' || intent.withdrawalStage === 'confirmed') return;
    if (!intent.platformWithdrawalHash) return;
    await platform.rollbackWithdrawal(intent.platformWithdrawalHash);
    intent.withdrawalStage = 'rolledback';
    intents.save(intent);
  }

  function newIntent(input: {
    actor: PaymentActor;
    direction: PaymentDirection;
    amount: number;
    currency: string;
    methodId: string;
    paymentId: string;
    idempotencyKey: string;
    finalpayId?: number;
  }): PaymentIntentRecord {
    return {
      paymentId: input.paymentId,
      playerId: input.actor.session.playerId,
      direction: input.direction,
      amount: input.amount,
      currency: input.currency,
      methodId: input.methodId,
      status: 'pending',
      ...(input.finalpayId !== undefined ? { finalpayId: input.finalpayId } : {}),
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date(now()).toISOString(),
    };
  }

  function failSaved(
    intent: PaymentIntentRecord,
    status: 'failed' | 'cancelled',
    code: PaymentErrorCode,
  ): never {
    intent.status = status;
    intent.failureCode = code;
    intents.save(intent);
    throw new PaymentError(code);
  }

  function failIntent(
    intent: PaymentIntentRecord,
    error: unknown,
    fallback: PaymentErrorCode,
  ): never {
    const mapped = mapPlatformPaymentError(error, fallback);
    intent.status = mapped.code === 'payment_cancelled' ? 'cancelled' : 'failed';
    intent.failureCode = mapped.code;
    intents.save(intent);
    throw mapped;
  }
}

function replay(intent: PaymentIntentRecord): PaymentMutationResponse {
  if (intent.failureCode) throw new PaymentError(intent.failureCode);
  if (intent.resultStatus === 'redirect' && intent.redirectUrl) {
    return { status: 'redirect', paymentId: intent.paymentId, redirectUrl: intent.redirectUrl };
  }
  if (intent.resultStatus === 'completed' || intent.status === 'completed') {
    return { status: 'completed', paymentId: intent.paymentId };
  }
  if (intent.status === 'failed') throw new PaymentError('deposit_failed');
  if (intent.status === 'cancelled') throw new PaymentError('payment_cancelled');
  return { status: 'processing', paymentId: intent.paymentId };
}

async function readPlayer(platform: PlatformClient, session: PlayerSession) {
  const playerId = playerIdNumber(session.playerId);
  if (playerId === undefined) throw new PaymentError('session_ended');
  try {
    const [profile, balance] = await Promise.all([
      platform.getProfile(playerId, session.accessToken),
      platform.getBalance(playerId, session.accessToken),
    ]);
    if (String(profile.profile.id) !== session.playerId || !Number.isFinite(balance.balance)) {
      throw new PaymentError('provider_unavailable');
    }
    return { playerId, profile, balance };
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    if (isPlayerSessionEnded(error)) throw new PaymentError('session_ended');
    throw new PaymentError('provider_unavailable');
  }
}

function paymentCurrency(session: PlayerSession, balanceCurrency: string): string {
  const preferred = session.currency ?? balanceCurrency;
  const currency = preferred.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new PaymentError('provider_unavailable');
  return currency;
}

function customerFromProfile(profile: PlatformProfileResponse['profile']): PaymentCustomer {
  const text = (value: string | null | undefined) => (typeof value === 'string' ? value : '');
  const prefix = text(profile.phone_prefix);
  const phone = text(profile.phone);
  return {
    firstName: text(profile.first_name),
    lastName: text(profile.last_name),
    email: text(profile.email),
    country: text(profile.country?.alpha2),
    city: text(profile.city),
    address: text(profile.address),
    zip: text(profile.postal_code),
    phone: prefix && phone ? `${prefix}${phone}` : phone || prefix,
    birthdate: text(profile.date_of_birth),
  };
}

function toPublicMethod(method: ProviderPaymentMethod): PaymentMethod {
  return {
    id: method.id,
    label: method.label,
    minAmount: method.minAmount,
    maxAmount: method.maxAmount,
    fields: method.fields.map((field) => ({ name: field.name, label: field.label, required: true })),
    test: false,
  };
}

function testMethod(maxAmount: number): PaymentMethod {
  return {
    id: testDepositMethodId,
    label: 'Test Deposit',
    minAmount: 1,
    maxAmount,
    fields: [],
    test: true,
  };
}

function outsideLimits(amount: number, minAmount: number | null, maxAmount: number | null): boolean {
  if (minAmount !== null && toCents(amount) < toCents(minAmount)) return true;
  if (maxAmount !== null && toCents(amount) > toCents(maxAmount)) return true;
  return false;
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function cleanDetails(
  method: ProviderPaymentMethod,
  details: Record<string, string> | undefined,
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const field of method.fields) {
    const raw = details?.[field.name];
    if (typeof raw !== 'string' || raw.trim() === '') throw new PaymentError('invalid_amount');
    const value =
      field.name === 'iban' || field.name === 'cc' || field.name === 'ccv'
        ? raw.replace(/\s+/g, '')
        : raw.trim();
    if (value.length === 0 || value.length > 200) throw new PaymentError('invalid_amount');
    cleaned[field.name] = value;
  }
  return cleaned;
}

function normalizeState(state: string | null): string | null {
  if (!state) return null;
  const normalized = state.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function mapPlatformPaymentError(error: unknown, fallback: PaymentErrorCode): PaymentError {
  if (error instanceof PaymentError) return error;
  if (
    error instanceof PlatformClientError &&
    error.platformCode === 'insufficient_wallet_balance'
  ) {
    return new PaymentError('insufficient_balance');
  }
  if (isPlayerSessionEnded(error)) return new PaymentError('session_ended');
  return new PaymentError(fallback);
}

function cacheKey(playerId: string, direction: PaymentDirection): string {
  return `${playerId}:${direction}`;
}

function copyIntent(intent: PaymentIntentRecord): PaymentIntentRecord {
  return { ...intent };
}

async function exclusive<T>(
  locks: Map<string, Promise<void>>,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => {}).then(() => gate);
  locks.set(key, tail);
  await previous.catch(() => {});
  try {
    return await run();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}
