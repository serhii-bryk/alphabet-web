export const CASINO_GAMES_HASH = 'games';

const SECTION_ID = /^[A-Za-z][A-Za-z0-9_-]{0,80}$/;

export function scrollToLobbySection(id: string) {
  if (!SECTION_ID.test(id)) return;
  const node = document.getElementById(id);
  if (!node) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'start' });
  if (node instanceof HTMLElement) node.focus({ preventScroll: true });
}

export function openDestination(
  currentPathname: string,
  href: string,
  push: (href: string) => void,
  options?: { scroll?: boolean },
) {
  const hashAt = href.indexOf('#');
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const id = hashAt === -1 ? '' : decodeURIComponent(href.slice(hashAt + 1));
  const queryAt = beforeHash.indexOf('?');
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const search = queryAt === -1 ? '' : beforeHash.slice(queryAt);
  const targetPath = path || currentPathname;
  if (id && SECTION_ID.test(id) && currentPathname === targetPath && search === '') {
    const hash = `#${id}`;
    const next = `${window.location.pathname}${window.location.search}${hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
      window.history.pushState(window.history.state, '', next);
    }
    if (options?.scroll !== false) scrollToLobbySection(id);
    return id;
  }
  const currentSearch = window.location.search || '';
  if (!id && currentPathname === targetPath && currentSearch === search) return '';
  push(href);
  return '';
}

export function openCasinoGameSection(pathname: string, push: (href: string) => void) {
  openDestination(pathname, `/casino#${CASINO_GAMES_HASH}`, push);
}
