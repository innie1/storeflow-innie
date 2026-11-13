import StreakDetailsPanel from '@/components/streaks/StreakDetailsPanel';
import { Lock, ChevronDown, Bell, User, UserCheck } from 'lucide-react';
import ScrollLock from '@/components/ScrollLock';
import type { IndexScreenReady } from './useIndexScreen';

/**
 * The bar along the top: the shop name and switcher, today's date, the bell and the profile menu.
 */
export default function AppHeader({ s }: { s: IndexScreenReady }) {
  const {
    store, currentUser, showProfileMenu, setShowProfileMenu, showStreakPanel, setShowStreakPanel,
    setShowLockConfirm, setShowSwitcher, setShowSwitchUser, setShowNotifications, unreadCount,
  } = s;
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border px-3 md:px-6 py-1.5 flex items-center justify-between" style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))', paddingTop: 'max(0.4rem, env(safe-area-inset-top))', paddingBottom: '0.35rem' }}>
      {/*
        The shop, and the day.

        This corner read "StoreFlow" in big letters with the shop's own
        name under it in small grey type - the app introducing itself on
        every screen to the person who opened it. The shop is the title
        now (still the button that switches shops), with today's date
        under it. The app's name stays on the sidebar and the sign-in
        screen.
      */}
      <div className="flex flex-col text-left min-w-0">
        <button
          onClick={() => { if (!store.staffDevice) setShowSwitcher(true); }}
          disabled={!!store.staffDevice}
          className="w-fit max-w-full self-start inline-flex items-center gap-1 text-[17px] leading-tight font-display font-bold text-foreground hover:text-primary transition-colors rounded cursor-pointer active:scale-95 min-w-0"
          title="Switch Store"
        >
          <span className="truncate max-w-[200px]">{store.storeName || 'My shop'}</span>
          {!store.staffDevice && <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
        </button>
        <span className="text-xs text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/*
          One bell, with a number.

          A flame for the streak, a bell with a pulsing red dot and a red
          dot on the Flow tab all asked for attention at once. The streak
          lives inside the bell now, at the top of the list, and the bell
          says how many things are waiting instead of only that something
          is.
        */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(true)}
            className="relative w-10 h-10 rounded-full bg-surface-2 hover:bg-surface-3 border border-border flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            title="Notifications"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} new` : 'Notifications'}
          >
            <Bell className="w-[18px] h-[18px] text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold leading-none flex items-center justify-center border-2 border-background">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {showStreakPanel && (
            <StreakDetailsPanel store={store} onClose={() => setShowStreakPanel(false)} />
          )}
        </div>

        {/* Profile Button & Dropdown Menu */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(prev => !prev)}
            aria-label="Account and security"
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
              showProfileMenu
                ? 'bg-primary/10 border-primary text-primary shadow-sm'
                : 'bg-surface-2 hover:bg-surface-3 border-border text-foreground'
            }`}
            title="Account & Security"
          >
            <User className="w-[18px] h-[18px]" />
          </button>

          {showProfileMenu && (
            <><ScrollLock />
              {/* Backdrop to close dropdown when tapping outside */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowProfileMenu(false)}
              />

              {/* Profile Dropdown */}
              <div
                className="absolute right-0 mt-2 w-52 bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right space-y-1"
                onClick={e => e.stopPropagation()}
              >
                {/* User Info Header */}
                <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col text-left min-w-0 flex-1">
                    <span className="text-xs font-bold text-foreground truncate capitalize">
                      {currentUser?.name || (currentUser?.role === 'owner' ? 'Owner' : 'Staff')}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                      {currentUser?.role === 'owner' ? 'Store Owner' : (currentUser?.role || 'Staff')}
                    </span>
                  </div>
                </div>

                {/* Switch Role Action. Not on a worker's own phone: it is one
                    person's, in one shop. */}
                {!store.staffDevice && (
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    setShowSwitchUser(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl hover:bg-surface-2 text-xs font-semibold flex items-center gap-2.5 text-foreground transition-colors cursor-pointer text-left"
                >
                  <UserCheck className="w-4 h-4 text-primary" />
                  <span>Switch Role</span>
                </button>
                )}

                {/* Lock Store Action */}
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    setShowLockConfirm(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl hover:bg-destructive/10 text-xs font-semibold flex items-center gap-2.5 text-destructive transition-colors cursor-pointer text-left"
                >
                  <Lock className="w-4 h-4" />
                  <span>Lock Store</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
