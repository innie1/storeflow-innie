import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { StoreData, TabId } from '@/types/store';
import { shopMemoryKey, shopMemoryTrade } from '@/lib/screen-memory';

/**
 * Every screen the main area can show, and how to fetch one.
 *
 * The app used to be a single file of JavaScript - a megabyte compressed -
 * that a phone had to download, parse and run before the first screen could
 * appear, because every screen was imported at the top of Index and mounted at
 * once. A shopkeeper opening the app to record one bundle paid for the
 * marketplace, the academy, the games screens and the whole of Settings first.
 *
 * Each screen is fetched the moment it is first opened instead. The loaders
 * are kept separately from the components so the same fetch can be started
 * ahead of time, quietly, once the phone is idle - see preloadScreens - which
 * is what keeps the first tap on a screen feeling instant without paying for
 * it at startup.
 *
 * This file must not import a screen normally. One plain import here would put
 * that screen back in the startup bundle, and a test checks for it.
 */

type Loader = () => Promise<{ default: ComponentType<never> }>;

export type ScreenName =
  | 'Academy' | 'Achievements' | 'BarcodeScanner' | 'CashDrawer' | 'CommunicationCenter'
  | 'Customers' | 'Dashboard' | 'Diary' | 'Documents' | 'Expenses'
  | 'GamesAnalytics' | 'GamesDashboard' | 'GamesHistory' | 'GamesSettings'
  | 'Goals' | 'Inventory' | 'LaundryPricingSetup' | 'LaundryWorkspace'
  | 'Manager' | 'Marketplace' | 'MyPieceWork' | 'Orders' | 'PendingPayments'
  | 'QRHub' | 'ROITracker' | 'ReceiptScanner' | 'Sales' | 'SalesHistory'
  | 'Settings' | 'SimpleModeHome' | 'StaffManagement' | 'Suppliers' | 'Wishlist';

export const SCREEN_LOADERS: Record<ScreenName, Loader> = {
  Academy: () => import('@/components/Academy'),
  Achievements: () => import('@/components/Achievements'),
  BarcodeScanner: () => import('@/components/BarcodeScanner'),
  CashDrawer: () => import('@/components/CashDrawer'),
  CommunicationCenter: () => import('@/components/CommunicationCenter'),
  Customers: () => import('@/components/Customers'),
  Dashboard: () => import('@/components/Dashboard'),
  Diary: () => import('@/components/Diary'),
  Documents: () => import('@/components/Documents'),
  Expenses: () => import('@/components/Expenses'),
  GamesAnalytics: () => import('@/components/games/GamesAnalytics'),
  GamesDashboard: () => import('@/components/games/GamesDashboard'),
  GamesHistory: () => import('@/components/games/GamesHistory'),
  GamesSettings: () => import('@/components/games/GamesSettings'),
  Goals: () => import('@/components/Goals'),
  Inventory: () => import('@/components/Inventory'),
  LaundryPricingSetup: () => import('@/components/laundry/LaundryPricingSetup'),
  LaundryWorkspace: () => import('@/components/laundry/LaundryWorkspace'),
  Manager: () => import('@/components/Manager'),
  Marketplace: () => import('@/components/Marketplace'),
  MyPieceWork: () => import('@/components/laundry/MyPieceWork'),
  Orders: () => import('@/components/Orders'),
  PendingPayments: () => import('@/components/PendingPayments'),
  QRHub: () => import('@/components/qr/QRHub'),
  ROITracker: () => import('@/components/ROITracker'),
  ReceiptScanner: () => import('@/components/ReceiptScanner'),
  Sales: () => import('@/components/Sales'),
  SalesHistory: () => import('@/components/SalesHistory'),
  Settings: () => import('@/components/Settings'),
  SimpleModeHome: () => import('@/components/simple/SimpleModeHome'),
  StaffManagement: () => import('@/components/StaffManagement'),
  Suppliers: () => import('@/components/Suppliers'),
  Wishlist: () => import('@/components/Wishlist'),
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const asScreen = (loader: Loader) => lazy(loader as () => Promise<{ default: ComponentType<any> }>);

export const Screens = Object.fromEntries(
  (Object.keys(SCREEN_LOADERS) as ScreenName[]).map(name => [name, asScreen(SCREEN_LOADERS[name])]),
) as Record<ScreenName, LazyExoticComponent<ComponentType<any>>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** What the shop is, as far as which screen a tab shows is concerned. */
export interface ScreenShape {
  /** The big-mic home screen rather than the full dashboard. */
  simpleMode?: boolean;
  /** A laundry or another shop that sells work rather than goods. */
  serviceFirst?: boolean;
  laundry?: boolean;
  games?: boolean;
}

/**
 * The screens one tab puts on the phone - normally one, never more than two.
 *
 * It is a plain function of the tab and the shop rather than something read
 * off the markup, so that what is mounted can be counted in a test and the
 * same answer can be used to decide what is worth fetching ahead of time.
 */
export function screensForTab(tab: TabId, shape: ScreenShape = {}): ScreenName[] {
  switch (tab) {
    case 'dashboard':
      // A per-piece worker's own record of their work sits above whichever
      // home screen the shop uses; it draws nothing for anybody else.
      return ['MyPieceWork', shape.simpleMode ? 'SimpleModeHome' : 'Dashboard'];
    case 'orders': return ['Orders'];
    case 'laundry-records': return shape.laundry ? ['LaundryWorkspace'] : [];
    case 'inventory': return [shape.serviceFirst ? 'LaundryPricingSetup' : 'Inventory'];
    case 'sales': return ['Sales'];
    case 'expenses': return ['Expenses'];
    case 'manager': return ['Manager'];
    case 'pending': return ['PendingPayments'];
    case 'history': return ['SalesHistory'];
    case 'roi': return ['ROITracker'];
    case 'settings': return ['Settings'];
    case 'marketplace': return ['Marketplace'];
    case 'customers': return ['Customers'];
    case 'suppliers': return ['Suppliers'];
    case 'goals': return ['Goals'];
    case 'diary': return ['Diary'];
    case 'documents': return ['Documents'];
    case 'academy': return ['Academy'];
    case 'achievements': return ['Achievements'];
    case 'wishlist': return ['Wishlist'];
    case 'staff': return ['StaffManagement'];
    case 'cash-drawer': return ['CashDrawer'];
    case 'communication-center': return ['CommunicationCenter'];
    case 'qr-hub': return ['QRHub'];
    case 'games-dashboard': return shape.games ? ['GamesDashboard'] : [];
    case 'games-history': return shape.games ? ['GamesHistory'] : [];
    case 'games-analytics': return shape.games ? ['GamesAnalytics'] : [];
    case 'games-settings': return shape.games ? ['GamesSettings'] : [];
    default:
      // A tab with no screen renders the way back, which lives in Index.
      return [];
  }
}

/**
 * Which shop, and which trade, the mounted screen belongs to.
 *
 * React throws away a subtree when its key changes, and that is exactly what
 * should happen when somebody switches shops: the screen they were on belongs
 * to the shop they were in, along with whatever it was holding - a cart, a
 * filter, a half-typed search. Handing any of that to the next shop would be
 * wrong, and quietly so.
 *
 * The trade is part of the key because the same shop can be changed from a
 * provision store into a laundry, and those are not the same screens.
 *
 * This is shopMemoryKey, from lib/screen-memory, rather than a second way of
 * saying the same thing: what a screen is allowed to remember and what React
 * keeps mounted have to be drawn along exactly the same line, or a draft
 * outlives the screen that owns it. A shop React can still key but that has no
 * identity to remember anything under falls back here, since a key has to be
 * some string; nothing is stored for it.
 */
export function workspaceKeyFor(store: Partial<StoreData> | null | undefined): string {
  if (!store) return 'no-shop:none';
  return shopMemoryKey(store) ?? `no-shop:${shopMemoryTrade(store)}`;
}

const started = new Set<ScreenName>();

/**
 * Start fetching screens that have not been asked for yet.
 *
 * Called when the phone has nothing better to do, so the first tap on a screen
 * usually finds it already there. Each screen is only ever started once; the
 * browser's module cache does the rest, and a failure is ignored on purpose -
 * this is a head start, not a requirement, and the real open will report it.
 */
export function preloadScreens(names: ScreenName[]): void {
  for (const name of names) {
    if (started.has(name)) continue;
    const loader = SCREEN_LOADERS[name];
    if (!loader) continue;
    started.add(name);
    try { void loader().catch(() => { started.delete(name); }); } catch { started.delete(name); }
  }
}

/** Tests only: forget what has been fetched, so one case cannot leak into the next. */
export function resetPreloadedScreens(): void {
  started.clear();
}
