// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { openCasinoGameSection, openDestination } from './casino-nav';

describe('openCasinoGameSection', () => {
  it('scrolls to the games anchor on the casino route without a new navigation', () => {
    document.body.innerHTML = '<section id="games" tabindex="-1"></section>';
    const section = document.getElementById('games') as HTMLElement;
    section.scrollIntoView = vi.fn();
    section.focus = vi.fn();
    window.history.replaceState({ marker: 1 }, '', '/casino');
    const pushState = vi.spyOn(window.history, 'pushState');
    const push = vi.fn();

    openCasinoGameSection('/casino', push);

    expect(push).not.toHaveBeenCalled();
    expect(pushState).toHaveBeenCalledWith({ marker: 1 }, '', '/casino#games');
    expect(section.scrollIntoView).toHaveBeenCalled();
    pushState.mockRestore();
  });

  it('sends other routes to the locale-preserving casino games anchor', () => {
    const push = vi.fn();
    openCasinoGameSection('/promotions', push);
    expect(push).toHaveBeenCalledWith('/casino#games');
  });

  it('scrolls a same-page section without navigation and keeps the current query', () => {
    document.body.innerHTML = '<section id="providers" tabindex="-1"></section>';
    const section = document.getElementById('providers') as HTMLElement;
    section.scrollIntoView = vi.fn();
    section.focus = vi.fn();
    window.history.replaceState({}, '', '/casino?category=slots');
    const push = vi.fn();

    openDestination('/casino', '/casino#providers', push);

    expect(push).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#providers');
    expect(window.location.search).toBe('?category=slots');
    expect(section.scrollIntoView).toHaveBeenCalled();
  });

  it('navigates when the section is on another page', () => {
    const push = vi.fn();
    openDestination('/casino', '/journal#journal-lobby', push);
    expect(push).toHaveBeenCalledWith('/journal#journal-lobby');
  });

  it('uses an instant scroll when reduced motion is requested', () => {
    document.body.innerHTML = '<section id="games" tabindex="-1"></section>';
    const section = document.getElementById('games') as HTMLElement;
    section.scrollIntoView = vi.fn();
    section.focus = vi.fn();
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('reduce'),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    window.history.replaceState({}, '', '/casino');

    openDestination('/casino', '/casino#games', vi.fn());

    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
    matchMedia.mockRestore();
  });
});
