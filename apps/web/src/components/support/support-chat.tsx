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
import { ChevronDown, LifeBuoy, Minus, RotateCcw, Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CatalogGame, SupportAction, SupportCatalogGame, SupportChannel, SupportChatMode, SupportFaqId, SupportSection } from '@brand/contracts';
import type { RegistrationPrefill } from '../auth/registration-dialog';
import { usePathname, useRouter } from '@/i18n/navigation';
import { promotionHref } from '@/data/promotions';
import { fetchSupportChannels, sendSupportChat, SupportRequestError } from '@/data/support-browser';
import { useAuthDialog } from '../auth/auth-provider';
import { useSession } from '../auth/session';
import { useCashier } from '../cashier/cashier-provider';
import { openCasinoGameSection } from '../game-launch/casino-nav';
import { useGameLauncher } from '../game-launch/provider';
import { isDesktopViewport } from '../game-launch/viewport';
import { AlphaBetLoader, TypingDots } from '../alphabet-loader';
import { startRouteProgress } from '../route-progress';
import { Button } from '../ui';
import { supportActionHref, visibleSupportActions } from './actions';
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

const faqTopics = [
  { id: 'registration', title: 'faqRegistration' },
  { id: 'verification', title: 'faqVerification' },
  { id: 'deposits', title: 'faqDeposits' },
  { id: 'withdrawals', title: 'faqWithdrawals' },
  { id: 'wallet', title: 'faqWallet' },
  { id: 'casino', title: 'faqCasino' },
  { id: 'sports', title: 'faqSports' },
  { id: 'promotions', title: 'faqPromotions' },
  { id: 'favorites', title: 'faqFavorites' },
  { id: 'account', title: 'faqAccount' },
  { id: 'responsible', title: 'faqResponsible' },
  { id: 'contact', title: 'faqContact' },
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
      <span className="grid size-5 shrink-0 place-items-center">
        <LifeBuoy size={18} aria-hidden />
      </span>
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
  const { focusedGame, launch } = useGameLauncher();
  const titleId = useId();
  const modeId = useId();
  const topicsId = useId();
  const topicsPanelId = `${topicsId}-panel`;
  const supportTabId = `${modeId}-support`;
  const assistantTabId = `${modeId}-assistant`;
  const logId = `${modeId}-log`;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [messages, setMessages] = useState<SupportTranscriptItem[]>([]);
  const [mode, setMode] = useState<SupportChatMode>('support');
  const [draft, setDraft] = useState('');
  const [topicsExpanded, setTopicsExpanded] = useState(false);
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
      setMode(stored.mode);
      setDraft(stored.draft);
      setTopicsExpanded(stored.topicsExpanded === true);
      if (stored.open) onOpen();
    }
    setHydrated(true);
    // Restore the in-tab conversation once. onOpen is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeSupportSession({ open, mode, draft, topicsExpanded, messages });
  }, [draft, hydrated, messages, mode, open, topicsExpanded]);

  useEffect(() => {
    if (wasOpen.current && !open) openerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Search and other overlays call preventDefault on Escape. Leave the chat open so dismissing them does not wipe the panel.
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
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

  const runAction = useCallback(
    (action: SupportAction, opener: HTMLElement | null, games?: SupportCatalogGame[]) => {
      if (action.type === 'navigate') {
        startRouteProgress();
        router.push(supportActionHref(action));
        if (!isDesktopViewport()) onClose();
        return true;
      }
      if (action.type === 'open_cashier') {
        if (status !== 'authenticated') openLogin(opener ?? undefined);
        else openCashier(action.mode);
        return true;
      }
      if (action.type === 'open_login') {
        openLogin(opener ?? undefined);
        return true;
      }
      if (action.type === 'open_registration') {
        if (status !== 'guest') return false;
        openRegistration(opener ?? undefined);
        return true;
      }
      if (action.type === 'open_human_support') {
        setHandoff(true);
        return true;
      }
      if (action.type === 'scroll_to') {
        openCasinoGameSection(pathname, (href) => {
          startRouteProgress();
          router.push(href);
        });
        return true;
      }
      if (action.type === 'open_promotion') {
        startRouteProgress();
        router.push(promotionHref(action.slug));
        if (!isDesktopViewport()) onClose();
        return true;
      }
      if (action.type === 'open_game') {
        const game = games?.find((item) => item.id === action.gameId && item.active);
        if (!game) return false;
        const launchMode = status === 'authenticated' ? 'real' : game.demoPlayEnabled ? 'demo' : 'real';
        launch(toCatalogGame(game), opener, launchMode);
        return true;
      }
      if (action.type === 'fill_field') {
        if (action.field === 'search') {
          dispatchEvent(new CustomEvent('open-command-search', { detail: { opener, query: action.value } }));
          return true;
        }
        if (action.field === 'catalog_search') {
          const live = pathname === '/live-casino' || pathname.startsWith('/live-casino/');
          startRouteProgress();
          router.push(`${live ? '/live-casino' : '/casino'}?search=${encodeURIComponent(action.value)}`);
          if (!isDesktopViewport()) onClose();
          return true;
        }
        if (action.field === 'deposit_amount' || action.field === 'withdraw_amount') {
          if (status !== 'authenticated') openLogin(opener ?? undefined);
          else openCashier(action.field === 'deposit_amount' ? 'deposit' : 'withdraw', action.value);
          return true;
        }
        if (status !== 'guest') return false;
        const prefill = registrationPrefill(action);
        if (!prefill) return false;
        openRegistration(opener ?? undefined, prefill);
        return true;
      }
      return false;
    },
    [launch, onClose, openCashier, openLogin, openRegistration, pathname, router, status],
  );

  const send = useCallback(
    async (text: string, options?: { faqId?: SupportFaqId; reuse?: boolean }) => {
      const content = redactSensitive(text.trim()).slice(0, 500);
      if (!content || pending) return;
      const prior = messages.filter((item) => !item.errorCode);
      if (options?.reuse && (prior.length === 0 || prior[prior.length - 1]?.role !== 'user')) return;
      const userMessage: SupportTranscriptItem = { id: nextId(), role: 'user', content };
      const history = (options?.reuse ? prior : [...prior, userMessage]).slice(-8);
      const gameTitle = focusedGame?.title.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '';
      setMessages((current) => (options?.reuse ? prior : [...current, userMessage]));
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
          mode,
          ...(options?.faqId ? { faqId: options.faqId } : {}),
        });
        let assistantText = reply.message;
        if (reply.autoRun && reply.actions[0]) {
          const completed = runAction(reply.actions[0], inputRef.current, reply.games);
          if (!completed) assistantText = t('actionFailed');
        }
        setMessages((current) => [
          ...current,
          {
            id: nextId(),
            role: 'assistant',
            content: assistantText,
            actions: reply.actions,
            games: reply.games,
            related: reply.related,
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
    [activeLocale, focusedGame, messages, mode, pathname, pending, runAction, status, t],
  );

  const clear = () => {
    setMessages([]);
    setDraft('');
    setTopicsExpanded(false);
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
          aria-haspopup="dialog"
          aria-expanded={false}
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
          data-mode={mode}
        >
          <header className="support-panel-header border-b border-[var(--line)] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[var(--shadow-accent)]">
                <LifeBuoy size={17} />
              </span>
              <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-black">
                {mode === 'assistant' ? t('assistantTitle') : t('title')}
              </h2>
              <button type="button" className="support-text-button" onClick={clear}>
                {t('newChat')}
              </button>
              <button type="button" className="support-icon-button" aria-label={t('minimize')} onClick={onClose}>
                <Minus size={18} />
              </button>
            </div>
            <div
              className="support-mode"
              role="tablist"
              aria-label={t('modeLabel')}
              onKeyDown={(event) => {
                const forward = activeLocale === 'ar' ? 'ArrowLeft' : 'ArrowRight';
                const backward = activeLocale === 'ar' ? 'ArrowRight' : 'ArrowLeft';
                const next =
                  event.key === forward || event.key === 'ArrowDown'
                    ? mode === 'support'
                      ? 'assistant'
                      : 'support'
                    : event.key === backward || event.key === 'ArrowUp'
                      ? mode === 'assistant'
                        ? 'support'
                        : 'assistant'
                      : event.key === 'Home'
                        ? 'support'
                        : event.key === 'End'
                          ? 'assistant'
                          : null;
                if (!next) return;
                event.preventDefault();
                setMode(next);
                document.getElementById(next === 'support' ? supportTabId : assistantTabId)?.focus();
              }}
            >
              <button
                id={supportTabId}
                type="button"
                role="tab"
                className="support-mode-tab"
                aria-selected={mode === 'support'}
                aria-controls={logId}
                tabIndex={mode === 'support' ? 0 : -1}
                onClick={() => setMode('support')}
              >
                {t('modeSupport')}
              </button>
              <button
                id={assistantTabId}
                type="button"
                role="tab"
                className="support-mode-tab"
                aria-selected={mode === 'assistant'}
                aria-controls={logId}
                tabIndex={mode === 'assistant' ? 0 : -1}
                onClick={() => setMode('assistant')}
              >
                {t('modeAssistant')}
              </button>
            </div>
            <p className="support-mode-hint">{mode === 'assistant' ? t('assistantHint') : t('supportHint')}</p>
          </header>
          <div id={logId} ref={logRef} className="support-log" role="tabpanel" aria-labelledby={mode === 'assistant' ? assistantTabId : supportTabId} aria-live="polite">
            {messages.length === 0 && !pending && (
              <p className="text-sm text-[var(--muted)]">{mode === 'assistant' ? t('assistantEmpty') : t('empty')}</p>
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
                          onClick={() => void send(item.retryText ?? '', { reuse: true })}
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
                {item.related && item.related.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2" aria-label={t('relatedLabel')}>
                    {item.related.map((id) => {
                      const topic = faqTopics.find((entry) => entry.id === id);
                      if (!topic) return null;
                      return (
                        <button key={id} type="button" className="support-chip" onClick={() => void send(t(topic.title), { faqId: id })}>
                          {t(topic.title)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {item.actions && item.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {visibleSupportActions(item.actions, status === 'authenticated').map((action, index) => (
                      <button
                        key={`${item.id}-${action.type}-${index}`}
                        type="button"
                        className="support-chip"
                        onClick={(event) => runAction(action, event.currentTarget, item.games)}
                      >
                        {actionLabel(t, action, item.games)}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {pending && (
              <p className="support-bubble support-bubble-assistant flex items-center gap-2" role="status">
                <AlphaBetLoader size="sm" />
                <span className="text-[var(--muted)]">{mode === 'assistant' ? t('assistantThinking') : t('thinking')}</span>
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
            <div className="support-topics-block" data-expanded={topicsExpanded ? 'true' : 'false'}>
              <div className="support-topics-head">
                <p id={topicsId} className="support-topics-label">
                  {t('faqLabel')}
                </p>
                <button
                  type="button"
                  className="support-text-button support-topics-toggle"
                  aria-expanded={topicsExpanded}
                  aria-controls={topicsPanelId}
                  onClick={() => setTopicsExpanded((current) => !current)}
                >
                  {topicsExpanded ? t('topicsLess') : t('topicsMore')}
                  <ChevronDown aria-hidden size={14} />
                </button>
              </div>
              <div id={topicsPanelId} className="support-topics-clip">
                <div className="support-topics" role="group" aria-labelledby={topicsId}>
                  {faqTopics.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="support-chip"
                      onClick={() => void send(t(item.title), { faqId: item.id })}
                    >
                      {t(item.title)}
                    </button>
                  ))}
                  <button type="button" className="support-chip" onClick={() => setHandoff(true)}>
                    {t('suggestHuman')}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t('placeholder')}</span>
                <textarea
                  ref={inputRef}
                  value={draft}
                  rows={2}
                  maxLength={500}
                  placeholder={mode === 'assistant' ? t('assistantPlaceholder') : t('placeholder')}
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

function actionLabel(
  t: ReturnType<typeof useTranslations<'supportChat'>>,
  action: SupportAction,
  games?: SupportCatalogGame[],
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
      favorites: 'actionFavorites',
      recently_played: 'actionRecent',
    } as const;
    return t(labels[action.target]);
  }
  if (action.type === 'open_cashier') return t(action.mode === 'deposit' ? 'actionDeposit' : 'actionWithdraw');
  if (action.type === 'open_login') return t('actionLogin');
  if (action.type === 'open_registration') return t('actionRegister');
  if (action.type === 'scroll_to') return t('actionScrollGames');
  if (action.type === 'open_promotion') {
    const labels = {
      welcome: 'actionPromoWelcome',
      'weekend-live': 'actionPromoWeekend',
      'journal-drops': 'actionPromoJournal',
    } as const;
    return t(labels[action.slug]);
  }
  if (action.type === 'open_game') {
    const title = games?.find((game) => game.id === action.gameId)?.title;
    return title ? t('actionOpenGame', { title }) : t('actionOpenGameGeneric');
  }
  if (action.type === 'fill_field') {
    const labels = {
      search: 'actionFillSearch',
      catalog_search: 'actionFillFilter',
      deposit_amount: 'actionFillDeposit',
      withdraw_amount: 'actionFillWithdraw',
      email: 'actionFillEmail',
      first_name: 'actionFillFirstName',
      last_name: 'actionFillLastName',
      country: 'actionFillCountry',
      phone: 'actionFillPhone',
    } as const;
    return t(labels[action.field], { value: action.value });
  }
  return t('actionHuman');
}

function registrationPrefill(action: Extract<SupportAction, { type: 'fill_field' }>): RegistrationPrefill | null {
  if (action.field === 'email') return { email: action.value };
  if (action.field === 'first_name') return { firstName: action.value };
  if (action.field === 'last_name') return { lastName: action.value };
  if (action.field === 'country') return { country: action.value };
  if (action.field === 'phone') return { phone: action.value };
  return null;
}

function toCatalogGame(game: SupportCatalogGame): CatalogGame {
  return {
    id: game.id,
    slug: game.slug,
    title: game.title,
    kind: game.kind,
    imageUrl: game.imageUrl,
    provider: null,
    categories: [],
    demoPlayEnabled: game.demoPlayEnabled,
    active: game.active,
  };
}
