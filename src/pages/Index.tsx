import StoreIntegrityPanel from '@/components/StoreIntegrityPanel';
import { Suspense } from 'react';
import SetupChecklist from '@/components/SetupChecklist';
import ReadyForBusiness from '@/components/ReadyForBusiness';
import { hasPractised, markCelebrationShown } from '@/lib/setup-guide';
import { TabId } from '@/types/store';
import FlowShirtFab from '@/components/FlowShirtFab';
import { forgetWorkerPhone, sendWorkerRecords } from '@/lib/staff-session';
import WorkerPassPrompt from '@/components/staff/WorkerPassPrompt';
import InviteSwitchPrompt from '@/components/staff/InviteSwitchPrompt';
import { clearInvite } from '@/lib/staff-join';
import StaffExpenseButton from '@/components/staff/StaffExpenseButton';
import PaydayPrompt from '@/components/staff/PaydayPrompt';
import { saveStore } from '@/lib/store-data';
import StreakRewardReveal from '@/components/streaks/StreakRewardReveal';
import StoreAccess from '@/components/StoreAccess';
import AppLockScreen from '@/components/AppLockScreen';
import StoreSwitcher from '@/components/StoreSwitcher';
import NotificationDrawer from '@/components/NotificationDrawer';
/*
 * The screens are fetched when they are opened, not at startup.
 *
 * Importing them here the ordinary way is what made the app one file of a
 * megabyte that had to be downloaded and run before anything could be shown.
 * They are destructured so the markup below reads exactly as it did.
 */
import { Screens, preloadScreens } from './screens';
import ScreenLoading from '@/components/ScreenLoading';

const {
  Academy, Achievements, CashDrawer, CommunicationCenter, Customers, Dashboard, Diary, Documents, Expenses, GamesAnalytics, GamesDashboard, GamesHistory, GamesSettings, Goals, Inventory, LaundryPricingSetup, LaundryWorkspace, Manager, Marketplace, MyPieceWork, Orders, PendingPayments, QRHub, ROITracker, ReceiptScanner, Sales, SalesHistory, Settings, SimpleModeHome, StaffManagement, Suppliers, Wishlist,
} = Screens;

/*
 * The home screen is what every start shows, so its fetch starts the moment
 * this file runs rather than waiting for the phone to go idle: it is already
 * on its way while React is still starting, and the first screen does not wait
 * on a round trip of its own. Three small pieces - 30kB between them - against
 * the 600kB that no longer arrives before anything can be drawn. Which home
 * screen a shop uses is not known until the shop is loaded, so both are asked
 * for.
 */
preloadScreens(['MyPieceWork', 'Dashboard', 'SimpleModeHome']);
import { ToastContainer, showToast } from '@/components/Toast';
import InstallPrompt from '@/components/InstallPrompt';
import LaundrySyncAgent from '@/components/laundry/LaundrySyncAgent';

// Eager helper imports from settings


// Games tabs
import { ChevronLeft } from 'lucide-react';
import ScrollLock from '@/components/ScrollLock';
import { RENDERABLE_TABS, isTabAllowed } from './index/navigation';
import { useIndexScreen, type IndexScreenReady } from './index/useIndexScreen';
import DesktopSidebar from './index/DesktopSidebar';
import AppHeader from './index/AppHeader';
import LockConfirmDialog from './index/LockConfirmDialog';
import SwitchUserSheet from './index/SwitchUserSheet';
import BottomNav from './index/BottomNav';
import BarcodeScannerSheet from './index/BarcodeScannerSheet';
import NewProductPrompt from './index/NewProductPrompt';
import MoreMenuSheet from './index/MoreMenuSheet';

export default function Index() {
  const s = useIndexScreen();
  const {
    store, setStore, locked, setLocked, settingsSubView, setSettingsSubView, autoOpenRestock,
    setAutoOpenRestock, currentUser, tab, orders, focusOrderId, setFocusOrderId, notificationAct,
    setNotificationAct, focusProduct, setFocusProduct, handleUpdateOrderStatus, setTab,
    filterLowStock, setFilterLowStock, showScanner, setShowScanner, showBarcodeScanner,
    showMoreMenu, setShowStreakPanel, showLockConfirm, showSwitcher, setShowSwitcher,
    newProductPrompt, showSwitchUser, showNotifications, setShowNotifications, showVerifySuccess,
    setShowVerifySuccess, businessType, isGames, isServiceFirst, workspaceKey, heldTab, showReady,
    setShowReady, milestoneShowing, passRanOut, setPassRanOut, handleStoreLoaded, handleNavigate,
    handleLock, inviteAsk, setInviteAsk,
  } = s;

  /*
   * The PIN, before anything else on the screen.
   *
   * Only when one has been set - a shop that has not asked to be locked is not
   * locked - and only over a store that is already open, because there is
   * nothing to guard on the sign-in screen and being asked for a PIN before
   * choosing a shop would make no sense.
   */
  if (store && locked) {
    return <AppLockScreen storeName={store.storeName || ''} onUnlock={() => setLocked(false)} />;
  }

  if (!store) {
    return (
      <>
        <StoreAccess onStoreLoaded={handleStoreLoaded} />
        <ToastContainer />
        <InstallPrompt />
      </>
    );
  }

  const ready: IndexScreenReady = { ...s, store };

  /**
   * The screen a tab shows.
   *
   * One tab, one screen: this switch is the whole of it, and what the
   * mount-count test counts. The same question is answered without rendering
   * anything by screensForTab in pages/screens, which is what the idle
   * prefetch asks; a test keeps the two in step.
   */
  const screenFor = (which: TabId) => {
    switch (which) {
      case 'dashboard':
        return (
          <>
            {/* A per-piece worker's Record my work and earnings, above
                whichever home screen they use. Nobody else sees it. */}
            <MyPieceWork store={store} orders={orders} currentUser={currentUser} onUpdate={setStore} />
            {/* What is left to open the shop, in one place: the owner's job,
                so owners only. Keyed on the shop so each has its own. */}
            {currentUser?.role === 'owner' && (
              <SetupChecklist
                key={store.accessCode}
                store={store}
                onNavigate={next => { if (isTabAllowed(next as TabId, currentUser)) setTab(next as TabId); }}
              />
            )}
            {/* Any worker can say what they spent without seeing the money. */}
            <StaffExpenseButton store={store} currentUser={currentUser} onUpdate={setStore} />
            {store.uiMode === 'simple' ? (
              <SimpleModeHome store={store} setStore={setStore} currentUser={currentUser} onNavigate={handleNavigate} orders={orders} />
            ) : (
              <Dashboard store={store} orders={orders} onNavigate={handleNavigate} currentUser={currentUser} />
            )}
          </>
        );
      case 'orders':
        return <Orders store={store} orders={orders} onUpdateOrderStatus={handleUpdateOrderStatus} onUpdate={setStore} focusOrderId={focusOrderId} onFocusHandled={() => setFocusOrderId(null)} notificationAct={notificationAct} onNotificationActHandled={() => setNotificationAct(null)} />;
      case 'laundry-records':
        return String((store as any).businessType || store.storeType || '').toLowerCase() === 'laundry'
          ? <LaundryWorkspace store={store} orders={orders} onUpdate={setStore} currentUser={currentUser} />
          : null;
      case 'inventory':
        return isServiceFirst ? (
          <LaundryPricingSetup store={store} onUpdate={setStore} currentUser={currentUser} />
        ) : (
          <Inventory
            store={store}
            onUpdate={setStore}
            filterLowStock={filterLowStock}
            onClearFilter={() => setFilterLowStock(false)}
            focusProduct={focusProduct}
            onFocusProductHandled={() => setFocusProduct(null)}
            currentUser={currentUser}
            autoOpenRestock={autoOpenRestock}
            onAutoOpenRestockHandled={() => setAutoOpenRestock(false)}
          />
        );
      case 'sales':
        return <Sales store={store} onUpdate={setStore} managerSettings={store.managerSettings} isActive={tab === 'sales'} currentUser={currentUser} />;
      case 'expenses':
        return <Expenses store={store} onUpdate={setStore} currentUser={currentUser} />;
      case 'manager':
        return <Manager store={store} orders={orders} onUpdate={setStore} onNavigate={handleNavigate} />;
      case 'pending':
        return <PendingPayments store={store} onUpdate={setStore} />;
      case 'history':
        return <SalesHistory store={store} onUpdate={setStore} currentUser={currentUser} />;
      case 'roi':
        return <ROITracker store={store} onUpdate={setStore} />;
      case 'settings':
        return <Settings store={store} onUpdate={setStore} onLock={handleLock} currentUser={currentUser} isActive={tab === 'settings'} onSubViewChange={setSettingsSubView} />;
      case 'marketplace':
        return <Marketplace store={store} onUpdate={setStore} />;
      case 'customers':
        return <Customers store={store} onUpdate={setStore} orders={orders} currentUser={currentUser} />;
      case 'suppliers':
        return <Suppliers store={store} onUpdate={setStore} />;
      case 'goals':
        return <Goals store={store} onUpdate={setStore} />;
      case 'diary':
        return <Diary store={store} onUpdate={setStore} />;
      case 'documents':
        return <Documents store={store} onUpdate={setStore} />;
      case 'academy':
        return <Academy store={store} onUpdate={setStore} />;
      case 'achievements':
        return <Achievements store={store} />;
      case 'wishlist':
        return <Wishlist store={store} onUpdate={setStore} />;
      case 'staff':
        return <StaffManagement store={store} onUpdate={setStore} currentUser={currentUser} orders={orders} />;
      case 'cash-drawer':
        return <CashDrawer store={store} onUpdate={setStore} />;
      case 'communication-center':
        return <CommunicationCenter store={store} onUpdate={setStore} currentUser={currentUser} />;
      case 'qr-hub':
        return <QRHub store={store} onUpdate={setStore} currentUser={currentUser} orders={orders} />;
      case 'games-dashboard':
        return isGames ? <GamesDashboard store={store} onUpdate={setStore} onGoToSettings={() => setTab('games-settings')} /> : null;
      case 'games-history':
        return isGames ? <GamesHistory store={store} onUpdate={setStore} /> : null;
      case 'games-analytics':
        return isGames ? <GamesAnalytics store={store} /> : null;
      case 'games-settings':
        return isGames ? <GamesSettings store={store} onUpdate={setStore} /> : null;
      default:
        // Not a screen. The way back is rendered below, against the same list
        // of renderable tabs as before.
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Left Sidebar for Tablet and Desktop (>=768px) */}
      <DesktopSidebar s={ready} />

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col md:pl-64">
        <AppHeader s={ready} />

        {showLockConfirm && <LockConfirmDialog s={ready} />}

        {/* Switch User Modal */}
        {showSwitchUser && <SwitchUserSheet s={ready} />}

        {/* For laundry this button IS "Record Laundry", so on the intake tab it
            is a shortcut to the screen you are already on — and it sits on top
            of that screen's own record button. */}
        {/* Flow opens on the Manager screen. Somebody who cannot open that
            screen was sent there, bounced straight back by the role check,
            and left with a button that did nothing. */}
        {/* Nor on Home, where it floated over the day's figures while the
            Flow tab, one tap away in the bottom bar, opens the same chat. */}
        {tab !== 'dashboard' && !(businessType === 'laundry' && tab === 'laundry-records') && isTabAllowed('manager', currentUser) && (
          <FlowShirtFab store={store} onUpdate={setStore} onNavigate={handleNavigate} currentUser={currentUser} />
        )}

        {inviteAsk && store && (
          <InviteSwitchPrompt
            invitedRef={inviteAsk}
            currentName={store.storeName || ''}
            kind={store.staffDevice ? 'worker' : 'owner'}
            onJoin={() => {
              // The invite stays waiting; the opening screen picks it up.
              if (store.staffDevice) forgetWorkerPhone();
              setInviteAsk(null);
              handleLock();
            }}
            onStay={() => { clearInvite(); setInviteAsk(null); }}
          />
        )}
        {showReady && !milestoneShowing && !inviteAsk && store && (
          <ReadyForBusiness
            storeName={store.storeName || 'Your store'}
            practised={hasPractised(store.accessCode) && (store.sales || []).length === 0}
            onDone={() => { markCelebrationShown(store.accessCode); setShowReady(false); }}
          />
        )}
        {/* On payday, whether each salary was paid - from the staff settings,
            so a tap records it. The owner's question, on the owner's phone. */}
        {currentUser?.role === 'owner' && !store.staffDevice && !showReady && !milestoneShowing && !inviteAsk && (
          <PaydayPrompt store={store} onUpdate={setStore} />
        )}

        <main className={`flex-1 ${store.uiMode === 'simple' && tab === 'dashboard' ? 'px-3 pt-1 pb-16 md:pt-2 space-y-3' : 'px-4 pt-2 pb-20 md:px-6 md:pt-3 md:pb-6 space-y-4'} w-full max-w-5xl lg:max-w-6xl mx-auto`} style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))', paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom)))' }}>
          <StoreIntegrityPanel store={store} owner={currentUser?.role === 'owner'} />
          {/* Back, on every screen that is not the dashboard.
              It used to sit in the header, wedged against the StoreFlow
              wordmark and the store name, which crowded the one part of the
              screen that should just say where you are. It reads better as the
              first thing in the page body, and it is a shorter reach on a
              phone than the very top of the screen.

              The history model already puts exactly one entry between any tab
              and the dashboard, so hardware back works too — but on a desktop
              or an iPhone there is no hardware back, and nobody should have to
              guess. */}
          {tab !== 'dashboard' && (
            <button
              /*
               * Up one level while there is one, out to the dashboard at the
               * top.
               *
               * This always went straight to the dashboard, which is what made
               * Settings jump home: a merchant three levels into Settings
               * tapped Back and was thrown out of the screen entirely rather
               * than stepping up. Settings pushes a history entry per level,
               * so going back through history is what "up one level" means
               * there - and the hardware back button already did the right
               * thing, which is why the two disagreed.
               */
              onClick={() => { if (settingsSubView) window.history.back(); else setTab('dashboard'); }}
              aria-label={settingsSubView ? 'Back' : 'Back to dashboard'}
              className="mb-1 -ml-1 inline-flex items-center gap-1 h-9 pl-1.5 pr-3 rounded-full text-sm font-display font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-2 active:scale-95 transition"
            >
              <ChevronLeft className="w-5 h-5" /> Back
            </button>
          )}

          <Suspense fallback={<ScreenLoading />}>
            <div key={workspaceKey}>
              {/* The exception, kept in one place: a screen holding unsaved
                  work stays mounted and steps aside rather than unmounting. */}
              {heldTab && (
                <div key={`screen:${heldTab}`} className={tab === heldTab ? 'block' : 'hidden'}>
                  {screenFor(heldTab)}
                </div>
              )}
              {tab !== heldTab && (
                <div key={`screen:${tab}`}>
                  {screenFor(tab)}
                </div>
              )}
            </div>

            {/* Nothing matched. Rather than leave the merchant on an empty
                screen with no way out, say so and offer the way back. */}
            {!RENDERABLE_TABS.has(tab) && (
              <div className="py-20 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-2xl">🧭</div>
                <div>
                  <p className="font-display font-bold text-base">That screen isn't available</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                    Nothing is lost — your store data is safe. Head back and carry on.
                  </p>
                </div>
                <button
                  onClick={() => setTab('dashboard')}
                  className="mt-1 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm"
                >
                  Go to Home
                </button>
              </div>
            )}
          </Suspense>
        </main>

        {/* Bottom Nav */}
        <BottomNav s={ready} />
      </div>

      {showScanner && (
        <Suspense fallback={null}>
          <ReceiptScanner
            store={store}
            onUpdate={setStore}
            onClose={() => setShowScanner(false)}
            currentUser={currentUser}
          />
        </Suspense>
      )}

      {showBarcodeScanner && <BarcodeScannerSheet s={ready} />}

      {newProductPrompt && <NewProductPrompt s={ready} />}

      {showSwitcher && (
        <StoreSwitcher
          currentCode={store.accessCode}
          onSwitch={handleStoreLoaded}
          onClose={() => setShowSwitcher(false)}
        />
      )}

      {/* Mobile More Menu Bottom Sheet */}
      {showMoreMenu && <MoreMenuSheet s={ready} />}

      {store.streak?.pendingReveal && (
        <StreakRewardReveal
          reward={store.streak.pendingReveal}
          onClose={() => {
            setStore(prev => {
              if (!prev?.streak) return prev;
              const updated = { ...prev, streak: { ...prev.streak, pendingReveal: null } };
              saveStore(updated);
              return updated;
            });
          }}
        />
      )}

      {showNotifications && (
        <NotificationDrawer
          store={store}
          currentUser={currentUser}
          onOpenStreak={() => { setShowNotifications(false); setShowStreakPanel(true); }}
          onClose={() => setShowNotifications(false)}
          onUpdate={setStore}
          onNavigate={(targetTab, param) => {
            setTab(targetTab as TabId);
            if (param === 'openRestock') setAutoOpenRestock(true);
            // A restock alert names one product; open that product instead of
            // leaving the merchant on the inventory list wondering which.
            else if (param?.startsWith('product:')) {
              setFocusProduct({ productId: param.slice('product:'.length), intent: 'view' });
            }
            setShowNotifications(false);
          }}
        />
      )}
      {showVerifySuccess && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><ScrollLock />
          <div className="bg-card border border-border/80 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-scale-up select-none">
            <div className="w-16 h-16 bg-success/15 border border-success/30 rounded-2xl flex items-center justify-center text-3xl mx-auto animate-bounce">
              ✓
            </div>
            <div className="space-y-1">
              <h3 className="font-display font-black text-lg text-foreground">Email Verified!</h3>
              <p className="text-xs text-muted-foreground">Thank you, your email has been verified successfully. Your StoreFlow account is now fully active.</p>
            </div>
            <div className="p-3 bg-primary/5 rounded-2xl border border-primary/10 text-[11px] text-muted-foreground text-left leading-relaxed flex gap-2">
              <span className="text-base">✨</span>
              <div>
                <strong className="text-foreground block mb-0.5">Flow's Tip:</strong>
                Start setting up your store details and sync your products to access them from any device instantly.
              </div>
            </div>
            <button
              onClick={() => setShowVerifySuccess(false)}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs hover:opacity-90 active:scale-95 transition cursor-pointer"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
      {String((store as any).businessType || store.storeType || '').toLowerCase() === 'laundry' && <LaundrySyncAgent store={store} />}
      <ToastContainer />
      <InstallPrompt />
      {passRanOut && store.staffDevice && (
        <WorkerPassPrompt
          onRenewed={renewed => {
            handleStoreLoaded(renewed);
            setPassRanOut(false);
            // What waited for the pass goes now; the bundles' own wait ended at sign-in.
            void sendWorkerRecords(renewed).catch(() => {});
          }}
          onSignOut={handleLock}
          onShutOut={() => {
            handleLock();
            showToast('This phone has been signed out of the shop.', 'info');
          }}
        />
      )}
    </div>
  );
}
