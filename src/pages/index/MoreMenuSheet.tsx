import { TabId } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import ToggleRow from '@/components/Toggle';
import { Settings as SettingsIcon, ChevronDown, BarChart3 } from 'lucide-react';
import ScrollLock from '@/components/ScrollLock';
import { FLAT_CATEGORY_TABS, renderTabIcon, isTabAllowed } from './navigation';
import type { IndexScreenReady } from './useIndexScreen';

/**
 * The More sheet on phones: every screen that is not on the bottom bar, by group.
 */
export default function MoreMenuSheet({ s }: { s: IndexScreenReady }) {
  const {
    store, setStore, currentUser, tab, setTab, setShowMoreMenu, expandedCategories, toggleCategory,
    allowedCategories,
  } = s;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end animate-fade-in" onClick={() => setShowMoreMenu(false)}><ScrollLock />
      <div
        className="w-full bg-card border-t border-border rounded-t-3xl shadow-2xl p-5 max-h-[75vh] overflow-y-auto space-y-4 animate-slide-up flex flex-col no-scrollbar"
        style={{ maxWidth: '480px', margin: '0 auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drawer Handle */}
        <div className="flex justify-center -mt-2"><div className="w-10 h-1.5 rounded-full bg-border" /></div>

        <div className="flex items-center justify-between pb-2 border-b border-border">
          <h3 className="font-display font-bold text-base">More Tools & Features</h3>
          <button onClick={() => setShowMoreMenu(false)} className="text-muted-foreground text-sm font-semibold hover:underline">Done</button>
        </div>

        <div className="space-y-2">
          {allowedCategories.map(cat => {
            const directTab = FLAT_CATEGORY_TABS[cat.id];
            const isFlat = Boolean(directTab);
            const isExpanded = !!expandedCategories[cat.id];
            const targetTab: TabId = directTab || 'dashboard';
            const hasActiveSub = isFlat ? tab === targetTab : cat.subItems.some(sub => tab === sub.tabId);

            return (
              <div key={cat.id} className="border border-border/80 rounded-xl overflow-hidden bg-surface-2/40">
                <button
                  onClick={() => {
                    if (isFlat) {
                      setTab(targetTab);
                      setShowMoreMenu(false);
                    } else {
                      toggleCategory(cat.id);
                    }
                  }}
                  className={`w-full flex items-center justify-between p-3.5 text-xs font-display font-semibold transition-colors ${
                    hasActiveSub ? 'bg-primary/5 text-primary' : 'text-foreground'
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
                  <div className="px-3.5 pb-3 pt-1 grid grid-cols-2 gap-2 bg-background/40 border-t border-border/50 animate-slide-down">
                    {cat.subItems.map(sub => {
                      const isSubActive = tab === sub.tabId;
                      return (
                        <button
                          key={sub.label}
                          onClick={() => {
                            setTab(sub.tabId);
                            setShowMoreMenu(false);
                          }}
                          className={`flex items-center gap-2 p-2.5 rounded-lg text-[11px] font-display font-semibold text-left transition-colors border ${
                            isSubActive
                              ? 'bg-primary/10 text-primary border-primary/20'
                              : 'bg-card text-muted-foreground border-border hover:text-foreground'
                          }`}
                        >
                          {renderTabIcon(sub.tabId, isSubActive, "w-3.5 h-3.5")}
                          <span className="truncate">{sub.label}</span>
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
              onClick={() => {
                setTab('history');
                setShowMoreMenu(false);
              }}
              className={`w-full flex items-center justify-between p-3.5 text-xs font-display font-semibold transition-colors border rounded-xl bg-surface-2/40 ${
                tab === 'history' ? 'bg-primary/5 text-primary border-primary/20' : 'text-foreground border-border hover:bg-surface-2'
              }`}
            >
              <div className="flex items-center gap-3">
                <BarChart3 className="w-4 h-4" />
                <span>Reports</span>
              </div>
            </button>
          )}

          {isTabAllowed('settings', currentUser) && (
            <button
              onClick={() => {
                setTab('settings');
                setShowMoreMenu(false);
              }}
              className={`w-full flex items-center justify-between p-3.5 text-xs font-display font-semibold transition-colors border rounded-xl bg-surface-2/40 ${
                tab === 'settings' ? 'bg-primary/5 text-primary border-primary/20' : 'text-foreground border-border hover:bg-surface-2'
              }`}
            >
              <div className="flex items-center gap-3">
                <SettingsIcon className="w-4 h-4" />
                <span>Settings</span>
              </div>
            </button>
          )}

          <div className="border border-border/80 rounded-xl bg-surface-2/40 px-3.5">
            <ToggleRow
              checked={store.uiMode === 'simple'}
              onChange={(v) => {
                const updated = { ...store, uiMode: (v ? 'simple' : 'full') as 'simple' | 'full' };
                saveStore(updated);
                setStore(updated);
                setShowMoreMenu(false);
              }}
              label="Simple Mode"
              description="One big mic button for quick voice sales. Switch back here anytime."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
