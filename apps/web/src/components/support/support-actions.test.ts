// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseSupportAction, parseSupportReply, supportActionHref, visibleSupportActions } from './actions';
import { buildHandoffSummary, readSupportSession, redactSensitive, writeSupportSession } from './storage';

describe('support actions', () => {
  it('maps approved destinations and rejects arbitrary urls', () => {
    expect(supportActionHref({ type: 'navigate', target: 'casino' })).toBe('/casino');
    expect(supportActionHref({ type: 'navigate', target: 'live_casino' })).toBe('/live-casino');
    expect(supportActionHref({ type: 'navigate', target: 'search', search: 'Pragmatic' })).toBe(
      '/search?q=Pragmatic',
    );
    expect(supportActionHref({ type: 'navigate', target: 'casino', search: 'Pragmatic' })).toBe(
      '/casino?search=Pragmatic',
    );
    expect(parseSupportAction({ type: 'open_cashier', mode: 'deposit' })).toEqual({
      type: 'open_cashier',
      mode: 'deposit',
    });
    expect(parseSupportAction({ type: 'open_login' })).toEqual({ type: 'open_login' });
    expect(parseSupportAction({ type: 'open_registration' })).toEqual({ type: 'open_registration' });
    expect(
      visibleSupportActions(
        [
          { type: 'open_registration' },
          { type: 'open_cashier', mode: 'deposit' },
        ],
        true,
      ),
    ).toEqual([{ type: 'open_cashier', mode: 'deposit' }]);
    expect(
      visibleSupportActions(
        [
          { type: 'open_registration' },
          { type: 'open_cashier', mode: 'deposit' },
        ],
        false,
      ),
    ).toEqual([{ type: 'open_registration' }, { type: 'open_login' }]);
    expect(parseSupportAction({ type: 'open_human_support' })).toEqual({ type: 'open_human_support' });
    expect(parseSupportAction({ type: 'open_url', url: 'https://evil.example' })).toBeNull();
    expect(parseSupportAction({ type: 'navigate', target: 'casino', url: 'javascript:alert(1)' })).toBeNull();
    expect(parseSupportAction({ type: 'navigate', target: 'https://evil.example' })).toBeNull();
  });

  it('rejects a malformed assistant reply', () => {
    expect(
      parseSupportReply({
        message: 'Go here https://evil.example',
        actions: [{ type: 'navigate', target: 'casino' }],
        confidence: 'known',
        escalate: false,
      })?.message,
    ).toBe('Go here');
    expect(
      parseSupportReply({
        message: 'Open it',
        actions: [{ type: 'run', command: 'deposit' }],
        confidence: 'known',
        escalate: false,
      }),
    ).toBeNull();
  });
});

describe('support session', () => {
  it('keeps the conversation for the tab and redacts card numbers from the summary', () => {
    writeSupportSession({
      open: true,
      messages: [
        { id: '1', role: 'user', content: 'Card 4242424242424242 will not stay' },
        {
          id: '2',
          role: 'assistant',
          content: 'Open Deposit.',
          actions: [{ type: 'open_cashier', mode: 'deposit' }],
        },
      ],
    });
    const stored = readSupportSession();
    expect(stored?.open).toBe(true);
    expect(stored?.messages[0]?.content).not.toContain('4242');
    expect(stored?.messages[1]?.actions).toEqual([{ type: 'open_cashier', mode: 'deposit' }]);
    const summary = buildHandoffSummary({
      issue: 'Card 4242424242424242 failed',
      locale: 'en',
      route: '/casino',
      account: 'guest',
      game: 'none',
    });
    expect(summary).toContain('locale: en');
    expect(summary).toContain('route: /casino');
    expect(summary).not.toContain('4242');
    expect(redactSensitive('4242424242424242')).toBe('[redacted]');
    sessionStorage.clear();
  });
});
