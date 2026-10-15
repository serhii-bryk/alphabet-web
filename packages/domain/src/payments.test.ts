import type { PlatformClient } from '@brand/platform';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentProvider, PlayerSession } from './index.js';
import {
  createMemoryPaymentIntentStore,
  createPaymentUseCases,
  isMockPaymentsEnabled,
  isTestDepositEnabled,
  resolveTestMaxAmount,
} from './payments.js';

const session: PlayerSession = {
  accessToken: 'token',
  playerId: '42',
  email: 'player@example.com',
  currency: 'EUR',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

function platform(overrides: Partial<PlatformClient> = {}): PlatformClient {
  return {
    getRegistrationCountries: vi.fn(),
    getRegistrationCurrencies: vi.fn(),
    register: vi.fn(),
    activateEmail: vi.fn(),
    getGames: vi.fn(),
    getProviders: vi.fn(),
    getCategories: vi.fn(),
    launchDemoGame: vi.fn(),
    launchRealGame: vi.fn(),
    requestSportsLaunchTicket: vi.fn(),
    login: vi.fn(),
    authenticateTelegram: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getProfile: vi.fn(async () => ({
      profile: {
        id: 42,
        email: 'player@example.com',
        currency: { id: 1, name: 'Euro', code: 'EUR', symbol: '€' },
      },
    })),
    getBalance: vi.fn(async () => ({ balance: 100, currency: 'EUR' })),
    deposit: vi.fn(async () => ({ balance: 120, amount: 20, currency: 'EUR' })),
    requestWithdrawal: vi.fn(),
    approveWithdrawal: vi.fn(),
    confirmWithdrawal: vi.fn(),
    rollbackWithdrawal: vi.fn(),
    listFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    lastPlayed: vi.fn(),
    mostPlayed: vi.fn(),
    getRealityCheckSettings: vi.fn(),
    getPlayerRealityCheck: vi.fn(),
    setPlayerRealityCheck: vi.fn(),
    getCoolOffSettings: vi.fn(),
    getSelfExclusionSettings: vi.fn(),
    excludePlayer: vi.fn(),
    getPlayerLogins: vi.fn(),
    ...overrides,
  };
}

const provider: PaymentProvider = { init: vi.fn(), submit: vi.fn() };

describe('payment config guards', () => {
  it('falls back when the test maximum is missing or out of range', () => {
    expect(resolveTestMaxAmount(undefined)).toBe(50);
    expect(resolveTestMaxAmount('0')).toBe(50);
    expect(resolveTestMaxAmount('-1')).toBe(50);
    expect(resolveTestMaxAmount('1001')).toBe(50);
    expect(resolveTestMaxAmount('25')).toBe(25);
  });

  it('enables test deposit only outside production', () => {
    expect(isTestDepositEnabled('true', 'test')).toBe(true);
    expect(isTestDepositEnabled('true', 'production')).toBe(false);
    expect(isTestDepositEnabled('false', 'test')).toBe(false);
    expect(isTestDepositEnabled(undefined, 'test')).toBe(false);
  });

  it('enables mock payments only outside production', () => {
    expect(isMockPaymentsEnabled('true', 'development')).toBe(true);
    expect(isMockPaymentsEnabled('true', 'production')).toBe(false);
    expect(isMockPaymentsEnabled('false', 'development')).toBe(false);
  });
});

describe('payment callbacks', () => {
  it('credits the stored deposit amount once', async () => {
    const client = platform();
    const intents = createMemoryPaymentIntentStore();
    intents.insert({
      paymentId: '11111111-1111-4111-8111-111111111111',
      playerId: '42',
      direction: 'deposit',
      amount: 20,
      currency: 'EUR',
      methodId: '7',
      status: 'processing',
      finalpayId: 9001,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const payments = createPaymentUseCases(client, provider, intents, {
      providerConfigured: true,
      testMode: false,
      testMaxAmount: 50,
      mockMode: false,
    });
    const callback = {
      paymentId: '11111111-1111-4111-8111-111111111111',
      providerPaymentId: 9001,
      state: 'CAPTURED',
    };

    expect(await payments.handleCallback(callback)).toEqual({ ack: 'ok', outcome: 'completed' });
    expect(await payments.handleCallback(callback)).toEqual({ ack: 'ok', outcome: 'duplicate' });
    expect(client.deposit).toHaveBeenCalledTimes(1);
    expect(client.deposit).toHaveBeenCalledWith({
      playerId: 42,
      amount: 20,
      currency: 'EUR',
      transactionReference: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('does not credit a declined deposit', async () => {
    const client = platform();
    const intents = createMemoryPaymentIntentStore();
    intents.insert({
      paymentId: '11111111-1111-4111-8111-111111111111',
      playerId: '42',
      direction: 'deposit',
      amount: 20,
      currency: 'EUR',
      methodId: '7',
      status: 'processing',
      finalpayId: 9001,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const payments = createPaymentUseCases(client, provider, intents, {
      providerConfigured: true,
      testMode: false,
      testMaxAmount: 50,
      mockMode: false,
    });

    expect(
      await payments.handleCallback({
        paymentId: '11111111-1111-4111-8111-111111111111',
        providerPaymentId: 9001,
        state: 'DECLINED',
      }),
    ).toEqual({ ack: 'ok', outcome: 'failed' });
    expect(client.deposit).not.toHaveBeenCalled();
    expect((await payments.status({ session, locale: 'en' }, '11111111-1111-4111-8111-111111111111')).status).toBe(
      'failed',
    );
  });
});

describe('development mock payments', () => {
  const config = { providerConfigured: false, testMode: false, testMaxAmount: 50, mockMode: true };

  it('lists mock methods and leaves a deposit pending without a ledger credit', async () => {
    const client = platform();
    const payments = createPaymentUseCases(client, provider, createMemoryPaymentIntentStore(), config);
    const methods = await payments.listMethods({ session, locale: 'en' });
    expect(methods.depositMethods.map((method) => method.id)).toEqual(['mock-card']);
    expect(methods.withdrawMethods.map((method) => method.id)).toEqual(['mock-bank']);
    expect(methods.depositMethods[0]?.mock).toBe(true);
    const result = await payments.deposit(
      { session, locale: 'en' },
      { methodId: 'mock-card', amount: 20, idempotencyKey: '33333333-3333-4333-8333-333333333333' },
    );
    expect(result.status).toBe('processing');
    expect(client.deposit).not.toHaveBeenCalled();
    expect(provider.init).not.toHaveBeenCalled();
    expect(provider.submit).not.toHaveBeenCalled();
  });

  it('keeps a mock withdrawal pending without reserving the wallet', async () => {
    const client = platform();
    const payments = createPaymentUseCases(client, provider, createMemoryPaymentIntentStore(), config);
    const result = await payments.withdraw(
      { session, locale: 'en' },
      {
        methodId: 'mock-bank',
        amount: 20,
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
        details: { account: 'dev-account' },
      },
    );
    expect(result.status).toBe('processing');
    expect((await payments.status({ session, locale: 'en' }, result.paymentId)).status).toBe('processing');
    expect(client.requestWithdrawal).not.toHaveBeenCalled();
    await expect(
      payments.withdraw(
        { session, locale: 'en' },
        {
          methodId: 'mock-bank',
          amount: 150,
          idempotencyKey: '55555555-5555-4555-8555-555555555555',
          details: { account: 'dev-account' },
        },
      ),
    ).rejects.toMatchObject({ code: 'insufficient_balance' });
  });
});
