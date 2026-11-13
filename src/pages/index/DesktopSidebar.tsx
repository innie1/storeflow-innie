import { TabId } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import ToggleRow from '@/components/Toggle';
import StoreLogo from '@/components/StoreLogo';
import { Settings as SettingsIcon, Lock, ChevronDown, BarChart3 } from 'lucide-react';
import { FLAT_CATEGORY_TABS, renderTabIcon, isTabAllowed } from './navigation';
import type { IndexScreenReady } from './useIndexScreen';

/**
 * The left-hand navigation on tablets and computers (768px and wider).
 */
export default function DesktopSidebar({ s }: { s: IndexScreenReady }) {
  const {
    store, setStore, currentUser, tab, orders, setTab, filterLowStock, setFilterLowStock,
    setShowLockConfirm, expandedCategories, toggleCategory, businessTemplate, unreadCount,
    allowedMainTabs, allowedCategories,
  } = s;
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-border bg-card">
      {/* Sidebar Header */}
      <div className="p-5 border-b border-border flex flex-col gap-2">
        <h1 className="font-display font-bold text-2xl">
          <span className="text-foreground">Store</span>
          <span className="text-primary">Flow</span>
        </h1>
        <div className="flex items-center gap-2 mt-1.5 p-2 rounded-xl bg-surface-2 border border-border">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-primary/15 flex items-center justify-center text-lg shrink-0">
            {store.profile?.photo ? (
              <img src={store.profile.photo} alt="" className="w-full h-full object-cover" />
            ) : store.profile?.logoStyle ? (
              <StoreLogo storeName={store.storeName} selectedStyle={store.profile.logoStyle} className="w-full h-full" />
            ) : (
              '🏪'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-xs truncate leading-tight">{store.storeName}</p>
            <p className="text-[10px] text-muted-foreground capitalize truncate">{businessTemplate.name}</p>
          </div>
        </div>
      </div>

      {/* Sidebar Nav Links */}
      <div className="flex-1 py-4 overflow-y-auto px-3 space-y-1">
        <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground px-3 mb-2">Main Menu</p>
        {allowedMainTabs.map(t => {
          const pendingOrdersCount = t.id === 'orders' ? orders.filter(o => o.status === 'Pending').length : 0;
          return (
            <button
              key={t.id}
              data-guide={`tab-${t.id}`}
              onClick={() => { setTab(t.id); setFilterLowStock(t.id !== 'inventory' ? false : filterLowStock); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-semibold transition-colors relative ${
                tab === t.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-surface-2'
              }`}
            >
              <span className="relative flex items-center justify-center">
                {renderTabIcon(t.id, tab === t.id, "w-4.5 h-4.5")}
                {t.id === 'manager' && unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive animate-pulse" />
                )}
                {pendingOrdersCount > 0 && (
                  <span className="absolute -top-2.5 -right-2.5 min-w-[16px] h-4 rounded-full bg-yellow-500 text-black text-[9px] font-bold flex items-center justify-center px-1 animate-bounce border border-card shadow-sm">
                    {pendingOrdersCount}
                  </span>
                )}
              </span>
              <span>{t.label}</span>
            </button>
          );
        })}

        <div className="pt-4 mt-4 border-t border-border space-y-2">
          <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground px-3 mb-2">More Features</p>
          {allowedCategories.map(cat => {
            const directTab = FLAT_CATEGORY_TABS[cat.id];
            const isFlat = Boolean(directTab);
            const isExpanded = !!expandedCategories[cat.id];
            const targetTab: TabId = directTab || 'dashboard';
            const hasActiveSub = isFlat ? tab === targetTab : cat.subItems.some(sub => tab === sub.tabId);

            return (
              <div key={cat.id} className="space-y-1">
                <button
                  onClick={() => {
                    if (isFlat) {
                      setTab(targetTab);
                    } else {
                      toggleCategory(cat.id);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-display font-semibold transition-colors ${
                    hasActiveSub ? 'text-primary' : 'text-foreground hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <cat.Icon className="w-4 h-4" />
                    <span>{cat.label}</span>
                  </div>
                  {!isFlat && (
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-primary' : 'text-muted-foreground'}`} />
                  )}
                </button>

                {!isFlat && isExpanded && (
                  <div className="pl-4 space-y-1 border-l border-border ml-5 animate-slide-down">
                    {cat.subItems.map(sub => {
                      const isSubActive = tab === sub.tabId;
                      return (
                        <button
                          key={sub.label}
                          onClick={() => setTab(sub.tabId)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-display font-semibold text-left transition-colors ${
                            isSubActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {renderTabIcon(sub.tabId, isSubActive, "w-3.5 h-3.5")}
                          <span>{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {isTabAllowed('history', currentUser) && (
            <button
              onClick={() => setTab('history')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-semibold transition-colors ${
                tab === 'history' ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-surface-2'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Reports</span>
            </button>
          )}

          {isTabAllowed('settings', currentUser) && (
            <button
              onClick={() => setTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-semibold transition-colors ${
                tab === 'settings' ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-surface-2'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-border space-y-2">
        <div className="border border-border/80 rounded-xl bg-surface-2/40 px-3">
          <ToggleRow
            checked={store.uiMode === 'simple'}
            onChange={(v) => {
              const updated = { ...store, uiMode: (v ? 'simple' : 'full') as 'simple' | 'full' };
              saveStore(updated);
              setStore(updated);
            }}
            label="Simple Mode"
            description="One big mic button for quick voice sales."
          />
        </div>
        <button
          onClick={() => setShowLockConfirm(true)}
          className="w-full py-2.5 px-3 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-xs font-display font-semibold hover:bg-destructive/20 transition-colors flex items-center justify-center gap-2"
        >
          <Lock className="w-3.5 h-3.5" /> Lock Store
        </button>
        <div className="text-[10px] text-center text-muted-foreground">
          Version 1.0 · Innie Group
        </div>
      </div>
    </aside>
  );
}
