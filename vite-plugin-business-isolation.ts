import type { Plugin } from 'vite';

function patchIndex(source: string): string {
  let s = source;
  const importLine = "import { getBusinessTemplate, isBusinessTabAllowed, isServiceFirstBusiness, resolveBusinessType, shouldRunRetailRestockEngine } from '@/lib/business-runtime';\n";
  const importAnchor = "import { StoreData, TabId, Product } from '@/types/store';\n";
  if (!s.includes(importLine)) s = s.replace(importAnchor, importAnchor + importLine);

  const oldBusinessBlock = `  const isGames = store?.category === 'games';\n  const isLaundry = store?.storeType === 'laundry';\n\n  const unreadCount = store ? (store.flowNotifications || []).filter(n => !n.read).length : 0;\n\n  const mainTabs = isGames\n    ? GAMES_MAIN_TABS\n    : isLaundry\n    ? RETAIL_MAIN_TABS.map(t => (t.id === 'inventory' ? { ...t, label: 'Services', icon: '🧺' } : t))\n    : RETAIL_MAIN_TABS;\n  const moreItems = isGames ? GAMES_MORE_ITEMS : RETAIL_MORE_ITEMS;\n`;
  const newBusinessBlock = `  const businessTemplate = getBusinessTemplate(store);\n  const businessType = resolveBusinessType(store);\n  const isGames = businessType === 'games';\n  const isServiceFirst = isServiceFirstBusiness(store);\n\n  const unreadCount = store ? (store.flowNotifications || []).filter(n => !n.read).length : 0;\n\n  const mainTabs = isGames\n    ? GAMES_MAIN_TABS\n    : RETAIL_MAIN_TABS\n        .filter(t => isBusinessTabAllowed(store, t.id))\n        .flatMap(t => {\n          const mapped = t.id === 'inventory' && isServiceFirst\n            ? { ...t, label: 'Services', icon: businessTemplate.icon }\n            : t;\n          // Laundry needs BOTH surfaces: Orders is the online customer-app inbox,\n          // while Laundry Records is the physical counter/intake workspace.\n          if (businessType === 'laundry' && t.id === 'orders') {\n            return [mapped, { id: 'laundry-records' as TabId, label: 'Laundry Records', icon: '🧾' }];\n          }\n          return [mapped];\n        });\n  const moreItems = (isGames ? GAMES_MORE_ITEMS : RETAIL_MORE_ITEMS)\n    .filter(t => isBusinessTabAllowed(store, t.id));\n`;
  s = s.replace(oldBusinessBlock, newBusinessBlock);

  const orderIconBlock = `    case 'orders':\n      return <ShoppingCart className={className} />;`;
  const laundryIconBlock = `${orderIconBlock}\n    case 'laundry-records':\n      return <Receipt className={className} />;`;
  if (!s.includes("case 'laundry-records':") && s.includes(orderIconBlock)) {
    s = s.replace(orderIconBlock, laundryIconBlock);
  }

  s = s.replace(
    "const allowedSubs = cat.subItems.filter(sub => isTabAllowed(sub.tabId, currentUser));",
    "const allowedSubs = cat.subItems.filter(sub => isTabAllowed(sub.tabId, currentUser) && isBusinessTabAllowed(store, sub.tabId));",
  );

  s = s.replace("{store.storeType === 'laundry' ? (", "{isServiceFirst ? (");
  s = s.replace("{store.category || 'Retail'}", "{businessTemplate.name}");

  const oldRestock = `        const withDraft = checkWeeklyRestockDraft(next);\n        if (withDraft) {\n          next = withDraft;\n        }\n`;
  const newRestock = `        if (shouldRunRetailRestockEngine(next)) {\n          const withDraft = checkWeeklyRestockDraft(next);\n          if (withDraft) {\n            next = withDraft;\n          }\n        }\n`;
  s = s.replace(oldRestock, newRestock);

  return s;
}

function patchOrders(source: string): string {
  let s = source;
  const importLine = "import { getOrderProgressText } from '@/lib/business-runtime';\n";
  const importAnchor = "import { subscribeToOrderPush } from '@/lib/push-notifications';\n";
  if (!s.includes(importLine)) s = s.replace(importAnchor, importAnchor + importLine);

  const start = "  let statusLine = '';\n";
  const end = "  else statusLine = `here's an update on your order from ${store.storeName}.`;";
  const startIndex = s.indexOf(start);
  const endIndex = s.indexOf(end, startIndex);
  if (startIndex >= 0 && endIndex >= 0) {
    const after = endIndex + end.length;
    s = s.slice(0, startIndex) + "  const statusLine = getOrderProgressText(store, status);" + s.slice(after);
  }
  return s;
}

function patchServices(source: string): string {
  let s = source;
  const importAnchor = "import { Plus, Pencil, Trash2, X, Clock, Power, Scale, Tag, Play, Timer, Pause, CalendarClock } from 'lucide-react';";
  const importLine = "import LaundryPricingSetup from '@/components/laundry/LaundryPricingSetup';";
  if (!s.includes(importLine) && s.includes(importAnchor)) {
    s = s.replace(importAnchor, `${importAnchor}\n${importLine}`);
  }

  const functionAnchor = "export default function Services({ store, onUpdate, currentUser }: ServicesProps) {";
  const laundryReturn = `export default function Services({ store, onUpdate, currentUser }: ServicesProps) {\n  if (String((store as any).businessType || store.storeType || '').toLowerCase() === 'laundry') {\n    return <LaundryPricingSetup store={store} onUpdate={onUpdate} currentUser={currentUser} />;\n  }`;
  if (!s.includes('return <LaundryPricingSetup') && s.includes(functionAnchor)) {
    s = s.replace(functionAnchor, laundryReturn);
  }
  return s;
}

export default function businessIsolationPlugin(): Plugin {
  return {
    name: 'storeflow-business-isolation',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replace(/\\/g, '/');
      if (normalized.endsWith('/src/pages/Index.tsx')) return { code: patchIndex(code), map: null };
      if (normalized.endsWith('/src/components/Orders.tsx')) return { code: patchOrders(code), map: null };
      if (normalized.endsWith('/src/components/Services.tsx')) return { code: patchServices(code), map: null };
      return null;
    },
  };
}
