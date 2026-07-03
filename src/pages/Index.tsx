import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { StoreData, TabId, Product } from '@/types/store';
import { loadStore, findProductByBarcode, addProduct, recordSale, saveStore } from '@/lib/store-data';
import StoreAccess from '@/components/StoreAccess';
import StoreSwitcher from '@/components/StoreSwitcher';
import NotificationDrawer from '@/components/NotificationDrawer';
import Dashboard from '@/components/Dashboard';
import StoreLogo from '@/components/StoreLogo';
import { ToastContainer, showToast } from '@/components/Toast';
import InstallPrompt from '@/components/InstallPrompt';

// Eager helper imports from settings
import { saveSession, clearSession, getActiveSession } from '@/components/Settings';

import Inventory from '@/components/Inventory';
import Sales from '@/components/Sales';
import SalesHistory from '@/components/SalesHistory';
import ReceiptScanner from '@/components/ReceiptScanner';
import BarcodeScanner from '@/components/BarcodeScanner';
import Settings from '@/components/Settings';
import Expenses from '@/components/Expenses';
import ROITracker from '@/components/ROITracker';
import Manager from '@/components/Manager';
import PendingPayments from '@/components/PendingPayments';
import Marketplace from '@/components/Marketplace';
import Customers from '@/components/Customers';
import Suppliers from '@/components/Suppliers';
import Goals from '@/components/Goals';
import Diary from '@/components/Diary';
import Documents from '@/components/Documents';
import Academy from '@/components/Academy';
import Achievements from '@/components/Achievements';
import Wishlist from '@/components/Wishlist';
import StaffManagement from '@/components/StaffManagement';
import CashDrawer from '@/components/CashDrawer';
import CommunicationCenter from '@/components/CommunicationCenter';

// Games tabs
import GamesDashboard from '@/components/games/GamesDashboard';
import GamesSettings from '@/components/games/GamesSettings';
import GamesHistory from '@/components/games/GamesHistory';
import GamesAnalytics from '@/components/games/GamesAnalytics';
import {
  Home,
  Package,
  CircleDollarSign,
  Sparkles,
  MoreHorizontal,
  ShoppingCart,
  Receipt,
  CreditCard,
  History,
  TrendingUp,
  Settings as SettingsIcon,
  Lock,
  ChevronDown,
  Gamepad2,
  Gamepad,
  Users,
  Warehouse,
  Target,
  BookOpen,
  FolderArchive,
  GraduationCap,
  Trophy,
  Star,
  Briefcase,
  Coins,
  MessageSquare,
  Bell
} from 'lucide-react';



const RETAIL_MAIN_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'sales', label: 'Sales', icon: '💰' },
  { id: 'manager', label: 'Flow', icon: '✨' },
];


const RETAIL_MORE_ITEMS: { id: TabId; label: string; icon: string }[] = [
  { id: 'marketplace', label: 'Marketplace', icon: '🛒' },
  { id: 'customers', label: 'Customers', icon: '👥' },
  { id: 'suppliers', label: 'Suppliers', icon: '🏬' },
  { id: 'communication-center', label: 'Communication Center', icon: '💬' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
  { id: 'diary', label: 'Business Diary', icon: '📓' },
  { id: 'documents', label: 'Doc Vault', icon: '📂' },
  { id: 'academy', label: 'Flow Academy', icon: '🎓' },
  { id: 'achievements', label: 'Achievements', icon: '🏆' },
  { id: 'wishlist', label: 'Wishlist', icon: '🌟' },
  { id: 'staff', label: 'Staff Accounts', icon: '💼' },
  { id: 'cash-drawer', label: 'Cash Drawer', icon: '💵' },
  { id: 'expenses', label: 'Expenses', icon: '🧾' },
  { id: 'pending', label: 'Pending Payments', icon: '💳' },
  { id: 'history', label: 'History', icon: '📋' },
  { id: 'roi', label: 'ROI Tracker', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

interface MoreSubItem {
  label: string;
  tabId: TabId;
  icon?: string;
}

interface MoreCategory {
  id: string;
  label: string;
  icon: string;
  subItems: MoreSubItem[];
}

const MORE_CATEGORIES: MoreCategory[] = [
  {
    id: 'marketplace',
    label: 'Marketplace',
    icon: '🛒',
    subItems: []
  },
  {
    id: 'communication',
    label: 'Communication Center',
    icon: '💬',
    subItems: []
  },
  {
    id: 'goals',
    label: 'Goals',
    icon: '🎯',
    subItems: []
  },
  {
    id: 'finance',
    label: 'Finance Center',
    icon: '💰',
    subItems: [
      { label: 'Expenses', tabId: 'expenses', icon: '🧾' },
      { label: 'Pending Payments', tabId: 'pending', icon: '💳' },
      { label: 'Cash Drawer', tabId: 'cash-drawer', icon: '💵' },
      { label: 'ROI Tracker', tabId: 'roi', icon: '📈' },
    ]
  },
  {
    id: 'business_tools',
    label: 'Business Tools',
    icon: '🛠️',
    subItems: [
      { label: 'Business Diary', tabId: 'diary', icon: '📓' },
      { label: 'Document Vault', tabId: 'documents', icon: '📂' },
      { label: 'Flow Academy', tabId: 'academy', icon: '🎓' },
      { label: 'Achievements', tabId: 'achievements', icon: '🏆' },
    ]
  },

  {
    id: 'staff_accounts',
    label: 'Staff Accounts',
    icon: '👥',
    subItems: []
  }
];

const GAMES_MAIN_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'games-dashboard', label: 'Dashboard', icon: '🎮' },
  { id: 'games-history', label: 'History', icon: '📋' },
  { id: 'games-analytics', label: 'Analytics', icon: '📈' },
  { id: 'games-settings', label: 'Games', icon: '🕹️' },
];

const GAMES_MORE_ITEMS: { id: TabId; label: string; icon: string }[] = [
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

const renderTabIcon = (id: TabId, isActive: boolean, className = "w-5 h-5") => {
  switch (id) {
    case 'dashboard':
      return <Home className={className} />;
    case 'inventory':
      return <Package className={className} />;
    case 'sales':
      return isActive ? (
        <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-slate-950 font-bold text-xs shrink-0 select-none">
          $
        </div>
      ) : (
        <CircleDollarSign className={className} />
      );
    case 'manager':
      return <Sparkles className={className} />;
    case 'marketplace':
      return <ShoppingCart className={className} />;
    case 'expenses':
      return <Receipt className={className} />;
    case 'pending':
      return <CreditCard className={className} />;
    case 'history':
      return <History className={className} />;
    case 'roi':
      return <TrendingUp className={className} />;
    case 'settings':
      return <SettingsIcon className={className} />;
    case 'games-dashboard':
      return <Gamepad2 className={className} />;
    case 'games-history':
      return <History className={className} />;
    case 'games-analytics':
      return <TrendingUp className={className} />;
    case 'games-settings':
      return <Gamepad className={className} />;
    case 'customers':
      return <Users className={className} />;
    case 'suppliers':
      return <Warehouse className={className} />;
    case 'goals':
      return <Target className={className} />;
    case 'diary':
      return <BookOpen className={className} />;
    case 'documents':
      return <FolderArchive className={className} />;
    case 'academy':
      return <GraduationCap className={className} />;
    case 'achievements':
      return <Trophy className={className} />;
    case 'wishlist':
      return <Star className={className} />;
    case 'staff':
      return <Briefcase className={className} />;
    case 'cash-drawer':
      return <Coins className={className} />;
    case 'communication-center':
      return <MessageSquare className={className} />;
    default:
      return null;
  }
};

const isTabAllowed = (tabId: TabId, user: any) => {
  if (!user) return false;
  if (user.role === 'owner') return true;
  switch (user.role) {
    case 'manager':
      return tabId !== 'settings' && tabId !== 'activity-log';
    case 'cashier':
      return ['dashboard', 'sales', 'history', 'cash-drawer', 'communication-center'].includes(tabId);
    case 'inventory':
      return ['dashboard', 'inventory', 'suppliers', 'marketplace', 'wishlist', 'communication-center'].includes(tabId);
    case 'accountant':
      return ['dashboard', 'expenses', 'roi', 'pending', 'cash-drawer', 'communication-center'].includes(tabId);
    case 'supervisor':
      return ['dashboard', 'staff', 'cash-drawer', 'communication-center'].includes(tabId);
    case 'custom':
      if (tabId === 'dashboard') return true;
      if (['sales', 'history', 'cash-drawer'].includes(tabId) && user.permissions?.sales) return true;
      if (['inventory', 'suppliers', 'marketplace', 'wishlist'].includes(tabId) && user.permissions?.inventory) return true;
      if (['roi', 'expenses', 'pending'].includes(tabId) && user.permissions?.reports) return true;
      if (tabId === 'settings' && user.permissions?.settings) return true;
      if (tabId === 'communication-center') return true;
      return false;
    default:
      return false;
  }
};

export default function Index() {
  const [store, setStore] = useState<StoreData | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tab, setTabState] = useState<TabId>('dashboard');

  // Synchronize browser back/forward buttons with active tab
  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as TabId;
    if (hash && hash !== 'dashboard') {
      setTabState(hash);
      window.history.replaceState({ tab: hash, index: 1 }, '', '#' + hash);
    } else {
      window.history.replaceState({ tab: 'dashboard', index: 0 }, '', '#dashboard');
    }

    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.tab) {
        setTabState(e.state.tab);
      } else {
        setTabState('dashboard');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setTab = useCallback((targetTab: TabId) => {
    setTabState(targetTab);

    const currentState = window.history.state;
    const currentIndex = currentState?.index || 0;

    if (targetTab === 'dashboard') {
      if (currentIndex > 0) {
        window.history.go(-currentIndex);
      } else {
        window.history.replaceState({ tab: 'dashboard', index: 0 }, '', '#dashboard');
      }
    } else {
      if (currentState?.tab !== targetTab) {
        window.history.pushState({ tab: targetTab, index: currentIndex + 1 }, '', '#' + targetTab);
      }
    }
  }, []);
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [scanCart, setScanCart] = useState<{ product: Product; qty: number }[]>([]);
  const [newProductPrompt, setNewProductPrompt] = useState<{ barcode: string; name: string; costPrice: string; sellingPrice: string; quantity: string } | null>(null);

  // Switch User modal states
  const [showSwitchUser, setShowSwitchUser] = useState(false);
  const [switchTargetUser, setSwitchTargetUser] = useState<any>(null);
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchPinBuffer, setSwitchPinBuffer] = useState('');
  const [showSwitchPassField, setShowSwitchPassField] = useState(false);

  const [showNotifications, setShowNotifications] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  const isGames = store?.category === 'games';

  const unreadCount = store ? (store.flowNotifications || []).filter(n => !n.read).length : 0;

  const mainTabs = isGames ? GAMES_MAIN_TABS : RETAIL_MAIN_TABS;
  const moreItems = isGames ? GAMES_MORE_ITEMS : RETAIL_MORE_ITEMS;

  const allowedMainTabs = useMemo(() => {
    return mainTabs.filter(t => isTabAllowed(t.id, currentUser));
  }, [mainTabs, currentUser]);

  const allowedMoreItems = useMemo(() => {
    return moreItems.filter(t => isTabAllowed(t.id, currentUser));
  }, [moreItems, currentUser]);

  const allowedCategories = useMemo(() => {
    if (isGames) {
      const allowedSubs = GAMES_MORE_ITEMS.filter(sub => isTabAllowed(sub.id, currentUser)).map(sub => ({
        label: sub.label,
        tabId: sub.id,
        icon: '⚙️'
      }));
      return [{
        id: 'settings_section',
        label: 'Settings',
        icon: '⚙️',
        subItems: allowedSubs
      }].filter(cat => cat.subItems.length > 0);
    }
    return MORE_CATEGORIES.map(cat => {
      const allowedSubs = cat.subItems.filter(sub => isTabAllowed(sub.tabId, currentUser));
      return {
        ...cat,
        subItems: allowedSubs
      };
      if (cat.id === 'marketplace') return isTabAllowed('marketplace', currentUser);
      if (cat.id === 'communication') return isTabAllowed('communication-center', currentUser);
      if (cat.id === 'goals') return isTabAllowed('goals', currentUser);
      return cat.subItems.length > 0;
    });
  }, [currentUser, isGames]);

  useEffect(() => {
    const parentCat = MORE_CATEGORIES.find(cat => cat.subItems.some(sub => sub.tabId === tab));
    if (parentCat) {
      setExpandedCategories(prev => ({
        ...prev,
        [parentCat.id]: true
      }));
    }
  }, [tab]);

  // When switching to a games store, ensure the active tab is valid for it
  useEffect(() => {
    if (!store) return;
    const allowedAll = [...allowedMainTabs, ...allowedMoreItems].map(t => t.id);
    if (!allowedAll.includes(tab)) {
      setTab(allowedMainTabs[0]?.id || 'dashboard');
    }
  }, [store?.accessCode, store?.category, currentUser, allowedMainTabs, allowedMoreItems, tab]);

  useEffect(() => {
    const code = getActiveSession();
    if (code) {
      const restored = loadStore(code);
      const activeUser = localStorage.getItem('storeflow_active_user');
      if (restored && activeUser) {
        setStore(restored);
        setCurrentUser(JSON.parse(activeUser));
      } else {
        clearSession();
        localStorage.removeItem('storeflow_active_user');
        setStore(null);
        setCurrentUser(null);
      }
    }
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  const handleStoreLoaded = useCallback((s: StoreData) => {
    const activeUser = localStorage.getItem('storeflow_active_user');
    if (activeUser) {
      setCurrentUser(JSON.parse(activeUser));
    }
    setStore(s);
    saveSession(s.accessCode);
  }, []);

  const handleNavigate = useCallback((targetTab: TabId, lowStock?: boolean) => {
    setTab(targetTab);
    if (lowStock) setFilterLowStock(true);
  }, []);

  const handleLock = () => {
    clearSession();
    localStorage.removeItem('storeflow_active_user');
    setStore(null);
    setCurrentUser(null);
  };

  const handleBarcodeDetected = useCallback((code: string) => {
    if (!store) return;
    const existing = findProductByBarcode(store, code);
    if (existing) {
      // Sell mode: add to scan cart
      if (existing.quantity <= 0) {
        showToast(`${existing.name} is out of stock`, 'error');
        return;
      }
      setScanCart(prev => {
        const idx = prev.findIndex(c => c.product.id === existing.id);
        if (idx >= 0) {
          const used = prev[idx].qty;
          if (used + 1 > existing.quantity) {
            showToast('No more stock available', 'error');
            return prev;
          }
          const next = [...prev];
          next[idx] = { ...next[idx], qty: used + 1 };
          showToast(`${existing.name} × ${next[idx].qty}`);
          return next;
        }
        showToast(`✓ ${existing.name} added to cart`);
        return [...prev, { product: existing, qty: 1 }];
      });
    } else {
      // Save mode
      setShowBarcodeScanner(false);
      setNewProductPrompt({ barcode: code, name: '', costPrice: '', sellingPrice: '', quantity: '1' });
    }
  }, [store]);

  const handleCheckoutScanCart = () => {
    if (!store || scanCart.length === 0) return;
    let updated = store;
    for (const item of scanCart) {
      updated = recordSale(updated, item.product.id, item.qty);
    }
    setStore(updated);
    const total = scanCart.reduce((s, c) => s + c.product.sellingPrice * c.qty, 0);
    showToast(`Sold ${scanCart.length} item${scanCart.length === 1 ? '' : 's'} — ₦${total.toLocaleString()}`);
    setScanCart([]);
    setShowBarcodeScanner(false);
  };

  const handleSaveNewProduct = () => {
    if (!store || !newProductPrompt) return;
    const { barcode, name, costPrice, sellingPrice, quantity } = newProductPrompt;
    if (!name.trim() || !sellingPrice || !quantity) {
      showToast('Fill name, selling price and quantity', 'error');
      return;
    }
    const updated = addProduct(store, {
      name: name.trim(),
      costPrice: Number(costPrice) || 0,
      sellingPrice: Number(sellingPrice),
      quantity: Number(quantity),
      category: 'Scanned',
      barcode,
    });
    setStore(updated);
    showToast(`✓ Saved ${name}`);
    setNewProductPrompt(null);
  };

  if (!store) {
    return (
      <>
        <StoreAccess onStoreLoaded={handleStoreLoaded} />
        <ToastContainer />
        <InstallPrompt />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Left Sidebar for Tablet and Desktop (>=768px) */}
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
              <p className="text-[10px] text-muted-foreground capitalize truncate">{store.category || 'Retail'}</p>
            </div>
          </div>
        </div>

        {/* Sidebar Nav Links */}
        <div className="flex-1 py-4 overflow-y-auto px-3 space-y-1 no-scrollbar">
          <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground px-3 mb-2">Main Menu</p>
          {allowedMainTabs.map(t => (
            <button
              key={t.id}
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
              </span>
              <span>{t.label}</span>
            </button>
          ))}

          <div className="pt-4 mt-4 border-t border-border space-y-2">
            <p className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground px-3 mb-2">More Features</p>
            {allowedCategories.map(cat => {
              const isMarketplace = cat.id === 'marketplace';
              const isCommunication = cat.id === 'communication';
              const isGoals = cat.id === 'goals';
              const isStaff = cat.id === 'staff_accounts';
              const isFlat = isMarketplace || isCommunication || isGoals || isStaff;
              const isExpanded = !!expandedCategories[cat.id];
              
              const targetTab: TabId = isMarketplace ? 'marketplace' : isCommunication ? 'communication-center' : isGoals ? 'goals' : isStaff ? 'staff' : 'dashboard';
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
                      <span className="text-base">{cat.icon}</span>
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
                            <span className="text-xs">{sub.icon}</span>
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
                <span className="text-base">📊</span>
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
                <span className="text-base">⚙️</span>
                <span>Settings</span>
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-border space-y-2">
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

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col md:pl-64">
        <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border px-5 py-3.5 flex items-center justify-between">
          <div className="flex flex-col text-left">
            <h1 className="font-display font-black text-xl text-foreground tracking-tight select-none">StoreFlow</h1>
            <button 
              onClick={() => setShowSwitcher(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors font-semibold mt-0.5"
              title="Switch Store"
            >
              <span className="truncate max-w-[120px]">{store.storeName}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Notification Bell */}
            <button
              onClick={() => setShowNotifications(true)}
              className="relative w-9 h-9 rounded-full bg-surface-2 hover:bg-surface-3 border border-border flex items-center justify-center text-sm transition-all active:scale-95 cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4 text-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setShowSwitchUser(true)}
              className="h-9 px-3.5 rounded-full bg-black/40 border border-border/80 hover:border-yellow-500/40 text-xs text-foreground font-display font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <span className="flex items-center gap-1.5 whitespace-nowrap font-display">
                <span className="text-muted-foreground text-[13px]">👤</span>
                <span className="truncate capitalize">{currentUser?.role === 'owner' ? 'Owner' : (currentUser?.name || 'Staff')}</span>
              </span>
            </button>
            <button
              onClick={() => setShowLockConfirm(true)}
              className="w-9 h-9 rounded-full bg-destructive/10 text-destructive border border-destructive/25 flex items-center justify-center hover:bg-destructive/20 transition-all cursor-pointer active:scale-95"
              title="Lock Store"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </header>

        {showLockConfirm && (
          <div className="fixed inset-0 z-[80] bg-background/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setShowLockConfirm(false)}>
            <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-4" onClick={e => e.stopPropagation()}>
              <div className="text-center space-y-2">
                <div className="text-3xl">🔒</div>
                <h3 className="font-display font-bold text-lg">Lock your store?</h3>
                <p className="text-sm text-muted-foreground">You'll need to re-enter your access code to get back in.</p>
              </div>
              
              <div className="bg-surface-2 border border-border rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="text-left">
                  <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold tracking-wider block mb-0.5">Store Access Code</span>
                  <span className="text-sm font-mono font-bold text-primary tracking-wider">{store.accessCode}</span>
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(store.accessCode);
                    showToast('✓ Access code copied');
                  }}
                  className="p-2.5 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border text-muted-foreground hover:text-primary transition-all duration-200 flex items-center justify-center active:scale-95 cursor-pointer"
                  title="Copy Access Code"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                </button>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setShowLockConfirm(false)} className="flex-1 p-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm cursor-pointer">Cancel</button>
                <button onClick={() => { setShowLockConfirm(false); handleLock(); }} className="flex-1 p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm cursor-pointer">Lock Store</button>
              </div>
            </div>
          </div>
        )}

        {/* Switch User Modal */}
        {showSwitchUser && (
          <div className="fixed inset-0 z-[80] bg-background/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => { setShowSwitchUser(false); setSwitchTargetUser(null); }}>
            <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-4 text-left" onClick={e => e.stopPropagation()}>
              {!switchTargetUser ? (
                <>
                  <div className="text-center space-y-1">
                    <h3 className="font-display font-bold text-lg">Switch Staff User</h3>
                    <p className="text-xs text-muted-foreground">Select the staff member to log in as.</p>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                    {/* Owner Profile */}
                    <button
                      onClick={() => {
                        setSwitchTargetUser({ id: 'owner', name: store.storeName + ' Owner', role: 'owner', isOwner: true });
                        setShowSwitchPassField(true);
                        setSwitchPassword('');
                      }}
                      className="w-full p-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 flex items-center justify-between text-xs cursor-pointer text-left font-semibold text-foreground transition-colors"
                    >
                      <div>
                        <p>{store.storeName} Owner</p>
                        <p className="text-[9px] text-yellow-500 uppercase font-bold mt-0.5">owner</p>
                      </div>
                      <span>Select ›</span>
                    </button>
                    {/* Staff Profiles */}
                    {(store.staffMembers || []).map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSwitchTargetUser({ id: s.id, name: s.name, role: s.role, isOwner: false });
                          setShowSwitchPassField(false);
                          setSwitchPinBuffer('');
                        }}
                        className="w-full p-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 flex items-center justify-between text-xs cursor-pointer text-left font-semibold text-foreground transition-colors"
                      >
                        <div>
                          <p>{s.name}</p>
                          <p className="text-[9px] text-yellow-500 uppercase font-bold mt-0.5">{s.role}</p>
                        </div>
                        <span>Select ›</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowSwitchUser(false)} className="w-full py-2.5 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs text-center cursor-pointer">
                    Cancel
                  </button>
                </>
              ) : showSwitchPassField ? (
                /* Password input form */
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (switchTargetUser.isOwner) {
                       if (switchPassword === store.managerSettings?.ownerPassword) {
                        const ownerUser = {
                          name: 'Owner',
                          role: 'owner',
                          permissions: { sales: true, inventory: true, reports: true, settings: true }
                        };
                        localStorage.setItem('storeflow_active_user', JSON.stringify(ownerUser));
                        setCurrentUser(ownerUser);
                        setShowSwitchUser(false);
                        setSwitchTargetUser(null);
                        showToast('Welcome back Owner!');
                      } else {
                        showToast('Incorrect owner password', 'error');
                      }
                    } else {
                      const staff = (store.staffMembers || []).find(s => s.id === switchTargetUser.id);
                      if (staff && switchPassword === staff.pin) {
                        const sessionUser = {
                          id: staff.id,
                          name: staff.name,
                          role: staff.role,
                          permissions: staff.permissions
                        };
                        localStorage.setItem('storeflow_active_user', JSON.stringify(sessionUser));
                        setCurrentUser(sessionUser);
                        setShowSwitchUser(false);
                        setSwitchTargetUser(null);
                        showToast(`Welcome back ${staff.name}!`);
                      } else {
                        showToast('Incorrect password', 'error');
                      }
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="text-center space-y-1">
                    <h3 className="font-display font-bold text-base">Enter Password</h3>
                    <p className="text-xs text-muted-foreground">Credentials required for: {switchTargetUser.name}</p>
                  </div>
                  <input
                    type="password"
                    value={switchPassword}
                    onChange={e => setSwitchPassword(e.target.value)}
                    placeholder="Enter Password"
                    autoFocus
                    className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary text-center"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setSwitchTargetUser(null)} className="flex-1 py-2 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs text-center cursor-pointer">
                      Back
                    </button>
                    <button type="submit" className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs text-center cursor-pointer">
                      Unlock
                    </button>
                  </div>
                </form>
              ) : (
                /* PIN input view */
                <div className="space-y-4">
                  <div className="text-center space-y-1">
                    <h3 className="font-display font-bold text-base">Enter PIN Code</h3>
                    <p className="text-xs text-muted-foreground">Verification required for: {switchTargetUser.name}</p>
                  </div>

                  <div className="flex justify-center gap-2 py-2">
                    {[0, 1, 2, 3].map(idx => (
                      <div
                        key={idx}
                        className={`w-3.5 h-3.5 rounded-full border border-border transition-all ${
                          switchPinBuffer.length > idx ? 'bg-primary border-primary scale-110 gold-glow' : 'bg-surface-2'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Pin Pad Grid */}
                  <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto pt-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                      <button
                        key={digit}
                        onClick={() => {
                          if (switchPinBuffer.length >= 4) return;
                          const nextPin = switchPinBuffer + digit;
                          setSwitchPinBuffer(nextPin);

                          const staff = (store.staffMembers || []).find(s => s.id === switchTargetUser.id);
                          if (staff && nextPin === staff.pin) {
                            const sessionUser = {
                              id: staff.id,
                              name: staff.name,
                              role: staff.role,
                              permissions: staff.permissions
                            };
                            localStorage.setItem('storeflow_active_user', JSON.stringify(sessionUser));
                            setCurrentUser(sessionUser);
                            setShowSwitchUser(false);
                            setSwitchTargetUser(null);
                            showToast(`Welcome back ${staff.name}!`);
                          } else if (staff && nextPin.length >= 4) {
                            setTimeout(() => {
                              setSwitchPinBuffer('');
                              showToast('Incorrect PIN', 'error');
                            }, 150);
                          }
                        }}
                        className="p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-foreground font-display font-bold text-base active:scale-95 flex items-center justify-center cursor-pointer select-none"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      onClick={() => setSwitchPinBuffer('')}
                      className="p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-destructive text-[10px] font-bold active:scale-95 flex items-center justify-center cursor-pointer select-none"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => {
                        if (switchPinBuffer.length >= 4) return;
                        const nextPin = switchPinBuffer + '0';
                        setSwitchPinBuffer(nextPin);

                        const staff = (store.staffMembers || []).find(s => s.id === switchTargetUser.id);
                        if (staff && nextPin === staff.pin) {
                          const sessionUser = {
                            id: staff.id,
                            name: staff.name,
                            role: staff.role,
                            permissions: staff.permissions
                          };
                          localStorage.setItem('storeflow_active_user', JSON.stringify(sessionUser));
                          setCurrentUser(sessionUser);
                          setShowSwitchUser(false);
                          setSwitchTargetUser(null);
                          showToast(`Welcome back ${staff.name}!`);
                        } else if (staff && nextPin.length >= 4) {
                          setTimeout(() => {
                            setSwitchPinBuffer('');
                            showToast('Incorrect PIN', 'error');
                          }, 150);
                        }
                      }}
                      className="p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-foreground font-display font-bold text-base active:scale-95 flex items-center justify-center cursor-pointer select-none"
                    >
                      0
                    </button>
                    <button
                      onClick={() => setSwitchPinBuffer(p => p.slice(0, -1))}
                      className="p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-foreground text-xs font-bold active:scale-95 flex items-center justify-center cursor-pointer select-none"
                    >
                      ⌫
                    </button>
                  </div>

                  <button onClick={() => setSwitchTargetUser(null)} className="w-full mt-2 py-2 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs text-center cursor-pointer">
                    Back
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 w-full max-w-5xl lg:max-w-6xl mx-auto space-y-6">
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-24 space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-xs text-muted-foreground font-display font-medium">Loading module...</p>
            </div>
          }>
            <div className={tab === 'dashboard' ? 'block' : 'hidden'}>
              <Dashboard store={store} onNavigate={handleNavigate} currentUser={currentUser} />
            </div>
            <div className={tab === 'inventory' ? 'block' : 'hidden'}>
              <Inventory
                store={store}
                onUpdate={setStore}
                filterLowStock={filterLowStock}
                onClearFilter={() => setFilterLowStock(false)}
              />
            </div>
            <div className={tab === 'sales' ? 'block' : 'hidden'}>
              <Sales store={store} onUpdate={setStore} managerSettings={store.managerSettings} isActive={tab === 'sales'} currentUser={currentUser} />
            </div>
            <div className={tab === 'expenses' ? 'block' : 'hidden'}>
              <Expenses store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'manager' ? 'block' : 'hidden'}>
              <Manager store={store} onUpdate={setStore} onNavigate={handleNavigate} />
            </div>
            <div className={tab === 'pending' ? 'block' : 'hidden'}>
              <PendingPayments store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'history' ? 'block' : 'hidden'}>
              <SalesHistory store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'roi' ? 'block' : 'hidden'}>
              <ROITracker store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'settings' ? 'block' : 'hidden'}>
              <Settings store={store} onUpdate={setStore} onLock={handleLock} currentUser={currentUser} />
            </div>
            <div className={tab === 'marketplace' ? 'block' : 'hidden'}>
              <Marketplace store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'customers' ? 'block' : 'hidden'}>
              <Customers store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'suppliers' ? 'block' : 'hidden'}>
              <Suppliers store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'goals' ? 'block' : 'hidden'}>
              <Goals store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'diary' ? 'block' : 'hidden'}>
              <Diary store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'documents' ? 'block' : 'hidden'}>
              <Documents store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'academy' ? 'block' : 'hidden'}>
              <Academy store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'achievements' ? 'block' : 'hidden'}>
              <Achievements store={store} />
            </div>
            <div className={tab === 'wishlist' ? 'block' : 'hidden'}>
              <Wishlist store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'staff' ? 'block' : 'hidden'}>
              <StaffManagement store={store} onUpdate={setStore} currentUser={currentUser} />
            </div>
            <div className={tab === 'cash-drawer' ? 'block' : 'hidden'}>
              <CashDrawer store={store} onUpdate={setStore} />
            </div>
            <div className={tab === 'communication-center' ? 'block' : 'hidden'}>
              <CommunicationCenter store={store} onUpdate={setStore} currentUser={currentUser} />
            </div>
            {isGames && (
              <>
                <div className={tab === 'games-dashboard' ? 'block' : 'hidden'}>
                  <GamesDashboard store={store} onUpdate={setStore} onGoToSettings={() => setTab('games-settings')} />
                </div>
                <div className={tab === 'games-history' ? 'block' : 'hidden'}>
                  <GamesHistory store={store} onUpdate={setStore} />
                </div>
                <div className={tab === 'games-analytics' ? 'block' : 'hidden'}>
                  <GamesAnalytics store={store} />
                </div>
                <div className={tab === 'games-settings' ? 'block' : 'hidden'}>
                  <GamesSettings store={store} onUpdate={setStore} />
                </div>
              </>
            )}
          </Suspense>
        </main>

        {/* Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-background/90 backdrop-blur-md border-t border-border">
          <div className="flex justify-around max-w-3xl mx-auto">
            {allowedMainTabs.map(t => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setFilterLowStock(t.id !== 'inventory' ? false : filterLowStock); setShowMoreMenu(false); }}
                  className={`flex flex-col items-center py-2.5 px-3 text-[10px] transition-all relative cursor-pointer ${
                    isActive ? 'text-yellow-500 scale-105' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="mb-1 relative flex items-center justify-center h-5 w-5">
                    {renderTabIcon(t.id, isActive)}
                    {t.id === 'manager' && unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive animate-pulse" />
                    )}
                  </span>
                  <span className="font-display font-bold leading-tight">{t.label}</span>
                </button>
              );
            })}
            {/* More button */}
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={`flex flex-col items-center py-2.5 px-3 text-[10px] transition-all cursor-pointer ${
                  allowedCategories.some(cat => cat.subItems.some(sub => sub.tabId === tab)) || ['settings', 'history', 'marketplace', 'communication-center', 'goals', 'staff'].includes(tab) ? 'text-yellow-500 scale-105' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="mb-1 flex items-center justify-center h-5 w-5">
                  <MoreHorizontal className="w-5 h-5" />
                </span>
                <span className="font-display font-bold leading-tight">More</span>
              </button>
            </div>
          </div>
        </nav>
      </div>

      {showScanner && (
        <ReceiptScanner
          store={store}
          onUpdate={setStore}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showBarcodeScanner && (
        <>
          <BarcodeScanner
            title={scanCart.length > 0 ? `Scan more · ${scanCart.length} item${scanCart.length === 1 ? '' : 's'} in cart` : 'Scan to Save or Sell'}
            subtitle="Existing barcodes are added to cart · new ones open a save form"
            onClose={() => setShowBarcodeScanner(false)}
            onDetected={handleBarcodeDetected}
          />
          {scanCart.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-[60] bg-card border-t border-success/40 p-3 space-y-2 max-h-[40vh] overflow-y-auto shadow-card">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-sm text-success">
                  🛒 Scan Cart · ₦{scanCart.reduce((s, c) => s + c.product.sellingPrice * c.qty, 0).toLocaleString()}
                </span>
                <button onClick={() => setScanCart([])} className="text-xs text-destructive hover:underline">Clear</button>
              </div>
              <div className="space-y-1">
                {scanCart.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-surface-2">
                    <span className="truncate">{c.product.name} × {c.qty}</span>
                    <span className="text-primary font-semibold">₦{(c.product.sellingPrice * c.qty).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={handleCheckoutScanCart}
                className="w-full p-2.5 rounded-lg bg-success text-white font-display font-bold text-sm hover:opacity-90"
              >
                ✓ Complete Sale
              </button>
            </div>
          )}
        </>
      )}

      {newProductPrompt && (
        <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setNewProductPrompt(null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-3" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="font-display font-bold text-lg">New Product</h3>
              <p className="text-xs text-muted-foreground">Barcode <span className="font-mono text-primary">{newProductPrompt.barcode}</span> not found. Save it to your inventory.</p>
            </div>
            <input
              autoFocus
              placeholder="Product name"
              value={newProductPrompt.name}
              onChange={e => setNewProductPrompt({ ...newProductPrompt, name: e.target.value })}
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Cost price (₦)"
                value={newProductPrompt.costPrice}
                onChange={e => setNewProductPrompt({ ...newProductPrompt, costPrice: e.target.value })}
                className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
              />
              <input
                type="number"
                placeholder="Selling price (₦)"
                value={newProductPrompt.sellingPrice}
                onChange={e => setNewProductPrompt({ ...newProductPrompt, sellingPrice: e.target.value })}
                className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <input
              type="number"
              placeholder="Quantity"
              value={newProductPrompt.quantity}
              onChange={e => setNewProductPrompt({ ...newProductPrompt, quantity: e.target.value })}
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button onClick={() => setNewProductPrompt(null)} className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold">Cancel</button>
              <button onClick={handleSaveNewProduct} className="flex-1 p-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold">Save Product</button>
            </div>
          </div>
        </div>
      )}

      {showSwitcher && (
        <StoreSwitcher
          currentCode={store.accessCode}
          onSwitch={handleStoreLoaded}
          onClose={() => setShowSwitcher(false)}
        />
      )}

      {/* Mobile More Menu Bottom Sheet */}
      {showMoreMenu && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end animate-fade-in" onClick={() => setShowMoreMenu(false)}>
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
                const isMarketplace = cat.id === 'marketplace';
                const isCommunication = cat.id === 'communication';
                const isGoals = cat.id === 'goals';
                const isStaff = cat.id === 'staff_accounts';
                const isFlat = isMarketplace || isCommunication || isGoals || isStaff;
                const isExpanded = !!expandedCategories[cat.id];
                
                const targetTab: TabId = isMarketplace ? 'marketplace' : isCommunication ? 'communication-center' : isGoals ? 'goals' : isStaff ? 'staff' : 'dashboard';
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
                        <span className="text-base">{cat.icon}</span>
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
                              <span className="text-xs">{sub.icon}</span>
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
                    <span className="text-base">📊</span>
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
                    <span className="text-base">⚙️</span>
                    <span>Settings</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showNotifications && (
        <NotificationDrawer
          store={store}
          onClose={() => setShowNotifications(false)}
          onUpdate={setStore}
          onNavigate={(targetTab) => {
            setTab(targetTab as TabId);
            setShowNotifications(false);
          }}
        />
      )}
      <ToastContainer />
      <InstallPrompt />
    </div>
  );
}
