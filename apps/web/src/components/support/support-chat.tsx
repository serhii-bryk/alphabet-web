'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { LifeBuoy, RotateCcw, Send, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { SupportAction, SupportChannel, SupportSection } from '@brand/contracts';
import { usePathname, useRouter } from '@/i18n/navigation';
import { fetchSupportChannels, sendSupportChat, SupportRequestError } from '@/data/support-browser';
import { useAuthDialog } from '../auth/auth-provider';
import { useSession } from '../auth/session';
import { useCashier } from '../cashier/cashier-provider';
import { useGameLauncher } from '../game-launch/provider';
import { isDesktopViewport } from '../game-launch/viewport';
import { AlphaBetLoader, TypingDots } from '../alphabet-loader';
import { startRouteProgress } from '../route-progress';
import { Button } from '../ui';
import { supportActionHref } from './actions';
import {
  buildHandoffSummary,
  clearSupportSession,
  readSupportSession,
  redactSensitive,
  writeSupportSession,
  type SupportTranscriptItem,
} from './storage';

interface SupportChatApi {
  openChat: () => void;
}

const SupportChatContext = createContext<SupportChatApi>({ openChat: () => {} });

export function useSupportChat() {
  return useContext(SupportChatContext);
}

const suggestions = [
  { id: 'suggestDeposit', prompt: 'suggestDeposit' },
  { id: 'suggestWithdraw', prompt: 'suggestWithdraw' },
  { id: 'suggestGame', prompt: 'suggestGame' },
  { id: 'suggestLive', prompt: 'suggestLive' },
  { id: 'suggestLanguage', prompt: 'suggestLanguage' },
  { id: 'suggestProblem', prompt: 'suggestProblem' },
] as const;

function nextId() {
  return globalThis.crypto?.randomUUID?.() ?? `support-${Date.now()}`;
}

function sectionFor(pathname: string): SupportSection {
  if (pathname === '/casino' || pathname.startsWith('/casino/')) return 'casino';
  if (pathname === '/live-casino' || pathname.startsWith('/live-casino/')) return 'live_casino';
  if (pathname === '/sports' || pathname.startsWith('/sports/')) return 'sports';
  if (pathname === '/account') return 'account';
  if (pathname === '/promotions') return 'promotions';
  if (pathname === '/search') return 'search';
  if (pathname === '/responsible-gaming') return 'responsible_gaming';
  if (pathname === '/support') return 'support';
  return 'other';
}

function safeRoute(pathname: string) {
  return /^\/[A-Za-z0-9/_-]*$/.test(pathname) && pathname.length <= 200 ? pathname : '/';
}

function channelHref(channel: SupportChannel): string | null {
  if (channel.kind === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(channel.value) ? `mailto:${channel.value}` : null;
  }
  try {
    const url = new URL(channel.value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function SupportChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openChat = useCallback(() => setOpen(true), []);
  const api = useMemo(() => ({ openChat }), [openChat]);
  return (
    <SupportChatContext.Provider value={api}>
      {children}
      <SupportChatPanel open={open} onOpen={openChat} onClose={() => setOpen(false)} />
    </SupportChatContext.Provider>
  );
}

export function SupportMenuButton({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations('supportChat');
  const { openChat } = useSupportChat();
  return (
    <button
      type="button"
      className="nav-item flex h-11 w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-semibold"
      aria-label={t('open')}
      onClick={() => {
        onNavigate?.();
        openChat();
      }}
    >
      <LifeBuoy size={19} />
      {!compact && t('title')}
    </button>
  );
}

export function SupportPageActions() {
  const t = useTranslations('supportChat');
  const { openChat } = useSupportChat();
  return (
    <Button type="button" onClick={openChat}>
      <LifeBuoy size={16} />
      {t('open')}
    </Button>
  );
}

function SupportChatPanel({
  open,
  onOpen,
  onClose,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('supportChat');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const { openLogin, openRegistration } = useAuthDialog();
  const { openCashier } = useCashier();
  const { focusedGame } = useGameLauncher();
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [messages, setMessages] = useState<SupportTranscriptItem[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [channels, setChannels] = useState<SupportChannel[] | null>(null);
  const [copied, setCopied] = useState(false);
  const activeLocale = locale === 'ar' ? 'ar' : 'en';

  useEffect(() => {
    const stored = readSupportSession();
    if (stored) {
      // Session storage is the source of the in-tab conversation. Reading it during render would mismatch the server HTML.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(stored.messages);
      if (stored.open) onOpen();
    }
    setHydrated(true);
    // Restore the in-tab conversation once. onOpen is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeSupportSession({ open, messages });
  }, [hydrated, messages, open]);

  useEffect(() => {
    if (wasOpen.current && !open) openerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const log = logRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
  }, [messages, open, pending, handoff]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetchSupportChannels(controller.signal).then((result) => {
      if (!controller.signal.aborted) setChannels(result.channels);
    });
    return () => controller.abort();
  }, [open]);

  const send = useCallback(
    async (text: string, reuse = false) => {
      const content = redactSensitive(text.trim()).slice(0, 1000);
      if (!content || pending) return;
      const prior = messages.filter((item) => !item.errorCode);
      if (reuse && (prior.length === 0 || prior[prior.length - 1]?.role !== 'user')) return;
      const userMessage: SupportTranscriptItem = { id: nextId(), role: 'user', content };
      const history = reuse ? prior : [...prior, userMessage];
      const gameTitle = focusedGame?.title.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '';
      setMessages((current) => (reuse ? prior : [...current, userMessage]));
      setDraft('');
      setPending(true);
      setHandoff(false);
      try {
        const reply = await sendSupportChat({
          messages: history.map((item) => ({ role: item.role, content: item.content })),
          context: {
            locale: activeLocale,
            route: safeRoute(pathname),
            authenticated: status === 'authenticated',
            section: sectionFor(pathname),
            gameOpen: Boolean(focusedGame),
            ...(gameTitle ? { gameTitle } : {}),
          },
        });
        setMessages((current) => [
          ...current,
          {
            id: nextId(),
            role: 'assistant',
            content: reply.message,
            actions: reply.actions,
            escalate: reply.escalate,
          },
        ]);
      } catch (error) {
        const errorCode = error instanceof SupportRequestError ? error.code : 'network';
        setMessages((current) => [
          ...current,
          {
            id: nextId(),
            role: 'assistant',
            content: '',
            errorCode,
            retryText: content,
          },
        ]);
      } finally {
        setPending(false);
      }
    },
    [activeLocale, focusedGame, messages, pathname, pending, status],
  );

  const runAction = (action: SupportAction, opener: HTMLElement) => {
    if (action.type === 'navigate') {
      startRouteProgress();
      router.push(supportActionHref(action));
      if (!isDesktopViewport()) onClose();
      return;
    }
    if (action.type === 'open_cashier') {
      if (status !== 'authenticated') openLogin(opener);
      else openCashier(action.mode);
      return;
    }
    if (action.type === 'open_login') openLogin(opener);
    if (action.type === 'open_registration') openRegistration(opener);
    if (action.type === 'open_human_support') setHandoff(true);
  };

  const clear = () => {
    setMessages([]);
    setDraft('');
    setHandoff(false);
    setCopied(false);
    clearSupportSession();
  };

  const lastUser = [...messages].reverse().find((item) => item.role === 'user' && !item.errorCode);
  const summary = buildHandoffSummary({
    issue: lastUser?.content ?? '',
    locale: activeLocale,
    route: safeRoute(pathname),
    account: status === 'authenticated' ? t('signedIn') : t('guest'),
    game: focusedGame?.title ?? t('noGame'),
  });

  return (
    <>
      {!open && (
        <button
          ref={openerRef}
          type="button"
          className="support-launcher"
          aria-label={t('open')}
          onClick={onOpen}
        >
          <LifeBuoy size={18} />
          <span className="support-launcher-label">{t('title')}</span>
        </button>
      )}
      {open && (
        <section
          className="support-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          dir={activeLocale === 'ar' ? 'rtl' : 'ltr'}
          lang={activeLocale}
        >
          <header className="support-panel-header flex items-center gap-2 border-b border-[var(--line)] px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[var(--shadow-accent)]">
              <LifeBuoy size={17} />
            </span>
            <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-black">
              {t('title')}
            </h2>
            <button type="button" className="support-text-button" onClick={clear}>
              {t('newChat')}
            </button>
            <button type="button" className="support-icon-button" aria-label={t('close')} onClick={onClose}>
              <X size={18} />
            </button>
          </header>
          <div ref={logRef} className="support-log" aria-live="polite">
            {messages.length === 0 && !pending && (
              <div>
                <p className="mb-3 text-sm text-[var(--muted)]">{t('empty')}</p>
                <div className="flex flex-wrap gap-2" aria-label={t('suggestionsLabel')}>
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="support-chip"
                      onClick={() => void send(t(item.prompt))}
                    >
                      {t(item.prompt)}
                    </button>
                  ))}
                  <button type="button" className="support-chip" onClick={() => setHandoff(true)}>
                    {t('suggestHuman')}
                  </button>
                </div>
              </div>
            )}
            {messages.map((item) => (
              <article
                key={item.id}
                className={item.role === 'user' ? 'support-bubble support-bubble-user' : 'support-bubble support-bubble-assistant'}
              >
                {item.errorCode ? (
                  <div role="alert">
                    <p>{t(`error.${item.errorCode}`)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.retryText && (
                        <button
                          type="button"
                          className="support-text-button"
                          onClick={() => void send(item.retryText ?? '', true)}
                        >
                          <RotateCcw size={14} />
                          {t('retry')}
                        </button>
                      )}
                      <button type="button" className="support-text-button" onClick={() => setHandoff(true)}>
                        {t('human')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{item.content}</p>
                )}
                {item.actions && item.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {visibleActions(item.actions, status === 'authenticated').map((action, index) => (
                      <button
                        key={`${item.id}-${action.type}-${index}`}
                        type="button"
                        className="support-chip"
                        onClick={(event) => runAction(action, event.currentTarget)}
                      >
                        {actionLabel(t, action)}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {pending && (
              <p className="support-bubble support-bubble-assistant flex items-center gap-2" role="status">
                <AlphaBetLoader size="sm" />
                <span className="text-[var(--muted)]">{t('thinking')}</span>
                <TypingDots className="text-[var(--accent)]" />
              </p>
            )}
            {handoff && (
              <div className="support-handoff">
                <h3 className="text-sm font-black">{t('humanTitle')}</h3>
                {channels === null ? (
                  <p role="status" className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
                    <AlphaBetLoader size="sm" />
                    {t('thinking')}
                  </p>
                ) : channels.length === 0 ? (
                  <p className="mt-2 text-sm leading-relaxed">{t('humanMissing')}</p>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-relaxed">{t('humanIntro')}</p>
                    <ul className="mt-3 space-y-2">
                      {channels.map((channel) => {
                        const href = channelHref(channel);
                        if (!href) return null;
                        return (
                          <li key={channel.id}>
                            <a href={href} className="text-sm font-bold text-[var(--accent-strong)] underline-offset-4 hover:underline" rel="noreferrer">
                              {t(`channel.${channel.id}`)}
                              {channel.kind === 'email' ? `: ${channel.value}` : ''}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                <pre className="support-summary">{summary}</pre>
                <button
                  type="button"
                  className="support-text-button"
                  onClick={() => {
                    const write = navigator.clipboard?.writeText(summary);
                    if (!write) {
                      setCopied(false);
                      return;
                    }
                    void write.then(() => setCopied(true)).catch(() => setCopied(false));
                  }}
                >
                  {copied ? t('copied') : t('copySummary')}
                </button>
              </div>
            )}
          </div>
          <form
            className="border-t border-[var(--line)] p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <div className="mb-2 flex justify-end">
              <button type="button" className="support-text-button" onClick={() => setHandoff(true)}>
                {t('human')}
              </button>
            </div>
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t('placeholder')}</span>
                <textarea
                  ref={inputRef}
                  value={draft}
                  rows={2}
                  maxLength={1000}
                  placeholder={t('placeholder')}
                  disabled={pending}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send(draft);
                    }
                  }}
                  className="max-h-28 min-h-11 w-full resize-none rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-[var(--dur-normal)] focus-visible:border-[var(--accent)] focus-visible:shadow-[0_0_0_3px_var(--accent-glow)]"
                />
              </label>
              <button type="submit" className="support-icon-button" aria-label={t('send')} disabled={pending || !draft.trim()}>
                <Send size={18} className="rtl:-scale-x-100" />
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}

function visibleActions(actions: SupportAction[], authenticated: boolean): SupportAction[] {
  if (authenticated) return actions;
  const guestActions = actions.map((action): SupportAction =>
    action.type === 'open_cashier' ? { type: 'open_login' } : action,
  );
  return guestActions.filter(
    (action, index) => action.type !== 'open_login' || guestActions.findIndex((item) => item.type === 'open_login') === index,
  );
}

function actionLabel(
  t: ReturnType<typeof useTranslations<'supportChat'>>,
  action: SupportAction,
) {
  if (action.type === 'navigate' && action.search) return t('actionSearchFor', { query: action.search });
  if (action.type === 'navigate') {
    const labels = {
      casino: 'actionCasino',
      live_casino: 'actionLive',
      sports: 'actionSports',
      promotions: 'actionPromotions',
      search: 'actionSearch',
      account: 'actionAccount',
      responsible_gaming: 'actionResponsible',
      support: 'actionSupport',
      journal: 'actionJournal',
    } as const;
    return t(labels[action.target]);
  }
  if (action.type === 'open_cashier') return t(action.mode === 'deposit' ? 'actionDeposit' : 'actionWithdraw');
  if (action.type === 'open_login') return t('actionLogin');
  if (action.type === 'open_registration') return t('actionRegister');
  return t('actionHuman');
}
