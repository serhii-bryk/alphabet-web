export const CASINO_GAMES_HASH = 'games';

export function scrollToLobbySection(id: string) {
  const node = document.getElementById(id);
  if (!node) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  if (node instanceof HTMLElement) node.focus({ preventScroll: true });
}

export function openCasinoGameSection(pathname: string, push: (href: string) => void) {
  if (pathname === '/casino') {
    const hash = `#${CASINO_GAMES_HASH}`;
    if (window.location.hash !== hash) {
      const next = `${window.location.pathname}${window.location.search}${hash}`;
      window.history.pushState(window.history.state, '', next);
    }
    scrollToLobbySection(CASINO_GAMES_HASH);
    return;
  }
  push(`/casino#${CASINO_GAMES_HASH}`);
}
