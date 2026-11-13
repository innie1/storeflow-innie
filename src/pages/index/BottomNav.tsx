import { MoreHorizontal } from 'lucide-react';
import { renderTabIcon } from './navigation';
import type { IndexScreenReady } from './useIndexScreen';

/**
 * The tab bar along the bottom on phones.
 */
export default function BottomNav({ s }: { s: IndexScreenReady }) {
  const {
    tab, orders, setTab, filterLowStock, setFilterLowStock, showMoreMenu, setShowMoreMenu,
    allowedMainTabs, allowedCategories,
  } = s;
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-md border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-between w-full max-w-lg mx-auto px-1 py-1">
        {allowedMainTabs.map(t => {
          const isActive = tab === t.id;
          const pendingOrdersCount = t.id === 'orders' ? orders.filter(o => o.status === 'Pending').length : 0;
          return (
            <button
              key={t.id}
              data-guide={`tab-${t.id}`}
              onClick={() => { setTab(t.id); setFilterLowStock(t.id !== 'inventory' ? false : filterLowStock); setShowMoreMenu(false); }}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 text-[10px] transition-all relative cursor-pointer min-w-0 ${
                isActive ? 'text-yellow-500 scale-105 font-bold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="relative flex items-center justify-center h-5 w-5 shrink-0">
                {renderTabIcon(t.id, isActive)}
                {pendingOrdersCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center px-[3px] border border-background leading-none">
                    {pendingOrdersCount > 9 ? '9+' : pendingOrdersCount}
                  </span>
                )}
              </span>
              <span className={`font-display leading-none mt-1 truncate w-full text-center text-[11px] ${isActive ? 'font-bold' : 'font-medium'}`}>{t.label}</span>
            </button>
          );
        })}
        {/* More button */}
        <button
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 text-[10px] transition-all cursor-pointer min-w-0 ${
            allowedCategories.some(cat => cat.subItems.some(sub => sub.tabId === tab)) || ['settings', 'history', 'marketplace', 'communication-center', 'goals', 'staff'].includes(tab) ? 'text-yellow-500 scale-105 font-bold' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="flex items-center justify-center h-5 w-5 shrink-0">
            <MoreHorizontal className="w-5 h-5" />
          </span>
          <span className="font-display font-medium leading-none mt-1 truncate w-full text-center text-[11px]">More</span>
        </button>
      </div>
    </nav>
  );
}
