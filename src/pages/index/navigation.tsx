import { canOpenTab } from '@/lib/permissions';
import { TabId } from '@/types/store';
import {
  Home,
  Package,
  CircleDollarSign,
  Sparkles,
  ShoppingCart,
  Receipt,
  CreditCard,
  History,
  TrendingUp,
  Settings as SettingsIcon,
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
  QrCode,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export const RETAIL_MAIN_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Home', icon: '🏠' },
  { id: 'orders', label: 'Orders', icon: '🛍️' },
  { id: 'inventory', label: 'Stock', icon: '📦' },
  { id: 'sales', label: 'Sell', icon: '💰' },
  { id: 'manager', label: 'Flow', icon: '✨' },
];

export const RETAIL_MORE_ITEMS: { id: TabId; label: string; icon: string }[] = [
  { id: 'marketplace', label: 'Marketplace', icon: '🛒' },
  { id: 'customers', label: 'Customers', icon: '👥' },
  { id: 'suppliers', label: 'Suppliers', icon: '🏬' },
  { id: 'communication-center', label: 'Communication Center', icon: '💬' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
  { id: 'diary', label: 'Business Diary', icon: '📓' },
  { id: 'documents', label: 'Doc Vault', icon: '📂' },
  { id: 'academy', label: 'Flow Academy', icon: '🎓' },
  { id: 'achievements', label: 'Achievements', icon: '🏆' },
  { id: 'qr-hub', label: 'QR Codes', icon: '📱' },
  { id: 'wishlist', label: 'Wishlist', icon: '🌟' },
  { id: 'staff', label: 'Staff Accounts', icon: '💼' },
  { id: 'cash-drawer', label: 'Cash Drawer', icon: '💵' },
  { id: 'expenses', label: 'Expenses', icon: '🧾' },
  { id: 'pending', label: 'Pending Payments', icon: '💳' },
  { id: 'history', label: 'History', icon: '📋' },
  { id: 'roi', label: 'ROI Tracker', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export interface MoreSubItem {
  label: string;
  tabId: TabId;
  icon?: string;
}

export interface MoreCategory {
  id: string;
  label: string;
  /** Matches the lucide icons the bottom nav uses; emoji here looked unfinished beside them. */
  Icon: LucideIcon;
  subItems: MoreSubItem[];
}

export const MORE_CATEGORIES: MoreCategory[] = [
  {
    id: 'marketplace',
    label: 'Marketplace',
    Icon: ShoppingCart,
    subItems: []
  },
  {
    id: 'communication',
    label: 'Communication Center',
    Icon: MessageSquare,
    subItems: []
  },
  {
    id: 'goals',
    label: 'Goals',
    Icon: Target,
    subItems: []
  },
  {
    id: 'finance',
    label: 'Finance Center',
    Icon: Wallet,
    subItems: [
      { label: 'Expenses', tabId: 'expenses' },
      { label: 'Pending Payments', tabId: 'pending' },
      { label: 'Cash Drawer', tabId: 'cash-drawer' },
      { label: 'ROI Tracker', tabId: 'roi' },
    ]
  },
  {
    id: 'business_tools',
    label: 'Business Tools',
    Icon: Wrench,
    subItems: [
      { label: 'Business Diary', tabId: 'diary' },
      { label: 'Document Vault', tabId: 'documents' },
      { label: 'Flow Academy', tabId: 'academy' },
      { label: 'Achievements', tabId: 'achievements' },
      { label: 'QR Codes', tabId: 'qr-hub' },
    ]
  },

  {
    id: 'staff_accounts',
    label: 'Staff Accounts',
    Icon: Users,
    subItems: []
  }
];

/**
 * Categories that open a tab directly instead of expanding a sub-list. Both
 * the permission filter and the menu itself read this, so they cannot drift
 * apart and show an entry that leads nowhere.
 */
export const FLAT_CATEGORY_TABS: Record<string, TabId | undefined> = {
  marketplace: 'marketplace',
  communication: 'communication-center',
  goals: 'goals',
  staff_accounts: 'staff',
};

export const GAMES_MAIN_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'games-dashboard', label: 'Home', icon: '🎮' },
  { id: 'games-history', label: 'History', icon: '📋' },
  { id: 'games-analytics', label: 'Analytics', icon: '📈' },
  { id: 'games-settings', label: 'Games', icon: '🕹️' },
];

export const GAMES_MORE_ITEMS: { id: TabId; label: string; icon: string }[] = [
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export const renderTabIcon = (id: TabId, isActive: boolean, className = "w-5 h-5") => {
  switch (id) {
    case 'dashboard':
      return <Home className={className} />;
    case 'orders':
      return <ShoppingCart className={className} />;
    case 'laundry-records':
      return <Receipt className={className} />;
    case 'inventory':
      return <Package className={className} />;
    case 'sales':
      return isActive ? (
        <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0 select-none">
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
    case 'qr-hub':
      return <QrCode className={className} />;
    case 'cash-drawer':
      return <Coins className={className} />;
    case 'communication-center':
      return <MessageSquare className={className} />;
    default:
      return null;
  }
};

/**
 * Tabs the main area actually renders.
 *
 * The screen being looked at is the only one mounted, chosen by the switch in
 * screenFor, and a tab id with no case there does not fail — it simply renders
 * nothing and the page goes completely blank. No error, nothing for the error
 * boundary to catch, and on a phone no obvious way back. This list is what the
 * fallback below checks against, and a test keeps it in step with that switch.
 */
export const RENDERABLE_TABS = new Set<string>([
  'academy',
  'achievements',
  'cash-drawer',
  'communication-center',
  'customers',
  'dashboard',
  'diary',
  'documents',
  'expenses',
  'games-analytics',
  'games-dashboard',
  'games-history',
  'games-settings',
  'goals',
  'history',
  'inventory',
  'laundry-records',
  'manager',
  'marketplace',
  'orders',
  'pending',
  'qr-hub',
  'roi',
  'sales',
  'settings',
  'staff',
  'suppliers',
  'wishlist',
]);

/**
 * The signed-in session, with the retired 'admin' role moved across.
 *
 * loadStore migrates the staff list, but whoever is signed in right now holds
 * their role in their own session too. Without this, dropping the role would
 * lock out the very person already using it - the opposite of the point.
 */
/*
 * Reading the signed-in person, and the retired 'admin' migration with it,
 * moved to store-session so the store switcher asks the same question this
 * screen does - who is this person in the shop being opened.
 */

// The rule itself lives in permissions.ts so that screens can ask it too, not
// only the navigation in this file.
export const isTabAllowed = (tabId: TabId, user: any) => canOpenTab(tabId, user);
