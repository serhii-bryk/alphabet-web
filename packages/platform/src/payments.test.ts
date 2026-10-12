import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformClient, type PlatformClientError } from './index.js';

const currency = { id: 2, name: 'Euro', code: 'EUR', symbol: '€' };

function client(fetcher: typeof fetch) {
  return createPlatformClient({
    baseUrl: 'https://platform.example/api/v1/',
    apiKey: 'key',
    apiSecret: 'secret',
    fetch: fetcher,
    now: () => 1_700_000_000_000,
  });
}

describe('platform payments', () => {
  it('signs a deposit and drops ledger addresses from the result', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        type: 'deposit',
        balance: 30,
        amount: 20,
        currency: 'EUR',
        address: 'hidden-address',
        transaction_id: 'hidden-transaction',
      }),
    );
    const result = await client(fetcher).deposit({
      playerId: 42,
      amount: 20,
      currency: 'EUR',
      transactionReference: 'payment-1',
    });

    expect(result).toEqual({ balance: 30, amount: 20, currency: 'EUR' });
    expect(result).not.toHaveProperty('address');
    expect(result).not.toHaveProperty('transaction_id');
    const body = '{"player_id":42,"amount":20,"currency":"EUR","transaction_reference":"payment-1"}';
    const [, init] = fetcher.mock.calls[0]!;
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://platform.example/api/v1/transactions/deposit');
    expect(init?.body).toBe(body);
    const bodyHash = createHash('sha256').update(body).digest('hex');
    expect((init?.headers as Record<string, string>)['X-SIGNATURE']).toBe(
      createHmac('sha256', 'secret')
        .update(`POST\n/api/v1/transactions/deposit\n1700000000\n${bodyHash}`)
        .digest('base64'),
    );
  });

  it('keeps only the stable wallet error code', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        { error: { code: 'insufficient_wallet_balance', message: 'hidden upstream text', context: { hash: 'secret' } } },
        { status: 422 },
      ),
    );
    await expect(
      client(fetcher).requestWithdrawal({
        playerId: 42,
        amount: 20,
        currency: 'EUR',
        transactionReference: 'payment-2',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PlatformClientError>>({
        code: 'request_failed',
        status: 422,
        platformCode: 'insufficient_wallet_balance',
      }),
    );
  });

  it('parses a profile that omits the extra cashier fields', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        profile: { id: 42, email: 'player@example.com', currency },
      }),
    );
    const profile = await client(fetcher).getProfile(42, 'token');
    expect(profile.profile).toEqual({ id: 42, email: 'player@example.com', currency });
    expect(profile.profile).not.toHaveProperty('phone');
  });
});
