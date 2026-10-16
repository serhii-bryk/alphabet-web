'use client';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Dices,
  FileText,
  Hash,
  LayoutGrid,
  Radio,
  Search as SearchIcon,
  TicketPercent,
  Trophy,
  X,
} from 'lucide-react';
import type { CatalogGame } from '@brand/contracts';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { loadSearchCatalogMeta, searchCatalogInBrowser, type SearchCatalogMeta } from '@/data/catalog-browser';
import {
  createDebouncedSearch,
  createLatestGate,
  gameSearchKey,
  loadGameSearch,
  sharedGameSearchCache,
} from '@/data/game-search';
import { GameThumbnail } from './game-card';
import { useGameLauncher } from './game-launch/provider';
import { openDestination, scrollToLobbySection } from './game-launch/casino-nav';
import { startRouteProgress } from './route-progress';
import { useSession } from './auth/session';
import { Skeleton } from './ui';
import {
  browseDocuments,
  buildSiteSearchDocuments,
  collectSearchGroups,
  GLOBAL_SEARCH_GAME_LIMIT,
  GLOBAL_SEARCH_MIN_LENGTH,
  primaryLaunchMode,
  getNextFocusIndex,
  searchQueryLength,
  type SearchDocument,
  type SearchGroup,
  type SiteSearchLabels,
} from './search-index';

export function SearchInput({
  value,
  onChange,
  onFocus,
  compact = false,
  placeholder,
  label,
  inputRef,
  listId,
  activeDescendant,
  expanded = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  compact?: boolean;
  placeholder?: string;
  label?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  listId?: string;
  activeDescendant?: string;
  expanded?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 ${compact ? 'h-10' : 'h-12'}`}
    >
      <SearchIcon size={17} className="text-[var(--muted)]" />
      <span className="sr-only">{label ?? 'Search'}</span>
      <input
        ref={inputRef}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={activeDescendant}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        dir="auto"
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder ?? 'Search games, promotions, and pages'}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      <kbd className="hidden rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] sm:block">
        ⌘K
      </kbd>
    </label>
  );
}

export function SearchResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading search results" className="grid gap-2">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-2">
          <Skeleton className="size-10 shrink-0 rounded-[var(--radius-sm)]" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-2/3 rounded-[var(--radius-sm)]" />
            <Skeleton className="mt-1.5 h-3 w-1/3 rounded-[var(--radius-sm)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface FlatResult {
  id: string;
  game?: CatalogGame;
  document?: SearchDocument;
}

function useSiteLabels(): SiteSearchLabels {
  const nav = useTranslations('nav');
  const footer = useTranslations('footer');
  const pages = useTranslations('pages');
  const lobby = useTranslations('lobbyNav');
  const worlds = useTranslations('worlds');
  const highlights = useTranslations('highlights');
  const account = useTranslations('account');
  const personalization = useTranslations('personalization');
  return {
    casino: nav('casino'),
    live: nav('live'),
    sports: nav('sports'),
    promotions: nav('promotions'),
    search: nav('search'),
    journal: nav('journal'),
    support: footer('support'),
    responsible: footer('responsible'),
    terms: footer('terms'),
    privacy: footer('privacy'),
    favorites: personalization('favorites'),
    recent: personalization('recentlyPlayed'),
    most: personalization('mostPlayed'),
    account: nav('account'),
    register: footer('createAccount'),
    games: lobby('games'),
    providers: lobby('providers'),
    liveTables: worlds('liveTitle'),
    journalNotes: highlights('journal'),
    journalLobby: pages('journalLobbyTitle'),
    journalLive: pages('journalLiveTitle'),
    profile: account('profile'),
    balance: account('balance'),
    welcomeTitle: pages('promoWelcomeTitle'),
    welcomeBody: pages('promoWelcomeBody'),
    weekendTitle: pages('promoWeekendTitle'),
    weekendBody: pages('promoWeekendBody'),
    journalPromoTitle: pages('promoJournalTitle'),
    journalPromoBody: pages('promoJournalBody'),
  };
}

function useGlobalSearch(initialQuery: string, initialGames: CatalogGame[], initialError: boolean, enabled: boolean, initialLoaded: boolean) {
  const labels = useSiteLabels();
  const { status } = useSession();
  const initialKey = initialQuery.trim().slice(0, 200);
  const [query, setQuery] = useState(initialQuery);
  const [games, setGames] = useState(initialGames);
  const [gamesFor, setGamesFor] = useState(initialError ? '' : initialKey);
  const [errorFor, setErrorFor] = useState(initialError ? initialKey : '');
  const [meta, setMeta] = useState<SearchCatalogMeta | null>(null);
  const skipRemote = useRef(initialLoaded);
  const initialGamesRef = useRef(initialGames);
  const gate = useRef(createLatestGate());
  const debounced = useRef(createDebouncedSearch());
  const audience = status === 'authenticated' ? 'authenticated' : status === 'guest' ? 'guest' : 'pending';
  const remoteQuery = query.trim().slice(0, 200);
  const phase = searchQueryLength(remoteQuery) >= GLOBAL_SEARCH_MIN_LENGTH ? 'results' : remoteQuery.length > 0 ? 'short' : 'browse';

  useEffect(() => {
    if (!enabled) return;
    const scheduler = debounced.current;
    const requestId = gate.current.issue();
    const isCurrent = (id: number) => gate.current.isCurrent(id);
    const publish = (value: string, nextGames: CatalogGame[], failed: boolean) => {
      if (!isCurrent(requestId)) return;
      setGames(nextGames);
      setGamesFor(failed ? '' : value);
      setErrorFor(failed ? value : '');
    };
    if (skipRemote.current) {
      skipRemote.current = false;
      if (!initialError && searchQueryLength(initialQuery) >= GLOBAL_SEARCH_MIN_LENGTH) {
        sharedGameSearchCache.write(gameSearchKey(initialQuery), initialGamesRef.current, Date.now());
      }
      return () => scheduler.cancel();
    }
    if (searchQueryLength(remoteQuery) < GLOBAL_SEARCH_MIN_LENGTH) return () => scheduler.cancel();
    if (initialError && remoteQuery === initialKey) return () => scheduler.cancel();
    const cached = sharedGameSearchCache.read(gameSearchKey(remoteQuery), Date.now());
    if (cached) {
      queueMicrotask(() => publish(remoteQuery, cached, false));
      return () => scheduler.cancel();
    }
    scheduler.push(remoteQuery, (value, signal) => {
      void loadGameSearch({
        query: value,
        signal,
        requestId,
        isCurrent,
        fetchGames: (next, nextSignal) =>
          searchCatalogInBrowser(next, nextSignal, GLOBAL_SEARCH_GAME_LIMIT).then((result) => ({ games: result.games })),
      }).then((result) => {
        if (result.status === 'ready' || result.status === 'cached') publish(value, result.games, false);
        else if (result.status === 'error') publish(value, [], true);
      });
    });
    return () => scheduler.cancel();
  }, [enabled, initialError, initialKey, initialQuery, remoteQuery]);

  useEffect(() => {
    if (!enabled || phase !== 'results') return;
    let cancelled = false;
    loadSearchCatalogMeta()
      .then((value) => {
        if (!cancelled) setMeta(value);
      })
      .catch(() => {
        if (!cancelled) setMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, phase]);

  const site = useMemo(() => buildSiteSearchDocuments(labels, audience), [labels, audience]);
  const groups = useMemo(
    () =>
      phase === 'results'
        ? collectSearchGroups({
            site,
            categories: meta?.categories ?? [],
            providers: meta?.providers ?? [],
            query: remoteQuery,
            floors: { casino: labels.casino, live: labels.live },
            providerLabel: labels.providers,
          })
        : [],
    [labels.casino, labels.live, labels.providers, meta, phase, remoteQuery, site],
  );
  const suggestions = phase === 'browse' ? browseDocuments(site) : [];
  const gamesError = phase === 'results' && errorFor === remoteQuery;
  const gamesAligned = gamesFor === remoteQuery;
  return {
    query,
    setQuery,
    games: phase === 'results' && gamesAligned ? games : [],
    gamesLoading: phase === 'results' && !gamesError && !gamesAligned,
    gamesError,
    groups,
    suggestions,
    phase,
    remoteQuery,
  };
}

function ResultIcon({ item }: { item: FlatResult }) {
  const frame = 'grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--muted)]';
  if (item.game) {
    return (
      <span className="grid size-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
        <GameThumbnail game={item.game} />
      </span>
    );
  }
  const entry = item.document;
  if (!entry) return null;
  if (entry.kind === 'provider') {
    return <span className={`${frame} text-xs font-black text-[var(--text)]`}>{mark(entry.title)}</span>;
  }
  return (
    <span className={frame}>
      {entry.kind === 'promotion' ? (
        <TicketPercent size={18} aria-hidden />
      ) : entry.kind === 'category' ? (
        <LayoutGrid size={18} aria-hidden />
      ) : entry.kind === 'section' ? (
        <Hash size={18} aria-hidden />
      ) : entry.id === 'page-casino' ? (
        <Dices size={18} aria-hidden />
      ) : entry.id === 'page-live' ? (
        <Radio size={18} aria-hidden />
      ) : entry.id === 'page-sports' ? (
        <Trophy size={18} aria-hidden />
      ) : entry.id === 'page-promotions' ? (
        <TicketPercent size={18} aria-hidden />
      ) : (
        <FileText size={18} aria-hidden />
      )}
    </span>
  );
}

function mark(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((word) => [...word][0] ?? '') : [...name].slice(0, 2);
  return letters.join('').toLocaleUpperCase();
}

export function GlobalSearch({
  initialQuery = '',
  initialGames = [],
  initialError = false,
  initialLoaded = false,
  enabled = true,
  inputRef,
  stableOpener,
  onDone,
  aside,
}: {
  initialQuery?: string;
  initialGames?: CatalogGame[];
  initialError?: boolean;
  initialLoaded?: boolean;
  enabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  stableOpener?: RefObject<HTMLElement | null>;
  onDone?: () => void;
  aside?: ReactNode;
}) {
  const t = useTranslations('search');
  const pathname = usePathname();
  const router = useRouter();
  const { launch, authenticated } = useGameLauncher();
  const search = useGlobalSearch(initialQuery, initialGames, initialError, enabled, initialLoaded);
  const listId = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const flat = useMemo<FlatResult[]>(() => {
    if (search.phase === 'browse') return search.suggestions.map((document) => ({ id: document.id, document }));
    if (search.phase !== 'results') return [];
    return [
      ...search.games.map((game) => ({ id: `game:${game.id}`, game })),
      ...search.groups.flatMap((group) => group.items.map((document) => ({ id: document.id, document }))),
    ];
  }, [search.games, search.groups, search.phase, search.suggestions]);
  const flatKey = flat.map((item) => item.id).join('|');
  const [selection, setSelection] = useState<{ key: string; index: number } | null>(null);
  const active = selection?.key === flatKey ? selection.index : flat.length > 0 ? 0 : -1;

  useEffect(() => {
    const node = optionRefs.current[active];
    const scroller = node?.closest('[role="dialog"]');
    if (!node || !scroller) return;
    const nodeBox = node.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (nodeBox.top < box.top) scroller.scrollTop -= box.top - nodeBox.top;
    else if (nodeBox.bottom > box.bottom) scroller.scrollTop += nodeBox.bottom - box.bottom;
  }, [active]);

  const activate = (item: FlatResult | undefined) => {
    if (!item) return;
    if (item.game) {
      const opener = stableOpener?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      launch(item.game, opener, primaryLaunchMode(item.game, authenticated));
      onDone?.();
      return;
    }
    if (!item.document) return;
    const sectionId = openDestination(pathname, item.document.href, (href) => {
      startRouteProgress();
      router.push(href);
    }, { scroll: false });
    onDone?.();
    if (sectionId) window.setTimeout(() => scrollToLobbySection(sectionId), 0);
  };

  const optionId = (index: number) => `${listId}-option-${index}`;
  const sections = flat.reduce<Array<{ key: string; label: string; rows: Array<{ item: FlatResult; index: number; title: string; subtitle: string; label: string }> }>>(
    (groups, item, index) => {
      const label = search.phase === 'browse' ? t('suggestions') : item.game ? t('games') : t(groupLabelKey(item.document?.group ?? 'pages'));
      const copy = item.game
        ? {
            title: item.game.title,
            subtitle: item.game.provider?.displayName || item.game.provider?.name || t('casinoGame'),
            label: gameActionLabel(item.game, authenticated, t),
          }
        : {
            title: item.document?.title ?? '',
            subtitle: item.document?.subtitle || (item.document && item.document.kind !== 'page' ? t(item.document.kind) : ''),
            label: `${item.document?.title ?? ''}. ${label}`,
          };
      const row = { item, index, ...copy };
      const last = groups[groups.length - 1];
      if (!last || last.label !== label) return [...groups, { key: label, label, rows: [row] }];
      return [...groups.slice(0, -1), { ...last, rows: [...last.rows, row] }];
    },
    [],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSelection({ key: flatKey, index: getNextFocusIndex(flat.length, active, event.key === 'ArrowUp') });
      return;
    }
    if (event.key !== 'Enter' || active < 0) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest('[data-search-dismiss], [role="option"]')) return;
    event.preventDefault();
    activate(flat[active]);
  };

  return (
    <div onKeyDown={onKeyDown}>
      <div className={aside ? 'flex items-start gap-2' : undefined}>
        <div className="min-w-0 flex-1">
          <SearchInput
            value={search.query}
            onChange={search.setQuery}
            placeholder={t('placeholder')}
            label={t('dialogLabel')}
            inputRef={inputRef}
            listId={listId}
            expanded={flat.length > 0}
            activeDescendant={active >= 0 ? optionId(active) : undefined}
          />
        </div>
        {aside}
      </div>
      <div className="mt-4">
        {search.phase === 'short' && <p className="px-1 text-sm text-[var(--muted)]">{t('keepTyping')}</p>}
        {search.gamesError && (
          <p role="alert" className="mb-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
            {t('unavailable')}
          </p>
        )}
        {search.phase === 'results' && search.gamesLoading && search.games.length === 0 && !search.gamesError && (
          <div className="mb-3">
            <GroupLabel>{t('games')}</GroupLabel>
            <SearchResultsSkeleton />
          </div>
        )}
        {search.phase === 'results' && flat.length === 0 && !search.gamesLoading && !search.gamesError && (
          <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">
            {t('empty', { query: search.remoteQuery })}
          </p>
        )}
        {flat.length > 0 && (
          <div id={listId} role="listbox" aria-label={t('results')}>
            {sections.map((section) => (
              <div key={section.key} role="group" aria-label={section.label}>
                <GroupLabel>{section.label}</GroupLabel>
                {section.rows.map((row) => (
                  <button
                    key={row.item.id}
                    id={optionId(row.index)}
                    ref={(node) => {
                      optionRefs.current[row.index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={row.index === active}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-md)] px-2 py-1.5 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${row.index === active ? 'bg-[var(--surface-2)] ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--surface-2)]'}`}
                    onMouseEnter={() => setSelection({ key: flatKey, index: row.index })}
                    onClick={() => activate(row.item)}
                  >
                    <ResultIcon item={row.item} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{row.title}</span>
                      {row.subtitle ? (
                        <span className="block truncate text-xs text-[var(--muted)]">{row.subtitle}</span>
                      ) : (
                        <span className="sr-only">{row.label}</span>
                      )}
                    </span>
                    <span className="sr-only">{row.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function groupLabelKey(group: SearchGroup): 'promotions' | 'pages' | 'categories' | 'providers' {
  return group;
}

function gameActionLabel(
  game: CatalogGame,
  authenticated: boolean,
  t: (key: 'play' | 'playDemo' | 'signIn', values: { title: string }) => string,
) {
  if (authenticated) return t('play', { title: game.title });
  if (game.demoPlayEnabled) return t('playDemo', { title: game.title });
  return t('signIn', { title: game.title });
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="px-2 pb-1 pt-3 text-[10px] font-black uppercase tracking-[.16em] text-[var(--muted)]">{children}</p>;
}

export function CommandSearch() {
  const t = useTranslations('search');
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState('');
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
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSeed('');
        openDialog();
      }
      if (event.key === 'Escape' && openRef.current) {
        event.preventDefault();
        closeDialog();
      }
    };
    const openSearch = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const candidate = detail?.opener instanceof HTMLElement ? detail.opener : null;
      const query = detail && typeof detail.query === 'string' ? detail.query.slice(0, 80) : '';
      setSeed(query);
      openDialog(candidate);
    };
    addEventListener('keydown', key);
    addEventListener('open-command-search', openSearch);
    return () => {
      removeEventListener('keydown', key);
      removeEventListener('open-command-search', openSearch);
      if (openRef.current && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
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
    if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    opener.current = null;
  }, [open]);

  const close = () => {
    openRef.current = false;
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div
      className="modal-backdrop fixed inset-0 z-[70] bg-black/60 p-3 pt-[10vh]"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('dialogLabel')}
        tabIndex={-1}
        className="surface panel modal-panel mx-auto max-h-[75vh] max-w-2xl overflow-auto rounded-[var(--radius-lg)] p-4"
      >
        <GlobalSearch
          key={seed}
          initialQuery={seed}
          inputRef={input}
          stableOpener={opener}
          onDone={close}
          aside={
            <button
              type="button"
              data-search-dismiss=""
              aria-label={t('close')}
              onClick={close}
              className="window-control grid size-12 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--muted)]"
            >
              <X />
            </button>
          }
        />
      </div>
    </div>
  );
}

export function SearchTrigger({
  iconOnly = false,
  compact = false,
  className = '',
}: {
  iconOnly?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const nav = useTranslations('nav');
  const t = useTranslations('search');
  return (
    <button
      type="button"
      aria-label={iconOnly ? t('open') : undefined}
      aria-keyshortcuts="Control+K Meta+K"
      onClick={(event) =>
        dispatchEvent(new CustomEvent('open-command-search', { detail: { opener: event.currentTarget } }))
      }
      className={`pressable h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] text-sm text-[var(--muted)] hover:border-[var(--accent-line)] hover:bg-[var(--surface)] hover:text-[var(--text)] ${iconOnly ? `grid ${compact ? 'size-9' : 'size-10'} place-items-center` : 'flex min-w-56 px-3'} ${className}`}
    >
      <SearchIcon size={17} />
      {!iconOnly && (
        <>
          {' '}
          {nav('search')}{' '}
          <kbd className="ms-auto rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold">
            ⌘K
          </kbd>
        </>
      )}
    </button>
  );
}
