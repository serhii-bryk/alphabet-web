import { createHash, timingSafeEqual } from 'node:crypto';
import { PaymentError, formatPaymentAmount } from '@brand/domain';
import type { PaymentCustomer, PaymentProvider, ProviderPaymentMethod } from '@brand/domain';
import type { PaymentsConfig } from './payments-config.js';

const timeoutMs = 15_000;

export function createFinalpayClient(
  config: PaymentsConfig,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): PaymentProvider {
  return {
    async init(input) {
      if (!config.providerConfigured || !config.finalpayUrl || !config.finalpaySecret || !config.callbackBaseUrl) {
        throw new PaymentError('provider_unavailable');
      }
      const requestType = input.direction === 'deposit' ? 'pay-in' : 'pay-out';
      const transRef = `${config.transactionPrefix}${input.paymentId}`;
      const customerRef = `${config.userPrefix}${input.playerId}`;
      const callbackUrl = `${config.callbackBaseUrl}/payments/callback/${input.paymentId}`;
      const successUrl = browserReturnUrl(config.webOrigin, input.direction, 'success', input.paymentId);
      const cancelUrl = browserReturnUrl(config.webOrigin, input.direction, 'cancelled', input.paymentId);
      const amountString = input.amount === undefined ? '' : formatPaymentAmount(input.amount);
      const checksum = sha256Hex(
        callbackUrl +
          successUrl +
          successUrl +
          cancelUrl +
          requestType +
          transRef +
          amountString +
          input.currency +
          '' +
          customerRef +
          input.customer.firstName +
          input.customer.lastName +
          input.customer.email +
          input.customer.country +
          input.customer.city +
          input.customer.address +
          input.customer.zip +
          input.customer.phone +
          input.customer.birthdate +
          input.ip +
          config.finalpaySecret,
      );
      const pay: Record<string, string | number> = {
        request_type: requestType,
        trans_ref: transRef,
        currency: input.currency,
      };
      if (input.amount !== undefined) pay.amount = input.amount;
      const body = await postJson(fetchImpl, `${config.finalpayUrl}/init`, {
        checksum,
        domain: config.webOrigin,
        data: {
          brand_name: config.brandName,
          pay,
          customer: customerBody(input.customer, customerRef, input.ip, input.browser),
          callback_url: callbackUrl,
          success_url: successUrl,
          error_url: successUrl,
          cancelled_url: cancelUrl,
        },
      });
      if (body.status !== 'OK') throw new PaymentError('provider_unavailable');
      const providerPaymentId = positiveInt(body.id);
      return {
        providerPaymentId,
        methods: mapOptions(body.options, input.currency, config.finalpayUrl),
      };
    },

    async submit(input) {
      const payload: Record<string, string> = {
        amount: input.amount,
        checksum: input.checksum,
        ...input.fields,
      };
      const body = await postJson(fetchImpl, input.url, payload);
      if (body.status === 'ERROR' || hasErrors(body.errors)) {
        throw new PaymentError('provider_unavailable');
      }
      const redirectUrl = readRedirect(body.url, body.redirect_url);
      const state = typeof body.state === 'string' ? body.state : null;
      return { redirectUrl, state };
    },
  };
}

export function callbackChecksumMatches(
  providerPaymentId: string,
  state: string,
  checksum: string,
  secret: string,
): boolean {
  const expected = sha256Hex(providerPaymentId + state + secret);
  return safeEqual(expected.toLowerCase(), checksum.trim().toLowerCase());
}

function customerBody(
  customer: PaymentCustomer,
  customerRef: string,
  ip: string,
  browser: string,
) {
  return {
    customer_ref: customerRef,
    first_name: customer.firstName,
    last_name: customer.lastName,
    email: customer.email,
    country: customer.country,
    city: customer.city,
    address: customer.address,
    zip: customer.zip,
    phone: customer.phone,
    birthdate: customer.birthdate,
    requestor_ip: ip,
    requestor_browser: browser,
  };
}

function browserReturnUrl(
  webOrigin: string,
  direction: 'deposit' | 'withdraw',
  result: 'success' | 'cancelled' | 'failed',
  paymentId: string,
): string {
  const url = new URL('/casino', webOrigin);
  url.searchParams.set('cashier', direction);
  url.searchParams.set('result', result);
  url.searchParams.set('paymentId', paymentId);
  return url.toString();
}

async function postJson(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new PaymentError('provider_unavailable');
  }
  if (!response.ok) throw new PaymentError('provider_unavailable');
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new PaymentError('provider_unavailable');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError('provider_unavailable');
  }
}

function mapOptions(value: unknown, currency: string, baseUrl: string): ProviderPaymentMethod[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => mapOption(option, currency, baseUrl));
}

function mapOption(value: unknown, currency: string, baseUrl: string): ProviderPaymentMethod[] {
  if (typeof value !== 'object' || value === null) return [];
  const option = value as Record<string, unknown>;
  const id = option.id;
  if (typeof id !== 'number' && typeof id !== 'string') return [];
  const label = text(option.name) || text(option.textid) || 'Payment';
  const fields = mapFields(option.newfields);
  const limits = limitsFor(option.details, currency);
  const ownUrl = firstUrl(option.url, option.newsubmit, baseUrl);
  const suboptions = Array.isArray(option.suboptions) ? option.suboptions : [];
  if (suboptions.length > 0) {
    return suboptions.flatMap((sub) => {
      if (typeof sub !== 'object' || sub === null) return [];
      const record = sub as Record<string, unknown>;
      if (typeof record.id !== 'number' && typeof record.id !== 'string') return [];
      const submitUrl = firstUrl(record.url, ownUrl, baseUrl);
      const submitChecksum = submitUrl ? checksumFrom(submitUrl) : null;
      if (!submitUrl || !submitChecksum) return [];
      return [
        {
          id: `${id}:${record.id}`,
          label: text(record.name) || label,
          minAmount: limits.minAmount,
          maxAmount: limits.maxAmount,
          fields,
          submitUrl,
          submitChecksum,
        },
      ];
    });
  }
  const submitChecksum = ownUrl ? checksumFrom(ownUrl) : null;
  if (!ownUrl || !submitChecksum) return [];
  return [
    {
      id: String(id),
      label,
      minAmount: limits.minAmount,
      maxAmount: limits.maxAmount,
      fields,
      submitUrl: ownUrl,
      submitChecksum,
    },
  ];
}

function mapFields(value: unknown): { name: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((field) => {
    if (typeof field !== 'object' || field === null) return [];
    const record = field as Record<string, unknown>;
    const name = text(record.name);
    if (!name || name.length > 40) return [];
    return [{ name, label: text(record.text) || name }];
  });
}

function limitsFor(value: unknown, currency: string): { minAmount: number | null; maxAmount: number | null } {
  if (typeof value !== 'object' || value === null) return { minAmount: null, maxAmount: null };
  const details = value as Record<string, unknown>;
  const entry = details[currency] ?? details[currency.toUpperCase()] ?? details[currency.toLowerCase()];
  if (typeof entry !== 'object' || entry === null) return { minAmount: null, maxAmount: null };
  const record = entry as Record<string, unknown>;
  return { minAmount: bound(record.amount_min), maxAmount: bound(record.amount_max) };
}

function bound(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function firstUrl(primary: unknown, secondary: unknown, baseUrl: string): string | null {
  const raw = text(primary) || text(secondary);
  if (!raw) return null;
  try {
    return new URL(raw, `${baseUrl}/`).toString();
  } catch {
    return null;
  }
}

function checksumFrom(url: string): string | null {
  try {
    const hash = new URL(url).searchParams.get('hash');
    return hash && hash.length > 0 && hash.length <= 256 ? hash : null;
  } catch {
    return null;
  }
}

function readRedirect(url: unknown, redirectUrl: unknown): string | null {
  const raw = text(url) || text(redirectUrl);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') throw new PaymentError('provider_unavailable');
    return parsed.toString();
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError('provider_unavailable');
  }
}

function hasErrors(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}
