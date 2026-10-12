'use client';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentErrorCode, PaymentMethod, PaymentStatusResponse } from '@brand/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { LoaderCircle } from 'lucide-react';
import { PaymentRequestError, fetchPaymentMethods, submitDeposit, submitWithdraw } from '@/data/payments-browser';
import { AuthDialog } from '../auth/auth-dialog';
import { accountKey, useBalance } from '../auth/session';
import { Button } from '../ui';

const inputClass =
  'h-11 w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-3 text-base text-[var(--text)] outline-none focus-visible:border-[var(--accent)] aria-[invalid=true]:border-[var(--danger)]';
const presets = [5, 10, 20, 50];

export type CashierTab = 'deposit' | 'withdraw';

export function CashierDialog({
  initialTab,
  returnStatus,
  onClose,
}: {
  initialTab: CashierTab;
  returnStatus: PaymentStatusResponse | 'loading' | null;
  onClose: () => void;
}) {
  const t = useTranslations('cashier');
  const locale = useLocale();
  const balance = useBalance();
  const client = useQueryClient();
  const amountId = useId();
  const errorId = useId();
  const [tab, setTab] = useState<CashierTab>(initialTab);
  const [methodId, setMethodId] = useState('');
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = useRef(false);

  const methods = useQuery({
    queryKey: ['payments', 'methods'],
    queryFn: ({ signal }) => fetchPaymentMethods(signal),
    retry: false,
  });
  const list = tab === 'deposit' ? methods.data?.depositMethods : methods.data?.withdrawMethods;
  const selected = list?.find((method) => method.id === methodId) ?? list?.[0];

  const mutation = useMutation({
    mutationFn: async (input: { method: PaymentMethod; value: number; fields: Record<string, string> }) => {
      const idempotencyKey = crypto.randomUUID();
      if (tab === 'deposit') {
        return submitDeposit({ methodId: input.method.id, amount: input.value, idempotencyKey });
      }
      return submitWithdraw({
        methodId: input.method.id,
        amount: input.value,
        idempotencyKey,
        ...(Object.keys(input.fields).length > 0 ? { details: input.fields } : {}),
      });
    },
    onSuccess: (result) => {
      if (result.status === 'completed' || (tab === 'withdraw' && result.status === 'processing')) {
        void client.invalidateQueries({ queryKey: accountKey });
      }
      if (result.status === 'redirect' && result.redirectUrl) {
        window.location.assign(result.redirectUrl);
      }
    },
  });

  const serverError = mutation.error instanceof PaymentRequestError ? mutation.error.code : mutation.error ? 'provider_unavailable' : null;
  const errorText = localError ?? (serverError ? messageFor(t, serverError) : null);
  const returnText = returnCopy(t, returnStatus);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || mutation.isPending || !selected) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || !withinLimits(value, selected)) {
      setLocalError(t('invalidAmount'));
      return;
    }
    if (tab === 'withdraw' && selected.fields.some((field) => field.required && !(details[field.name] ?? '').trim())) {
      setLocalError(t('detailsRequired'));
      return;
    }
    setLocalError(null);
    busy.current = true;
    mutation.mutate(
      { method: selected, value, fields: details },
      { onSettled: () => { busy.current = false; } },
    );
  };

  return (
    <AuthDialog title={t('title')} description={t(tab)} onClose={onClose} panelClassName="sm:max-w-lg">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--muted)]">{t('balance')}</span>
        <span data-testid="cashier-balance" className="text-lg font-black tabular-nums">
          {balance.data ? formatMoney(balance.data.balance, balance.data.currency, locale) : '—'}
        </span>
      </div>
      <div role="tablist" aria-label={t('title')} className="mb-4 grid grid-cols-2 gap-2">
        {(['deposit', 'withdraw'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className="h-11 rounded-[var(--radius-md)] border border-[var(--line)] text-sm font-semibold"
            style={{
              background: tab === item ? 'var(--text)' : 'var(--surface)',
              color: tab === item ? 'var(--bg)' : 'var(--muted)',
            }}
            onClick={() => {
              setTab(item);
              setLocalError(null);
              mutation.reset();
            }}
          >
            {t(item)}
          </button>
        ))}
      </div>
      {returnText && (
        <p role="status" className="mb-4 text-sm text-[var(--muted)]">
          {returnText}
        </p>
      )}
      {methods.isPending ? (
        <p role="status" className="text-sm text-[var(--muted)]">
          {t('loadingMethods')}
        </p>
      ) : methods.isError || !list ? (
        <p role="alert" className="text-sm text-[var(--muted)]">
          {t('methodsError')}
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t('noMethods')}</p>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {list.map((method) => (
              <label
                key={method.id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--line)] px-3 text-sm font-semibold"
              >
                <input
                  type="radio"
                  name="payment-method"
                  value={method.id}
                  checked={selected?.id === method.id}
                  onChange={() => setMethodId(method.id)}
                />
                <span className="min-w-0 flex-1">{method.label}</span>
                {method.test && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {t('testOnly')}
                  </span>
                )}
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={amountId} className="text-sm font-semibold">
              {t('amount')}
            </label>
            <div className="flex flex-wrap gap-2">
              {presets.filter((value) => selected && withinLimits(value, selected)).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="h-10 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold"
                  onClick={() => setAmount(String(value))}
                >
                  {value}
                </button>
              ))}
            </div>
            <input
              id={amountId}
              inputMode="decimal"
              autoComplete="transaction-amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={errorText ? true : undefined}
              aria-describedby={errorText ? errorId : undefined}
              className={inputClass}
            />
            {selected && (
              <p className="text-xs text-[var(--muted)]">{limitCopy(t, selected)}</p>
            )}
          </div>
          {tab === 'withdraw' &&
            selected?.fields.map((field) => (
              <div key={field.name} className="flex flex-col gap-1.5">
                <label htmlFor={`${amountId}-${field.name}`} className="text-sm font-semibold">
                  {field.label}
                </label>
                <input
                  id={`${amountId}-${field.name}`}
                  value={details[field.name] ?? ''}
                  required={field.required}
                  autoComplete="off"
                  className={inputClass}
                  onChange={(event) =>
                    setDetails((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                />
              </div>
            ))}
          {errorText && (
            <p id={errorId} role="alert" className="text-sm text-[var(--danger,var(--muted))]">
              {errorText}
            </p>
          )}
          {mutation.data?.status === 'completed' && (
            <p role="status" className="text-sm font-semibold">
              {t('depositComplete')}
            </p>
          )}
          {mutation.data?.status === 'processing' && (
            <p role="status" className="text-sm font-semibold">
              {t('withdrawProcessing')}
            </p>
          )}
          <Button type="submit" disabled={mutation.isPending} aria-busy={mutation.isPending || undefined}>
            {mutation.isPending && <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" size={16} />}
            {mutation.isPending
              ? t('submitting')
              : tab === 'withdraw'
                ? t('confirmWithdraw')
                : selected?.test
                  ? t('addTestFunds')
                  : t('confirmDeposit')}
          </Button>
        </form>
      )}
    </AuthDialog>
  );
}

function formatMoney(balance: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(balance);
  } catch {
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(balance)} ${currency}`;
  }
}

function withinLimits(amount: number, method: PaymentMethod): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 1e-6) return false;
  if (method.minAmount !== null && cents < Math.round(method.minAmount * 100)) return false;
  if (method.maxAmount !== null && cents > Math.round(method.maxAmount * 100)) return false;
  return true;
}

type CashierText = ReturnType<typeof useTranslations<'cashier'>>;

function limitCopy(t: CashierText, method: PaymentMethod): string {
  if (method.minAmount !== null && method.maxAmount !== null) {
    return t('limits', { min: method.minAmount, max: method.maxAmount });
  }
  if (method.minAmount !== null) return t('minOnly', { min: method.minAmount });
  if (method.maxAmount !== null) return t('maxOnly', { max: method.maxAmount });
  return '';
}

function messageFor(t: CashierText, code: PaymentErrorCode): string {
  switch (code) {
    case 'invalid_amount':
      return t('invalid_amount');
    case 'insufficient_balance':
      return t('insufficient_balance');
    case 'method_unavailable':
      return t('method_unavailable');
    case 'provider_unavailable':
      return t('provider_unavailable');
    case 'deposit_failed':
      return t('deposit_failed');
    case 'payment_cancelled':
      return t('payment_cancelled');
    case 'withdrawal_rejected':
      return t('withdrawal_rejected');
    case 'withdrawal_unavailable':
      return t('withdrawal_unavailable');
    case 'duplicate_request':
      return t('duplicate_request');
    case 'session_ended':
      return t('session_ended');
    default:
      return t('provider_unavailable');
  }
}

function returnCopy(t: CashierText, status: PaymentStatusResponse | 'loading' | null): string | null {
  if (!status) return null;
  if (status === 'loading' || status.status === 'pending' || status.status === 'processing') return t('confirming');
  if (status.status === 'completed') return t('depositComplete');
  if (status.status === 'cancelled') return t('cancelled');
  return t('failed');
}
