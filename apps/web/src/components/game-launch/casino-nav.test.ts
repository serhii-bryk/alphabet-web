// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { openCasinoGameSection } from './casino-nav';

describe('openCasinoGameSection', () => {
  it('scrolls to the games anchor on the casino route without a new navigation', () => {
    document.body.innerHTML = '<section id="games" tabindex="-1"></section>';
    const section = document.getElementById('games') as HTMLElement;
    section.scrollIntoView = vi.fn();
    section.focus = vi.fn();
    window.history.replaceState({ marker: 1 }, '', '/en/casino');
    const pushState = vi.spyOn(window.history, 'pushState');
    const push = vi.fn();

    openCasinoGameSection('/casino', push);

    expect(push).not.toHaveBeenCalled();
    expect(pushState).toHaveBeenCalledWith({ marker: 1 }, '', '/en/casino#games');
    expect(section.scrollIntoView).toHaveBeenCalled();
    pushState.mockRestore();
  });

  it('sends other routes to the locale-preserving casino games anchor', () => {
    const push = vi.fn();
    openCasinoGameSection('/promotions', push);
    expect(push).toHaveBeenCalledWith('/casino#games');
  });
});
