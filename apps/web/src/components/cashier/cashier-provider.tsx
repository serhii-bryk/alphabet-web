'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PaymentStatusResponse } from '@brand/contracts';
import { WalletCards } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fetchPaymentStatus } from '@/data/payments-browser';
import { accountKey, useSession } from '../auth/session';
import { Button } from '../ui';
import { CashierDialog, type CashierTab } from './cashier-dialog';

interface CashierApi {
  openCashier: (tab?: CashierTab, amount?: string) => void;
}

const CashierContext = createContext<CashierApi>({ openCashier: () => {} });
const locationListeners = new Set<() => void>();

function subscribeLocation(onChange: () => void) {
  locationListeners.add(onChange);
  return () => locationListeners.delete(onChange);
}

function notifyLocation() {
  for (const listener of locationListeners) listener();
}

function locationSearch() {
  return window.location.search;
}

function parseCashierReturn(search: string): { cashier: CashierTab; paymentId: string } | null {
  const params = new URLSearchParams(search);
  const cashier = params.get('cashier');
  const paymentId = params.get('paymentId');
  if ((cashier !== 'deposit' && cashier !== 'withdraw') || !paymentId) return null;
  return { cashier, paymentId };
}

export function useCashier() {
  return useContext(CashierContext);
}

export function CashierProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CashierTab>('deposit');
  const [amountSeed, setAmountSeed] = useState('');
  const [generation, setGeneration] = useState(0);
  const [returnStatus, setReturnStatus] = useState<PaymentStatusResponse | 'loading' | null>(null);
  const [handledSearch, setHandledSearch] = useState<string | null>(null);
  const [returnRequest, setReturnRequest] = useState<{ cashier: CashierTab; paymentId: string } | null>(null);
  const client = useQueryClient();
  const search = useSyncExternalStore(subscribeLocation, locationSearch, () => '');
  const incoming = parseCashierReturn(search);
  if (incoming && search !== handledSearch) {
    setHandledSearch(search);
    setReturnRequest(incoming);
    setTab(incoming.cashier);
    setReturnStatus('loading');
    setGeneration((current) => current + 1);
    setOpen(true);
  }

  const openCashier = useCallback((next: CashierTab = 'deposit', amount?: string) => {
    setTab(next);
    setAmountSeed(amount ?? '');
    setReturnStatus(null);
    setGeneration((current) => current + 1);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!returnRequest) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('cashier');
    url.searchParams.delete('result');
    url.searchParams.delete('paymentId');
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (`${url.pathname}${window.location.search}${url.hash}` !== nextUrl) {
      window.history.replaceState(null, '', nextUrl);
      notifyLocation();
    }
    let cancelled = false;
    void fetchPaymentStatus(returnRequest.paymentId)
      .then((status) => {
        if (!cancelled) setReturnStatus(status);
      })
      .catch(() => {
        if (!cancelled) setReturnStatus({ status: 'pending', direction: returnRequest.cashier });
      })
      .finally(() => {
        void client.invalidateQueries({ queryKey: accountKey });
      });
    return () => {
      cancelled = true;
    };
  }, [client, returnRequest]);

  const api = useMemo(() => ({ openCashier }), [openCashier]);
  return (
    <CashierContext.Provider value={api}>
      {children}
      {open && (
        <CashierDialog
          key={generation}
          initialTab={tab}
          initialAmount={amountSeed}
          returnStatus={returnStatus}
          onClose={() => setOpen(false)}
        />
      )}
    </CashierContext.Provider>
  );
}

export function DepositButton({
  compact = false,
  dense = false,
  appearance = 'nav',
  onNavigate,
}: {
  compact?: boolean;
  dense?: boolean;
  appearance?: 'nav' | 'header';
  onNavigate?: () => void;
}) {
  const { status } = useSession();
  const { openCashier } = useCashier();
  const t = useTranslations('shell');
  // Guests and the pre-hydration render never see Deposit, so it cannot flash in and out.
  if (status !== 'authenticated') return null;
  const open = () => {
    onNavigate?.();
    openCashier('deposit');
  };
  if (appearance === 'header') {
    return (
      <Button
        type="button"
        className={`fade-enter shrink-0 ${dense ? 'h-9 px-2.5 text-xs' : ''}`}
        onClick={open}
      >
        <WalletCards aria-hidden size={dense ? 14 : 16} className={dense ? 'max-[380px]:hidden' : undefined} />
        {t('deposit')}
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      aria-label={compact ? t('deposit') : undefined}
      className="nav-item flex h-11 w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-semibold"
    >
      <span className="grid size-5 shrink-0 place-items-center">
        <WalletCards size={18} aria-hidden />
      </span>
      {!compact && t('deposit')}
    </button>
  );
}
