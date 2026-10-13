'use client';

import { useCallback, useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogGame, PlayerFavoritesResponse } from '@brand/contracts';
import {
  addFavorite,
  fetchFavorites,
  fetchLastPlayed,
  fetchMostPlayed,
  PersonalizationRequestError,
  removeFavorite,
  type PlayedRequest,
} from '@/data/personalization-browser';
import { useAuthDialog } from '../auth/auth-provider';
import { playerKey, useEndSession, useSession } from '../auth/session';

const inFlightFavorites = new Set<string>();

export const railLimit = 12;
export const libraryLimit = 24;

export function favoritesKey(playerId: string) {
  return [...playerKey, playerId, 'favorites'] as const;
}

export function playedKey(playerId: string, kind: 'last-played' | 'most-played', params: PlayedRequest) {
  return [...playerKey, playerId, kind, params] as const;
}

export function clearFavoriteFlights() {
  inFlightFavorites.clear();
}

function useEndOnSessionError(error: unknown) {
  const endSession = useEndSession();
  const ended = error instanceof PersonalizationRequestError && error.code === 'session_ended';
  useEffect(() => {
    if (ended) endSession();
  }, [ended, endSession]);
}

export function useFavorites() {
  const { status, session } = useSession();
  const playerId = status === 'authenticated' ? session?.playerId : undefined;
  const query = useQuery({
    queryKey: playerId ? favoritesKey(playerId) : [...playerKey, 'idle', 'favorites'],
    queryFn: ({ signal }) => fetchFavorites(signal),
    enabled: Boolean(playerId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEndOnSessionError(query.error);
  return { ...query, status, playerId };
}

export function useFavoriteToggle() {
  const favorites = useFavorites();
  const client = useQueryClient();
  const { openLogin } = useAuthDialog();
  const endSession = useEndSession();
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set(inFlightFavorites));

  const toggle = useCallback(
    async (game: CatalogGame, opener?: HTMLElement | null) => {
      if (favorites.status === 'pending') return;
      if (!favorites.playerId) {
        openLogin(opener);
        return;
      }
      const flightKey = `${favorites.playerId}:${game.id}`;
      if (inFlightFavorites.has(flightKey)) return;
      inFlightFavorites.add(flightKey);
      setPendingIds(new Set(inFlightFavorites));
      const key = favoritesKey(favorites.playerId);
      const previous = client.getQueryData<PlayerFavoritesResponse>(key);
      const saved = previous?.games.some((item) => item.id === game.id) ?? false;
      client.setQueryData<PlayerFavoritesResponse>(key, {
        games: saved
          ? (previous?.games ?? []).filter((item) => item.id !== game.id)
          : [...(previous?.games ?? []), game],
      });
      try {
        if (saved) await removeFavorite(game.id);
        else await addFavorite(game.id);
        await client.invalidateQueries({ queryKey: key });
      } catch (error) {
        if (previous === undefined) client.removeQueries({ queryKey: key, exact: true });
        else client.setQueryData(key, previous);
        if (error instanceof PersonalizationRequestError && error.code === 'session_ended') endSession();
      } finally {
        inFlightFavorites.delete(flightKey);
        setPendingIds(new Set(inFlightFavorites));
      }
    },
    [client, endSession, favorites.playerId, favorites.status, openLogin],
  );

  const favorited = (gameId: string) =>
    favorites.status === 'authenticated' &&
    (favorites.data?.games.some((game) => game.id === gameId) ?? false);
  const isPending = (gameId: string) =>
    favorites.playerId ? pendingIds.has(`${favorites.playerId}:${gameId}`) : false;

  return { status: favorites.status, isPending, favorited, toggle };
}

function usePlayedQuery(kind: 'last-played' | 'most-played', params: PlayedRequest) {
  const { status, session } = useSession();
  const playerId = status === 'authenticated' ? session?.playerId : undefined;
  const query = useQuery({
    queryKey: playerId ? playedKey(playerId, kind, params) : [...playerKey, 'idle', kind, params],
    queryFn: ({ signal }) =>
      (kind === 'last-played' ? fetchLastPlayed(params, signal) : fetchMostPlayed(params, signal)),
    enabled: Boolean(playerId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEndOnSessionError(query.error);
  return query;
}

export function usePlayedRail(kind: 'last-played' | 'most-played') {
  return usePlayedQuery(kind, { limit: railLimit, page: 1 });
}

export function usePlayedLibrary(kind: 'last-played' | 'most-played') {
  const { status, session } = useSession();
  const playerId = status === 'authenticated' ? session?.playerId : undefined;
  const params = { limit: libraryLimit };
  const query = useInfiniteQuery({
    queryKey: playerId ? playedKey(playerId, kind, params) : [...playerKey, 'idle', kind, params],
    queryFn: ({ pageParam, signal }) => {
      const request = { ...params, page: pageParam };
      return kind === 'last-played' ? fetchLastPlayed(request, signal) : fetchMostPlayed(request, signal);
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.hasNextPage ? last.pagination.page + 1 : undefined),
    enabled: Boolean(playerId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEndOnSessionError(query.error);
  return query;
}
