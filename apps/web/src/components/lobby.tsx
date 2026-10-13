import type { CatalogGameFilters, CatalogLobbyResponse, CatalogProvider } from '@brand/contracts';
import { Link } from '@/i18n/navigation';
import { getCategoryFilterValue } from '@/data/catalog';
import { LobbyHero } from './lobby-hero';
import { LobbyHighlights } from './lobby-highlights';
import { LobbyLiveDiscovery, LobbyProductWorlds } from './lobby-worlds';
import { LobbyGameInfo, LobbySectionNav } from './lobby-section-nav';
import { LobbyGridScroll } from './lobby-scroll';
import { ScrollRail, Skeleton } from './ui';
import { GameCard } from './game-card';
import { CasinoPersonalizationRails } from './personalization/lobby-rails';

const FEATURED_COUNT = 8;

export function uniqueProviders(providers: CatalogProvider[]) {
  const seen = new Set<string>();
  const unique: CatalogProvider[] = [];
  for (const provider of providers) {
    const key = (provider.groupedCode || provider.code || provider.id).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(provider);
  }
  return unique.sort((left, right) =>
    (left.displayName || left.name).localeCompare(right.displayName || right.name),
  );
}

function providerHref(
  pathname: '/casino' | '/live-casino',
  filters: CatalogGameFilters,
  provider: CatalogProvider,
) {
  if (provider.groupedCode) {
    return catalogHref(pathname, filters, {
      provider: undefined,
      groupedProvider: provider.groupedCode,
      page: undefined,
    });
  }
  return catalogHref(pathname, filters, {
    provider: provider.code,
    groupedProvider: undefined,
    page: undefined,
  });
}

function providerSelected(filters: CatalogGameFilters, provider: CatalogProvider) {
  if (provider.groupedCode) return filters.groupedProvider === provider.groupedCode;
  return filters.provider === provider.code;
}

function catalogHref(
  pathname: '/casino' | '/live-casino',
  filters: CatalogGameFilters,
  change: Partial<CatalogGameFilters>,
) {
  const next = { ...filters, ...change };
  const query = new URLSearchParams();
  if (next.page && next.page > 1) query.set('page', String(next.page));
  if (next.search) query.set('search', next.search);
  if (next.category) query.set('category', next.category);
  if (next.provider) query.set('provider', next.provider);
  if (next.groupedProvider) query.set('group', next.groupedProvider);
  const value = query.toString();
  return `${pathname}${value ? `?${value}` : ''}`;
}

const railLinkClass =
  'chip-link shrink-0 rounded-[var(--radius-pill)] border border-[var(--line)] px-4 py-2 text-sm font-semibold';

export function LobbyView({
  lobby,
  title,
  pathname,
  filters,
}: {
  lobby: CatalogLobbyResponse;
  title: string;
  pathname: '/casino' | '/live-casino';
  filters: CatalogGameFilters;
}) {
  const games = lobby.sections[0]?.games ?? [];
  const providers = uniqueProviders(lobby.providers);
  const browsing =
    !filters.search &&
    !filters.category &&
    !filters.provider &&
    !filters.groupedProvider &&
    (filters.page ?? 1) === 1;
  const featured = games.length > FEATURED_COUNT ? games.slice(0, FEATURED_COUNT) : [];
  const browsable = featured.length > 0 ? games.slice(FEATURED_COUNT) : games;

  const scrollToken = [
    pathname,
    filters.category ?? '',
    filters.page ?? 1,
    filters.search ?? '',
    filters.provider ?? '',
    filters.groupedProvider ?? '',
  ].join('|');

  return (
    <>
      <LobbyGridScroll token={scrollToken} />
      {browsing && <LobbyHero startId={pathname === '/live-casino' ? 'live' : 'casino'} />}
      {browsing && <LobbyProductWorlds pathname={pathname} />}
      <LobbySectionNav pathname={pathname} showPromotions={browsing} />

      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-[var(--accent)]">
            {pathname === '/live-casino' ? 'Live floor' : 'Casino floor'}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          {filters.search && (
            <p className="mt-2 text-sm text-[var(--muted)]">Results for “{filters.search}”</p>
          )}
        </div>
      </div>

      <nav aria-label="Game categories" className="scrollbar-none mb-5 flex gap-2 overflow-x-auto pb-1">
        <Link
          href={catalogHref(pathname, filters, { category: undefined, page: undefined })}
          scroll={false}
          aria-current={!filters.category ? 'page' : undefined}
          className={railLinkClass}
          style={{
            background: !filters.category ? 'var(--text)' : 'var(--surface)',
            color: !filters.category ? 'var(--bg)' : 'var(--muted)',
          }}
        >
          All games
        </Link>
        {lobby.categories.map((category) => {
          const value = getCategoryFilterValue(category);
          const active = filters.category === value;
          return (
            <Link
              key={category.id}
              href={catalogHref(pathname, filters, { category: value, page: undefined })}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={railLinkClass}
              style={{
                background: active ? 'var(--text)' : 'var(--surface)',
                color: active ? 'var(--bg)' : 'var(--muted)',
              }}
            >
              {category.name}
            </Link>
          );
        })}
      </nav>

      <div id="game-floor" className="space-y-8 sm:space-y-10">
        {browsing && pathname === '/casino' && <CasinoPersonalizationRails placement="lead" />}
        {games.length === 0 ? (
          <section id="games" tabIndex={-1} className="lobby-anchor outline-none" aria-label="All games">
            <EmptyState text="No games match these filters." />
          </section>
        ) : (
          <>
            {featured.length > 0 && (
              <div id="popular" className="lobby-anchor">
                <ScrollRail label="Popular">
                  {featured.map((game) => (
                    <GameCard key={game.id} game={game} />
                  ))}
                </ScrollRail>
              </div>
            )}
            <section
              id="games"
              tabIndex={-1}
              aria-label={featured.length > 0 ? 'More games' : 'All games'}
              className="lobby-anchor outline-none"
            >
              <h2 className="lobby-title mb-4 text-lg font-black">{featured.length > 0 ? 'More games' : 'All games'}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                {browsable.map((game) => (
                  <GameCard key={game.id} game={game} layout="grid" />
                ))}
              </div>
            </section>
          </>
        )}

        <Pagination lobby={lobby} pathname={pathname} filters={filters} />

        {browsing && pathname === '/casino' && <CasinoPersonalizationRails placement="tail" />}
        {browsing && pathname === '/casino' && <LobbyLiveDiscovery />}

        <section id="providers" tabIndex={-1} aria-label="Providers" className="lobby-anchor provider-section outline-none">
          <div className="mb-3">
            <h2 className="lobby-title text-lg font-black">Providers</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Studios on this floor</p>
          </div>
          <div className="provider-rail">
            <Link
              href={catalogHref(pathname, filters, {
                provider: undefined,
                groupedProvider: undefined,
                page: undefined,
              })}
              scroll={false}
              aria-current={!filters.provider && !filters.groupedProvider ? 'page' : undefined}
              className={`provider-tile${!filters.provider && !filters.groupedProvider ? ' provider-tile-active' : ''}`}
            >
              <span aria-hidden className="provider-mark">All</span>
              <span className="truncate">All providers</span>
            </Link>
            {providers.map((provider) => {
              const name = provider.displayName || provider.name;
              const selected = providerSelected(filters, provider);
              return (
                <Link
                  key={provider.groupedCode || provider.code || provider.id}
                  href={providerHref(pathname, filters, provider)}
                  scroll={false}
                  aria-current={selected ? 'page' : undefined}
                  className={`provider-tile${selected ? ' provider-tile-active' : ''}`}
                >
                  <span aria-hidden className="provider-mark">{providerMark(name)}</span>
                  <span className="truncate">{name}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {browsing && <LobbyHighlights />}
      <LobbyGameInfo />
    </>
  );
}

function providerMark(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((word) => word[0] ?? '') : [...name].slice(0, 2);
  return letters.join('').toUpperCase();
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex h-28 min-w-full items-center rounded-[var(--radius-md)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 text-sm text-[var(--muted)]">{text}</div>;
}

export function catalogPageItems(current: number, last: number): Array<number | 'ellipsis'> {
  if (last <= 1) return last === 1 ? [1] : [];
  const pages = new Set<number>([1, last]);
  const start = Math.max(1, Math.min(current - 2, last - 4));
  const end = Math.min(last, Math.max(current + 2, 5));
  for (let page = start; page <= end; page += 1) pages.add(page);
  const sorted = [...pages].sort((left, right) => left - right);
  const items: Array<number | 'ellipsis'> = [];
  for (const [index, page] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) items.push('ellipsis');
    items.push(page);
  }
  return items;
}

const pagerClass =
  'inline-flex h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] border px-3 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

function Pagination({
  lobby,
  pathname,
  filters,
}: {
  lobby: CatalogLobbyResponse;
  pathname: '/casino' | '/live-casino';
  filters: CatalogGameFilters;
}) {
  const { pagination } = lobby;
  if (pagination.lastPage <= 1) return null;
  const items = catalogPageItems(pagination.page, pagination.lastPage);
  const summary =
    pagination.from !== null && pagination.to !== null
      ? `Showing ${pagination.from}–${pagination.to} of ${pagination.total} ${pagination.total === 1 ? 'game' : 'games'}`
      : null;

  return (
    <nav
      aria-label="Catalog pagination"
      className="mt-6 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 sm:px-5"
    >
      {summary && <p className="text-sm font-semibold text-[var(--text)]">{summary}</p>}
      <div className={`flex items-center justify-between gap-3 ${summary ? 'mt-3' : ''}`}>
        <PagerControl
          label="Previous"
          href={pagination.hasPreviousPage ? catalogHref(pathname, filters, { page: pagination.page - 1 }) : undefined}
        />
        <p className="text-sm font-bold text-[var(--text)] sm:hidden">
          Page {pagination.page} of {pagination.lastPage}
        </p>
        <div className="hidden items-center gap-1.5 sm:flex">
          {items.map((item, index) =>
            item === 'ellipsis' ? (
              <span key={`gap-${index}`} aria-hidden className="px-1 text-sm font-bold text-[var(--muted)]">
                …
              </span>
            ) : item === pagination.page ? (
              <span
                key={item}
                aria-current="page"
                className={`${pagerClass} border-transparent bg-[var(--accent)] text-[var(--accent-contrast)]`}
              >
                {item}
              </span>
            ) : (
              <Link
                key={item}
                href={catalogHref(pathname, filters, { page: item })}
                scroll={false}
                className={`${pagerClass} border-[var(--line)] bg-[var(--bg)] text-[var(--text)] hover:border-[var(--accent)]`}
              >
                {item}
              </Link>
            ),
          )}
        </div>
        <PagerControl
          label="Next"
          href={pagination.hasNextPage ? catalogHref(pathname, filters, { page: pagination.page + 1 }) : undefined}
        />
      </div>
    </nav>
  );
}

function PagerControl({ label, href }: { label: string; href?: string }) {
  if (!href) {
    return (
      <span aria-disabled="true" className={`${pagerClass} cursor-not-allowed border-[var(--line)] text-[var(--muted)] opacity-45`}>
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      className={`${pagerClass} border-[var(--line)] bg-[var(--bg)] text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]`}
    >
      {label}
    </Link>
  );
}

export function LobbyLoading({ title = 'Loading games' }: { title?: string }) {
  return (
    <section aria-busy="true" aria-label={title}>
      <Skeleton className="mb-2 h-3 w-28" />
      <Skeleton className="mb-6 h-9 w-52" />
      <div className="mb-5 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-10 w-24 shrink-0 rounded-full" />)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-[3/4] w-full" />)}
      </div>
    </section>
  );
}

export function CatalogErrorState() {
  return (
    <section role="alert" className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--accent)]">Catalog</p>
      <h1 className="mt-2 text-2xl font-black">Games are temporarily unavailable</h1>
      <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">Please try again in a moment. No account or game data was affected.</p>
      <a
        href=""
        className="btn btn-primary mt-5 inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] px-4 font-semibold"
      >
        Try again
      </a>
    </section>
  );
}
