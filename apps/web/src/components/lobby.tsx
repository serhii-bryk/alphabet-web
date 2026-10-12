import type { CatalogGameFilters, CatalogLobbyResponse, CatalogProvider } from '@brand/contracts';
import { Link } from '@/i18n/navigation';
import { getCategoryFilterValue } from '@/data/catalog';
import { LobbyHero, LobbyProductSplit } from './lobby-hero';
import { LobbyHighlights } from './lobby-highlights';
import { LobbyGameInfo, LobbySectionNav } from './lobby-section-nav';
import { ScrollRail, Skeleton } from './ui';
import { GameCard } from './game-card';

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
  'shrink-0 rounded-[var(--radius-pill)] border border-[var(--line)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--accent)]';

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

  return (
    <>
      {browsing && <LobbyHero startId={pathname === '/live-casino' ? 'live' : 'casino'} />}
      <LobbySectionNav pathname={pathname} showPromotions={browsing} />
      {browsing && <LobbyProductSplit />}

      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--accent)]">
            {pathname === '/live-casino' ? 'Live floor' : 'Casino floor'}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
          {filters.search && (
            <p className="mt-2 text-sm text-[var(--muted)]">Results for “{filters.search}”</p>
          )}
        </div>
      </div>

      <nav aria-label="Game categories" className="scrollbar-none mb-8 flex gap-2 overflow-x-auto pb-1">
        <Link
          href={catalogHref(pathname, filters, { category: undefined, page: undefined })}
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

      <div id="game-floor" className="space-y-8">
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
              <h2 className="mb-3 text-lg font-black">{featured.length > 0 ? 'More games' : 'All games'}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {browsable.map((game) => (
                  <GameCard key={game.id} game={game} layout="grid" />
                ))}
              </div>
            </section>
          </>
        )}

        <section id="providers" tabIndex={-1} aria-label="Providers" className="lobby-anchor outline-none">
          <div className="mb-3">
            <h2 className="text-lg font-black">Providers</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Filter the floor by studio. Each provider is listed once.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={catalogHref(pathname, filters, {
                provider: undefined,
                groupedProvider: undefined,
                page: undefined,
              })}
              aria-current={!filters.provider && !filters.groupedProvider ? 'page' : undefined}
              className="inline-flex h-10 items-center rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold aria-[current=page]:border-[var(--accent)] aria-[current=page]:text-[var(--accent)]"
            >
              All providers
            </Link>
            {providers.map((provider) => (
              <Link
                key={provider.groupedCode || provider.code || provider.id}
                href={providerHref(pathname, filters, provider)}
                aria-current={providerSelected(filters, provider) ? 'page' : undefined}
                className="inline-flex h-10 max-w-full items-center rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold transition hover:border-[var(--accent)] aria-[current=page]:border-[var(--accent)] aria-[current=page]:text-[var(--accent)]"
              >
                {provider.displayName || provider.name}
              </Link>
            ))}
          </div>
        </section>
      </div>

      {browsing && <LobbyHighlights />}
      <LobbyGameInfo />

      <Pagination lobby={lobby} pathname={pathname} filters={filters} />
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex h-28 min-w-full items-center rounded-[var(--radius-md)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 text-sm text-[var(--muted)]">{text}</div>;
}

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
  if (!pagination.hasNextPage && !pagination.hasPreviousPage) return null;

  return (
    <nav aria-label="Catalog pagination" className="mt-9 flex items-center justify-between gap-4 border-t border-[var(--line)] pt-5">
      {pagination.hasPreviousPage ? (
        <Link className={railLinkClass} href={catalogHref(pathname, filters, { page: pagination.page - 1 })}>
          Previous
        </Link>
      ) : <span />}
      <span className="text-sm text-[var(--muted)]">Page {pagination.page} of {pagination.lastPage}</span>
      {pagination.hasNextPage ? (
        <Link className={railLinkClass} href={catalogHref(pathname, filters, { page: pagination.page + 1 })}>
          Next
        </Link>
      ) : <span />}
    </nav>
  );
}

export function LobbyLoading({ title = 'Loading games' }: { title?: string }) {
  return (
    <section aria-busy="true" aria-label={title}>
      <Skeleton className="mb-5 h-72 w-full rounded-[var(--radius-lg)]" />
      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
      <Skeleton className="mb-2 h-3 w-28" />
      <Skeleton className="mb-8 h-9 w-52" />
      <div className="mb-9 flex gap-2 overflow-hidden">
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
        className="mt-5 inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] px-4 font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--accent-strong)]"
      >
        Try again
      </a>
    </section>
  );
}
