import type { Plugin } from 'vite';

function patchIndex(source: string): string {
  let s = source;
  const importLine = "import { getBusinessTemplate, isBusinessTabAllowed, isServiceFirstBusiness, resolveBusinessType, shouldRunRetailRestockEngine } from '@/lib/business-runtime';\n";
  const importAnchor = "import { StoreData, TabId, Product } from '@/types/store';\n";
  if (!s.includes(importLine)) s = s.replace(importAnchor, importAnchor + importLine);

  const oldBusinessBlock = `  const isGames = store?.category === 'games';\n  const isLaundry = store?.storeType === 'laundry';\n\n  const unreadCount = store ? (store.flowNotifications || []).filter(n => !n.read).length : 0;\n\n  const mainTabs = isGames\n    ? GAMES_MAIN_TABS\n    : isLaundry\n    ? RETAIL_MAIN_TABS.map(t => (t.id === 'inventory' ? { ...t, label: 'Services', icon: '🧺' } : t))\n    : RETAIL_MAIN_TABS;\n  const moreItems = isGames ? GAMES_MORE_ITEMS : RETAIL_MORE_ITEMS;\n`;
  const newBusinessBlock = `  const businessTemplate = getBusinessTemplate(store);\n  const businessType = resolveBusinessType(store);\n  const isGames = businessType === 'games';\n  const isServiceFirst = isServiceFirstBusiness(store);\n\n  const unreadCount = store ? (store.flowNotifications || []).filter(n => !n.read).length : 0;\n\n  const mainTabs = isGames\n    ? GAMES_MAIN_TABS\n    : RETAIL_MAIN_TABS\n        .filter(t => isBusinessTabAllowed(store, t.id))\n        .map(t => (t.id === 'inventory' && isServiceFirst ? { ...t, label: 'Services', icon: businessTemplate.icon } : t));\n  const moreItems = (isGames ? GAMES_MORE_ITEMS : RETAIL_MORE_ITEMS)\n    .filter(t => isBusinessTabAllowed(store, t.id));\n`;
  s = s.replace(oldBusinessBlock, newBusinessBlock);

  s = s.replace(
    "const allowedSubs = cat.subItems.filter(sub => isTabAllowed(sub.tabId, currentUser));",
    "const allowedSubs = cat.subItems.filter(sub => isTabAllowed(sub.tabId, currentUser) && isBusinessTabAllowed(store, sub.tabId));",
  );

  s = s.replace("{store.storeType === 'laundry' ? (", "{isServiceFirst ? (");

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

export default function businessIsolationPlugin(): Plugin {
  return {
    name: 'storeflow-business-isolation',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replace(/\\/g, '/');
      if (normalized.endsWith('/src/pages/Index.tsx')) return { code: patchIndex(code), map: null };
      if (normalized.endsWith('/src/components/Orders.tsx')) return { code: patchOrders(code), map: null };
      return null;
    },
  };
}
