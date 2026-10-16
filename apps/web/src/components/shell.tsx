'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dices,
  Heart,
  Menu,
  Radio,
  Search,
  ShieldCheck,
  TicketPercent,
  Trophy,
  UserRound,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { IconButton } from './ui';
import { Drawer } from './drawer';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeSwitcher } from './theme-switcher';
import { Wordmark } from './wordmark';
import { CommandSearch, SearchTrigger } from './search';
import { SectionScroll } from './section-scroll';
import { ConnectionStatus } from './connection-status';
import { GameLaunchProvider } from './game-launch/provider';
import { SupportChatProvider, SupportMenuButton } from './support/support-chat';
import { AuthProvider, useAuthDialog } from './auth/auth-provider';
import { CashierProvider, DepositButton } from './cashier/cashier-provider';
import { DrawerAuth, HeaderAuth, MobileHeaderCluster } from './auth/header-auth';
import { useEndSession, useSession } from './auth/session';
import { ProductNav } from './product-nav';
import { RealityCheckReminder, SessionClockLink } from './player-control/session-clock';
import { SiteFooter } from './site-footer';
import { RouteProgress } from './route-progress';

const nav = [
  { href: '/casino', labelKey: 'casino', icon: Dices },
  { href: '/live-casino', labelKey: 'live', icon: Radio },
  { href: '/favorites', labelKey: 'favorites', icon: Heart },
  { href: '/sports', labelKey: 'sports', icon: Trophy },
  { href: '/promotions', labelKey: 'promotions', icon: TicketPercent },
  { href: '/search', labelKey: 'search', icon: Search },
] as const;
const mobileNav = [
  { href: '/casino', labelKey: 'casino', icon: Dices },
  { href: '/live-casino', labelKey: 'live', icon: Radio },
  { href: '/sports', labelKey: 'sports', icon: Trophy },
  { href: '/promotions', labelKey: 'promotions', icon: TicketPercent },
  { href: '/account', labelKey: 'account', icon: UserRound },
] as const;
function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center">
      <Icon size={18} aria-hidden />
    </span>
  );
}
function Navigation({
  onNavigate,
  compact = false,
}: {
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const path = usePathname();
  const t = useTranslations('nav');
  return (
    <nav aria-label={t('main')} className="flex flex-col gap-1">
      {nav.map(({ href, labelKey, icon: Icon }) => {
        const label = t(labelKey);
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            aria-label={compact ? label : undefined}
            className="nav-item flex h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-semibold"
          >
            <NavIcon icon={Icon} />
            {!compact && label}
          </Link>
        );
      })}
    </nav>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  const path = usePathname();
  const shellT = useTranslations('shell');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true');
  }, []);
  const toggleSidebar = () =>
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  const sports = path === '/sports';
  const area = sports ? 'sports' : path.startsWith('/live-casino') ? 'live' : path.startsWith('/casino') ? 'casino' : 'neutral';
  return (
    <AuthProvider>
      <CashierProvider>
      <SessionGameLaunch>
      <SupportChatProvider>
      <div className={`shell ${collapsed ? 'sidebar-collapsed' : ''} ${sports ? 'shell-sports' : ''}`} id="app-shell" data-area={area}>
        <header className="fixed inset-x-0 top-0 z-[64] flex h-[var(--header-h)] min-w-0 items-center gap-1.5 overflow-x-clip border-b border-[var(--line)] bg-[var(--bg)]/95 px-3 backdrop-blur-sm lg:gap-3 lg:px-5">
          <IconButton label={shellT('openMenu')} className="mobile-only shrink-0" onClick={() => setDrawer(true)}>
            <Menu size={20} />
          </IconButton>
          <Link href="/casino" className="flex min-w-0 shrink-0 items-center text-lg font-black tracking-tight min-[1100px]:shrink">
            <Wordmark compact />
          </Link>
          <div className="desktop-only ms-3 shrink-0">
            <ProductNav className="w-[220px]" />
          </div>
          <div className="desktop-only ms-4 flex-1 justify-center">
            <SearchTrigger />
          </div>
          <div className="ms-auto flex min-w-0 items-center gap-1.5 lg:gap-2">
            <div className="mobile-only min-w-0">
              <MobileHeaderCluster />
            </div>
            <div className="desktop-only">
              <SessionClockLink placement="header" />
            </div>
            <div className="desktop-only min-w-0 gap-2">
              <HeaderAuth />
            </div>
            <div className="desktop-only">
              <DepositButton appearance="header" />
            </div>
          </div>
          <RouteProgress />
        </header>
        <aside
          className="desktop-only fixed bottom-0 start-0 top-[var(--header-h)] z-[64] w-[236px] flex-col border-e border-[var(--line)] bg-[var(--surface)] p-3 transition-[width] duration-[var(--dur-normal)] ease-[var(--ease-out)]"
          style={{ width: collapsed ? 76 : 236 }}
        >
          <div className="mb-3 flex justify-end">
            <IconButton
              label={collapsed ? shellT('expandSidebar') : shellT('collapseSidebar')}
              onClick={toggleSidebar}
            >
              {collapsed ? (
                <PanelLeftOpen size={18} className="rtl:-scale-x-100" />
              ) : (
                <PanelLeftClose size={18} className="rtl:-scale-x-100" />
              )}
            </IconButton>
          </div>
          <Navigation compact={collapsed} />
          <div className="mt-auto space-y-3">
            <div className={`space-y-2 border-t border-[var(--line)] pt-3 ${collapsed ? 'flex flex-col items-center' : ''}`}>
              <LocaleSwitcher showLabel={!collapsed} />
              <ThemeSwitcher compact={collapsed} />
            </div>
            <div className="space-y-1">
              <SignedInMenuLinks compact={collapsed} />
              <DepositButton compact={collapsed} />
              <SupportMenuButton compact={collapsed} />
            </div>
          </div>
        </aside>
        <Drawer open={drawer} onClose={() => setDrawer(false)} title={shellT('menuTitle')}>
          <Navigation onNavigate={() => setDrawer(false)} />
          <div className="mt-8 space-y-3 border-t border-[var(--line)] pt-4">
            <DrawerAuth onNavigate={() => setDrawer(false)} />
            <LocaleSwitcher showLabel />
            <ThemeSwitcher />
            <SignedInMenuLinks onNavigate={() => setDrawer(false)} />
            <SupportMenuButton onNavigate={() => setDrawer(false)} />
          </div>
        </Drawer>
        <main className="main">
          <div
            className={`mobile-only sticky top-[var(--header-h)] z-30 border-b border-[var(--line)] bg-[var(--bg)]/95 px-3 py-2 backdrop-blur-sm ${sports ? 'mb-0' : '-mx-4 mb-4'}`}
          >
            <SessionClockLink placement="bar" />
            <ProductNav />
          </div>
          <div id="game-page-slot" />
          <div className="route-content">{children}</div>
          <SiteFooter />
        </main>
        <MobileNav />
        <SectionScroll />
        <CommandSearch />
        <ConnectionStatus />
        <RealityCheckReminder />
      </div>
      </SupportChatProvider>
      </SessionGameLaunch>
      </CashierProvider>
    </AuthProvider>
  );
}
function SessionGameLaunch({ children }: { children: ReactNode }) {
  const { status, session } = useSession();
  const client = useQueryClient();
  const endSession = useEndSession();
  const { openLogin } = useAuthDialog();
  const playerId = session?.playerId;
  const onRealLaunch = useCallback(() => {
    if (!playerId) return;
    void client.invalidateQueries({ queryKey: ['player', playerId, 'last-played'] });
    void client.invalidateQueries({ queryKey: ['player', playerId, 'most-played'] });
  }, [client, playerId]);
  return (
    <GameLaunchProvider
      authenticated={status === 'authenticated'}
      onAuthRequired={openLogin}
      onSessionEnded={endSession}
      onRealLaunch={onRealLaunch}
    >
      {children}
    </GameLaunchProvider>
  );
}
function SignedInMenuLinks({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { status } = useSession();
  if (status !== 'authenticated') return null;
  return (
    <>
      <PlaySafeLink compact={compact} onNavigate={onNavigate} />
      <AccountMenuLink compact={compact} onNavigate={onNavigate} />
    </>
  );
}
function MobileNav() {
  const path = usePathname();
  const navT = useTranslations('nav');
  const { status } = useSession();
  const items = mobileNav.filter((item) => status === 'authenticated' || item.href !== '/account');
  return (
    <nav
      aria-label={navT('mobile')}
      className="mobile-only fixed inset-x-0 bottom-0 z-40 grid h-[var(--bottom-h)] border-t border-[var(--line)] bg-[var(--surface)] px-1"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(({ href, labelKey, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? 'page' : undefined}
          className="bottom-nav-item flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-semibold"
          style={{ color: path === href ? 'var(--accent)' : 'var(--muted)' }}
        >
          <NavIcon icon={Icon} />
          <span className="truncate">{navT(labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}
function PlaySafeLink({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const t = useTranslations('nav');
  const label = t('playSafe');
  const active = path === '/responsible-gaming';
  return (
    <Link
      href="/responsible-gaming"
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={compact ? label : undefined}
      className="nav-item flex h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-[var(--muted)]"
    >
      <ShieldCheck size={19} />
      {!compact && label}
    </Link>
  );
}
function AccountMenuLink({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const label = useTranslations('nav')('account');
  const active = path === '/account';
  return (
    <Link
      href="/account"
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={compact ? label : undefined}
      className="nav-item flex h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-[var(--muted)]"
    >
      <NavIcon icon={UserRound} />
      {!compact && label}
    </Link>
  );
}
