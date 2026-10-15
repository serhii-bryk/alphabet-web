'use client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AuthSession, SessionResponse } from '@brand/contracts';
import {
  AccountRequestError,
  fetchBalance,
  fetchProfile,
  fetchSession,
  guestSession,
  login,
  logout,
  type LoginInput,
} from '@/data/auth-browser';
import { clearDeviceClock, clearPlayerControlReceipt } from '../player-control/storage';

export const sessionKey = ['session'] as const;
export const accountKey = ['account'] as const;
export const playerKey = ['player'] as const;
const responsibleGamingKey = ['responsible-gaming'] as const;

function releasePlayerClock(client: QueryClient, playerId: string | null) {
  if (playerId) clearDeviceClock(playerId);
  client.removeQueries({ queryKey: responsibleGamingKey });
}
export const profileKey = ['account', 'profile'] as const;
export const balanceKey = ['account', 'balance'] as const;

export type SessionStatus = 'pending' | 'guest' | 'authenticated';

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function useSession() {
  const query = useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => fetchSession(signal),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const session = query.data;
  const hydrated = useHydrated();
  const resolved: SessionStatus = session
    ? session.authenticated
      ? 'authenticated'
      : 'guest'
    : query.isPending
      ? 'pending'
      : 'guest';
  // The server always renders the loading state. Matching that on the first
  // client render keeps the hero and header from hydrating into a different tree.
  const status: SessionStatus = hydrated ? resolved : 'pending';
  return { status, session: status === 'authenticated' && session?.authenticated ? session : null, query };
}

export function useEndSession() {
  const client = useQueryClient();
  return useCallback(() => {
    // A session fetch started before sign-out must not restore the old session.
    const current = client.getQueryData<SessionResponse>(sessionKey);
    releasePlayerClock(client, current?.authenticated ? current.playerId : null);
    void client.cancelQueries({ queryKey: sessionKey }, { revert: false, silent: true });
    client.setQueryData<SessionResponse>(sessionKey, guestSession);
    client.removeQueries({ queryKey: accountKey });
    client.removeQueries({ queryKey: playerKey });
  }, [client]);
}

function useAccountQuery<T>(
  key: readonly string[],
  fetcher: (signal: AbortSignal) => Promise<T>,
) {
  const { status } = useSession();
  const endSession = useEndSession();
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetcher(signal),
    enabled: status === 'authenticated',
    retry: false,
    refetchOnWindowFocus: false,
  });
  const ended = query.error instanceof AccountRequestError && query.error.code === 'session_ended';
  useEffect(() => {
    if (ended) endSession();
  }, [ended, endSession]);
  return query;
}

export function useProfile() {
  return useAccountQuery(profileKey, fetchProfile);
}

export function useBalance() {
  return useAccountQuery(balanceKey, fetchBalance);
}

export function applyAuthenticatedSession(client: QueryClient, session: AuthSession) {
  clearPlayerControlReceipt();
  releasePlayerClock(client, session.playerId);
  client.removeQueries({ queryKey: playerKey });
  client.setQueryData<SessionResponse>(sessionKey, session);
  void client.invalidateQueries({ queryKey: accountKey });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: (session) => {
      applyAuthenticatedSession(client, session);
    },
  });
}

export function useLogout() {
  const endSession = useEndSession();
  return useMutation({
    mutationFn: () => logout(),
    onSettled: endSession,
  });
}
