'use client';
import { useEffect, useRef, useState } from 'react';
import { Search as SearchIcon, X } from 'lucide-react';
import type { CatalogGame } from '@brand/contracts';
import { searchCatalogInBrowser } from '@/data/catalog-browser';
import { GameThumbnail } from './game-card';
import { Skeleton } from './ui';

export function SearchInput({
  value,
  onChange,
  onFocus,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  compact?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 ${compact ? 'h-10' : 'h-12'}`}
    >
      <SearchIcon size={17} className="text-[var(--muted)]" />
      <span className="sr-only">Search games</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder="Search games or providers"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      <kbd className="hidden rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] sm:block">
        ⌘K
      </kbd>
    </label>
  );
}
export function SearchResults({
  games,
  query,
  loading = false,
  error = false,
}: {
  games: CatalogGame[];
  query: string;
  loading?: boolean;
  error?: boolean;
}) {
  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading search results" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="aspect-[16/11] w-full" />)}
      </div>
    );
  }
  if (error) {
    return <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">Search is temporarily unavailable. Please try again.</p>;
  }
  if (!games.length) {
    return <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">No games match “{query}”. Try another title or provider.</p>;
  }
  return (
    <div>
      <p className="mb-4 text-sm text-[var(--muted)]">
        {query ? `${games.length} results for “${query}”` : 'Browse games'}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {games.map((game) => (
          <div
            key={game.id}
            className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-2"
          >
            <GameThumbnail game={game} />
            <strong className="mt-2 block truncate text-sm">{game.title}</strong>
            <span className="block truncate text-xs text-[var(--muted)]">{game.provider?.displayName ?? game.provider?.name ?? 'Independent'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function useCatalogSearch(
  initialQuery = '',
  initialGames: CatalogGame[] = [],
  initialError = false,
  enabled = true,
  initialLoaded = false,
) {
  const [query, setQuery] = useState(initialQuery);
  const [games, setGames] = useState(initialGames);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const hasServerResult = useRef(initialLoaded);

  useEffect(() => {
    if (!enabled) return;
    if (hasServerResult.current) {
      hasServerResult.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const result = await searchCatalogInBrowser(query, controller.signal);
        setGames(result.games);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setGames([]);
        setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, query]);

  return { query, setQuery, games, loading, error };
}

export function getNextFocusIndex(
  focusableCount: number,
  currentIndex: number,
  backwards: boolean,
) {
  if (focusableCount <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= focusableCount) {
    return backwards ? focusableCount - 1 : 0;
  }
  return (currentIndex + (backwards ? -1 : 1) + focusableCount) % focusableCount;
}

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const { query, setQuery, games, loading, error } = useCatalogSearch('', [], false, open);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);

  useEffect(() => {
    const openDialog = (candidate?: EventTarget | null) => {
      if (!openRef.current) {
        opener.current =
          candidate instanceof HTMLElement
            ? candidate
            : document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
      }
      openRef.current = true;
      setOpen(true);
    };
    const closeDialog = () => {
      openRef.current = false;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openDialog();
      }
      if (e.key === 'Escape' && openRef.current) {
        e.preventDefault();
        closeDialog();
      }
    };
    const openSearch = (event: Event) => {
      const candidate =
        event instanceof CustomEvent && event.detail?.opener instanceof HTMLElement
          ? event.detail.opener
          : null;
      openDialog(candidate);
    };
    addEventListener('keydown', key);
    addEventListener('open-command-search', openSearch);
    return () => {
      removeEventListener('keydown', key);
      removeEventListener('open-command-search', openSearch);
      if (openRef.current && opener.current?.isConnected) opener.current.focus();
    };
  }, []);

  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => input.current?.focus());
      const keepFocusInside = (event: FocusEvent) => {
        if (!dialog.current?.contains(event.target as Node)) input.current?.focus();
      };
      const trapTab = (event: KeyboardEvent) => {
        if (event.key !== 'Tab' || !dialog.current) return;
        const focusable = Array.from(
          dialog.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => !element.hasAttribute('hidden'));
        if (!focusable.length) {
          event.preventDefault();
          dialog.current.focus();
          return;
        }
        event.preventDefault();
        const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
        const nextIndex = getNextFocusIndex(focusable.length, currentIndex, event.shiftKey);
        focusable[nextIndex]?.focus();
      };
      document.addEventListener('focusin', keepFocusInside);
      document.addEventListener('keydown', trapTab);
      return () => {
        cancelAnimationFrame(frame);
        document.removeEventListener('focusin', keepFocusInside);
        document.removeEventListener('keydown', trapTab);
      };
    }
    if (opener.current?.isConnected) opener.current.focus();
    opener.current = null;
  }, [open]);

  const close = () => {
    openRef.current = false;
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 p-3 pt-[10vh]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Search games"
        tabIndex={-1}
        className="surface mx-auto max-h-[75vh] max-w-2xl overflow-auto rounded-[var(--radius-lg)] p-4"
      >
        <div className="mb-4 flex gap-2">
          <label className="flex h-12 flex-1 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-2)] px-3">
            <SearchIcon size={18} />
            <span className="sr-only">Search games</span>
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search games or providers…"
              className="w-full bg-transparent outline-none"
            />
          </label>
          <button aria-label="Close search" onClick={close}>
            <X />
          </button>
        </div>
        <SearchResults games={games} query={query} loading={loading} error={error} />
      </div>
    </div>
  );
}
export function SearchTrigger({
  iconOnly = false,
  className = '',
}: {
  iconOnly?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={iconOnly ? 'Open search' : undefined}
      onClick={(event) =>
        dispatchEvent(
          new CustomEvent('open-command-search', {
            detail: { opener: event.currentTarget },
          }),
        )
      }
      className={`h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] text-sm text-[var(--muted)] ${iconOnly ? 'grid size-10 place-items-center' : 'flex px-3'} ${className}`}
    >
      <SearchIcon size={17} />
      {!iconOnly && (
        <>
          {' '}
          Search <kbd className="ml-6 text-[10px]">⌘K</kbd>
        </>
      )}
    </button>
  );
}
