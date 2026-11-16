import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Calculator,
  Utensils,
  ClipboardList,
  Package,
  Scale,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { apiRequest, getStoredToken, setStoredToken } from './lib/api.ts';
import { LoginView } from './components/LoginView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { PosView } from './components/PosView.tsx';
import { MenuManagerView } from './components/MenuManagerView.tsx';
import { TablesOrdersView } from './components/TablesOrdersView.tsx';
import { InventoryView } from './components/InventoryView.tsx';
import { AccountingAuditView } from './components/AccountingAuditView.tsx';
import { UsersRolesView } from './components/UsersRolesView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { ReceiptModal } from './components/PrintViews.tsx';
import { DesktopInstallButton, OfflineIndicator } from './components/DesktopInstallControls.tsx';
import type { Order, PermissionKey, RestaurantSettings, User } from './shared/types.ts';

type TabKey = 'dashboard' | 'pos' | 'menu' | 'orders' | 'inventory' | 'accounting' | 'users' | 'settings';

interface NavItem {
  key: TabKey;
  label: string;
  permission?: PermissionKey;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'لوحة التحكم والتقارير', permission: 'dashboard.view', icon: LayoutDashboard },
  { key: 'pos', label: 'نقطة البيع (الكاشير)', permission: 'pos.create_order', icon: Calculator },
  { key: 'orders', label: 'الطلبات والطاولات', permission: 'tables.view', icon: ClipboardList },
  { key: 'menu', label: 'الأصناف والأحجام والمنيو', permission: 'menu.view', icon: Utensils },
  { key: 'inventory', label: 'المخزون والمشتريات', permission: 'inventory.view', icon: Package },
  { key: 'accounting', label: 'المحاسبة والتدقيق المالي', permission: 'accounting.view', icon: Scale },
  { key: 'users', label: 'المستخدمون والصلاحيات', permission: 'users.manage', icon: Users },
  { key: 'settings', label: 'الإعدادات و PHP/MySQL', permission: 'settings.manage', icon: Settings },
];

function resolveInitialTab(loggedUser: User): TabKey {
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode') as TabKey | null;
  const isStandaloneDesktop =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches;

  if (modeParam) {
    const matched = NAV_ITEMS.find(
      (n) => n.key === modeParam && (!n.permission || loggedUser.permissions.includes(n.permission))
    );
    if (matched) return matched.key;
  }

  const savedMode = localStorage.getItem('sufra_desktop_startup_mode');
  if (savedMode === 'pos' && loggedUser.permissions.includes('pos.create_order')) {
    return 'pos';
  }
  if (savedMode === 'dashboard' && loggedUser.permissions.includes('dashboard.view')) {
    return 'dashboard';
  }

  // When launched as a standalone Desktop App, default straight to the POS sales register if permitted
  if (isStandaloneDesktop && loggedUser.permissions.includes('pos.create_order')) {
    return 'pos';
  }

  const firstPermitted = NAV_ITEMS.find((n) => !n.permission || loggedUser.permissions.includes(n.permission));
  return firstPermitted ? firstPermitted.key : 'pos';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [inspectOrder, setInspectOrder] = useState<Order | null>(null);
  const [isFullscreenPos, setIsFullscreenPos] = useState(false);

  async function bootstrapSession() {
    const token = getStoredToken();
    if (!token) {
      setBooting(false);
      return;
    }
    try {
      const res = await apiRequest<{ user: User; settings: RestaurantSettings }>('/api/auth/me');
      setUser(res.user);
      setSettings(res.settings);
      setActiveTab(resolveInitialTab(res.user));
    } catch {
      setStoredToken(null);
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    void bootstrapSession();
  }, []);

  async function handleLoginSuccess(loggedUser: User) {
    setUser(loggedUser);
    const s = await apiRequest<RestaurantSettings>('/api/settings');
    setSettings(s);
    setActiveTab(resolveInitialTab(loggedUser));
  }

  async function handleLogout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    setIsFullscreenPos(false);
  }

  function handleSelectTab(tab: TabKey) {
    setActiveTab(tab);
    if (tab !== 'pos') {
      setIsFullscreenPos(false);
    }
  }

  function toggleFullscreenPos() {
    const next = !isFullscreenPos;
    setIsFullscreenPos(next);
    if (next && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // ignore if blocked by iframe permissions
      });
    } else if (!next && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {
        // ignore
      });
    }
  }

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FA] text-sm font-medium text-[#0B1D36]">
        جاري تهيئة نظام سُفرة POS...
      </div>
    );
  }

  if (!user || !settings) {
    return <LoginView onSuccess={(u) => void handleLoginSuccess(u)} />;
  }

  const hasPerm = (p?: PermissionKey) => !p || user.permissions.includes(p);
  const visibleNav = NAV_ITEMS.filter((item) => hasPerm(item.permission));
  const currentNav = visibleNav.find((n) => n.key === activeTab) || visibleNav[0];
  const hideSidebar = isFullscreenPos && currentNav?.key === 'pos';

  return (
    <div className="flex min-h-screen bg-[#F5F7FA] text-[#0B1D36]">
      {/* Royal Navy Desktop Sidebar */}
      {!hideSidebar && (
        <aside className="no-print hidden w-64 shrink-0 flex-col border-l border-[#132A4A] bg-gradient-to-b from-[#071324] via-[#0B1D36] to-[#132A4A] text-white lg:flex">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-orange-500" />
              <span className="text-base font-extrabold tracking-tight text-white">{settings.restaurant_name}</span>
            </div>
            <div className="mt-1 text-xs text-teal-300/90">سُفرة POS · تطبيق سطح المكتب</div>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = currentNav?.key === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => handleSelectTab(item.key)}
                  className={`flex w-full items-center gap-3 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-right text-xs font-semibold transition-all ${
                    active
                      ? 'border border-teal-400/35 bg-teal-500/20 text-teal-200 shadow-xs'
                      : 'border border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-teal-300' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-white/10 bg-[#071324]/50 p-4">
            <div className="mb-3">
              <div className="truncate text-xs font-bold text-white">{user.full_name}</div>
              <div className="truncate text-[11px] text-teal-300/80">{user.role_display_name}</div>
            </div>
            <button
              onClick={() => void handleLogout()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-orange-400/40 hover:bg-orange-500/15 hover:text-orange-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </aside>
      )}

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-[#071324]/65 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 flex w-64 flex-col bg-gradient-to-b from-[#071324] via-[#0B1D36] to-[#132A4A] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <span className="text-sm font-extrabold text-white">{settings.restaurant_name}</span>
              <button onClick={() => setMobileMenuOpen(false)}>
                <X className="h-5 w-5 text-slate-300" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = currentNav?.key === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      handleSelectTab(item.key);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold ${
                      active
                        ? 'border border-teal-400/35 bg-teal-500/20 text-teal-200'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-white/10 p-4">
              <button
                onClick={() => void handleLogout()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 py-2 text-xs font-semibold text-orange-300"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineIndicator />

        <header className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3.5 shadow-[0_1px_2px_rgba(11,29,54,0.03)]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-[#0B1D36] lg:hidden"
              aria-label="القائمة"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-base font-extrabold text-[#0B1D36]">{currentNav?.label}</h1>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <DesktopInstallButton />

            {hasPerm('pos.create_order') && currentNav?.key !== 'pos' && (
              <button
                onClick={() => handleSelectTab('pos')}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-orange-600/20 transition-all hover:from-orange-700 hover:to-orange-600"
              >
                <Calculator className="h-3.5 w-3.5" />
                <span>فتح نقطة البيع</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-5 lg:p-6">
          {currentNav?.key === 'dashboard' && (
            <DashboardView
              settings={settings}
              canExport={hasPerm('reports.export')}
              onNavigate={(tab) => handleSelectTab(tab as TabKey)}
              onInspectOrder={(o) => setInspectOrder(o)}
            />
          )}

          {currentNav?.key === 'pos' && (
            <PosView
              settings={settings}
              canApplyDiscount={hasPerm('pos.apply_discount')}
              onOrderCreated={(ord) => setInspectOrder(ord)}
              isFullscreenPos={hideSidebar}
              onToggleFullscreenPos={toggleFullscreenPos}
            />
          )}

          {currentNav?.key === 'orders' && (
            <TablesOrdersView
              settings={settings}
              canManageTables={hasPerm('tables.manage')}
              canVoid={hasPerm('pos.void_order')}
              canExport={hasPerm('reports.export')}
              onInspectOrder={(o) => setInspectOrder(o)}
            />
          )}

          {currentNav?.key === 'menu' && (
            <MenuManagerView settings={settings} canManage={hasPerm('menu.manage')} />
          )}

          {currentNav?.key === 'inventory' && (
            <InventoryView
              settings={settings}
              canManage={hasPerm('inventory.manage')}
              canExport={hasPerm('reports.export')}
            />
          )}

          {currentNav?.key === 'accounting' && (
            <AccountingAuditView
              settings={settings}
              canManageExpenses={hasPerm('accounting.manage_expenses')}
              canExport={hasPerm('reports.export')}
            />
          )}

          {currentNav?.key === 'users' && <UsersRolesView />}

          {currentNav?.key === 'settings' && (
            <SettingsView settings={settings} onSettingsUpdated={(s) => setSettings(s)} />
          )}
        </main>
      </div>

      <ReceiptModal order={inspectOrder} settings={settings} onClose={() => setInspectOrder(null)} />
    </div>
  );
}
