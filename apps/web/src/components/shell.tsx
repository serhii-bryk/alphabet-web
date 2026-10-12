'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Gamepad2,
  House,
  Menu,
  Percent,
  Search,
  Trophy,
  UserRound,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { IconButton } from './ui';
import { Drawer } from './drawer';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeSwitcher } from './theme-switcher';
import { Wordmark } from './wordmark';
import { CommandSearch, SearchTrigger } from './search';
import { ConnectionStatus } from './connection-status';
import { GameLaunchProvider } from './game-launch/provider';
import { SupportChatProvider, SupportMenuButton } from './support/support-chat';
import { AuthProvider, useAuthDialog } from './auth/auth-provider';
import { CashierProvider, DepositButton } from './cashier/cashier-provider';
import { DrawerAuth, HeaderAuth, MobileHeaderAuth } from './auth/header-auth';
import { useEndSession, useSession } from './auth/session';
import { ProductNav } from './product-nav';
import { SiteFooter } from './site-footer';

const nav = [
  { href: '/casino', labelKey: 'casino', icon: House },
  { href: '/live-casino', labelKey: 'live', icon: Gamepad2 },
  { href: '/sports', labelKey: 'sports', icon: Trophy },
  { href: '/promotions', labelKey: 'promotions', icon: Percent },
  { href: '/search', labelKey: 'search', icon: Search },
] as const;
const mobileNav = [
  ...nav.slice(0, 4),
  { href: '/account', labelKey: 'account', icon: UserRound },
] as const;
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
            className="flex h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-semibold transition"
            style={{
              background: active ? 'var(--surface-2)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--muted)',
            }}
          >
            <Icon size={19} />
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
  const navT = useTranslations('nav');
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
  return (
    <AuthProvider>
      <CashierProvider>
      <SessionGameLaunch>
      <SupportChatProvider>
      <div className={`shell ${collapsed ? 'sidebar-collapsed' : ''} ${sports ? 'shell-sports' : ''}`} id="app-shell">
        <header className="fixed inset-x-0 top-0 z-[64] flex h-[var(--header-h)] items-center gap-2 border-b border-[var(--line)] bg-[var(--bg)]/95 px-3 backdrop-blur-sm lg:gap-3 lg:px-5">
          <IconButton label={shellT('openMenu')} className="mobile-only" onClick={() => setDrawer(true)}>
            <Menu size={20} />
          </IconButton>
          <Link href="/casino" className="flex min-w-0 items-center text-lg font-black tracking-tight">
            <Wordmark compact />
          </Link>
          <div className="desktop-only ms-3 shrink-0">
            <ProductNav className="w-[220px]" />
          </div>
          <div className="desktop-only ms-4 flex-1 justify-center">
            <SearchTrigger />
          </div>
          <div className="ms-auto flex items-center gap-2">
            <div className="mobile-only">
              <SearchTrigger iconOnly />
            </div>
            <div className="desktop-only min-w-0 gap-2">
              <HeaderAuth />
            </div>
            <div className="mobile-only">
              <MobileHeaderAuth />
            </div>
            <div className="desktop-only">
              <DepositButton appearance="header" />
            </div>
          </div>
        </header>
        <aside
          className="desktop-only fixed bottom-0 start-0 top-[var(--header-h)] z-[64] w-[236px] flex-col border-e border-[var(--line)] bg-[var(--surface)] p-3 transition-[width]"
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
              <Placeholder icon={UserRound} label={navT('account')} compact={collapsed} />
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
            <Placeholder icon={UserRound} label={navT('account')} />
            <DepositButton onNavigate={() => setDrawer(false)} />
            <SupportMenuButton onNavigate={() => setDrawer(false)} />
          </div>
        </Drawer>
        <main className="main">
          <div
            className={`mobile-only sticky top-[var(--header-h)] z-30 border-b border-[var(--line)] bg-[var(--bg)]/95 px-3 py-2 backdrop-blur-sm ${sports ? 'mb-0' : '-mx-4 mb-4'}`}
          >
            <ProductNav />
          </div>
          {children}
          {!sports && <SiteFooter />}
        </main>
        <nav
          aria-label={navT('mobile')}
          className="mobile-only fixed inset-x-0 bottom-0 z-40 grid h-[var(--bottom-h)] grid-cols-5 border-t border-[var(--line)] bg-[var(--surface)] px-1"
        >
          {mobileNav.map(({ href, labelKey, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? 'page' : undefined}
              className="flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-semibold"
              style={{ color: path === href ? 'var(--accent)' : 'var(--muted)' }}
            >
              <Icon size={19} />
              <span className="truncate">{navT(labelKey)}</span>
            </Link>
          ))}
        </nav>
        <CommandSearch />
        <ConnectionStatus />
      </div>
      </SupportChatProvider>
      </SessionGameLaunch>
      </CashierProvider>
    </AuthProvider>
  );
}
function SessionGameLaunch({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const endSession = useEndSession();
  const { openLogin } = useAuthDialog();
  return (
    <GameLaunchProvider
      authenticated={status === 'authenticated'}
      onAuthRequired={openLogin}
      onSessionEnded={endSession}
    >
      {children}
    </GameLaunchProvider>
  );
}
function Placeholder({
  icon: Icon,
  label,
  compact = false,
}: {
  icon: typeof UserRound;
  label: string;
  compact?: boolean;
}) {
  const shellT = useTranslations('shell');
  return (
    <button
      title={shellT('itemPlaceholder', { label })}
      className="flex h-11 w-full items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]"
    >
      <Icon size={19} />
      {!compact && label}
    </button>
  );
}
