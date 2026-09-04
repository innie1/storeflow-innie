import type { Plugin } from 'vite';

function patchIndex(source: string): string {
  let s = source;
  const importLine = "import { getBusinessTemplate, isBusinessTabAllowed, isServiceFirstBusiness, resolveBusinessType, shouldRunRetailRestockEngine } from '@/lib/business-runtime';\n";
  const fabImportLine = "import FlowShirtFab from '@/components/FlowShirtFab';\n";
  const importAnchor = "import { StoreData, TabId, Product } from '@/types/store';\n";
  if (!s.includes(importLine)) s = s.replace(importAnchor, importAnchor + importLine);
  if (!s.includes(fabImportLine)) s = s.replace(importAnchor, importAnchor + fabImportLine);

  const oldBusinessBlock = `  const isGames = store?.category === 'games';\n  const isLaundry = store?.storeType === 'laundry';\n\n  const unreadCount = store ? (store.flowNotifications || []).filter(n => !n.read).length : 0;\n\n  const mainTabs = isGames\n    ? GAMES_MAIN_TABS\n    : isLaundry\n    ? RETAIL_MAIN_TABS.map(t => (t.id === 'inventory' ? { ...t, label: 'Services', icon: '🧺' } : t))\n    : RETAIL_MAIN_TABS;\n  const moreItems = isGames ? GAMES_MORE_ITEMS : RETAIL_MORE_ITEMS;\n`;
  const newBusinessBlock = `  const businessTemplate = getBusinessTemplate(store);\n  const businessType = resolveBusinessType(store);\n  const isGames = businessType === 'games';\n  const isServiceFirst = isServiceFirstBusiness(store);\n\n  const unreadCount = store ? (store.flowNotifications || []).filter(n => !n.read).length : 0;\n\n  const mainTabs = isGames\n    ? GAMES_MAIN_TABS\n    : RETAIL_MAIN_TABS\n        .filter(t => isBusinessTabAllowed(store, t.id))\n        .flatMap(t => {\n          const mapped = t.id === 'inventory' && isServiceFirst\n            ? { ...t, label: businessType === 'laundry' ? 'Price List' : 'Services', icon: businessTemplate.icon }\n            : t;\n          // Laundry needs BOTH surfaces: Orders is the online customer-app inbox,\n          // while Laundry Records is the physical counter/intake workspace.\n          if (businessType === 'laundry' && t.id === 'orders') {\n            return [mapped, { id: 'laundry-records' as TabId, label: 'Intake', icon: '🧾' }];\n          }\n          return [mapped];\n        });\n  const moreItems = (isGames ? GAMES_MORE_ITEMS : RETAIL_MORE_ITEMS)\n    .filter(t => isBusinessTabAllowed(store, t.id));\n`;
  if (s.includes(oldBusinessBlock)) {
    s = s.replace(oldBusinessBlock, newBusinessBlock);
  } else if (!s.includes('const businessTemplate = getBusinessTemplate(store);')) {
    // The laundry label/icon has changed over time (Services, Price List, etc.).
    // Replace the whole navigation setup by stable boundaries instead of
    // silently leaving later businessTemplate references undeclared.
    const startAnchor = "  const isGames = store?.category === 'games';";
    const endAnchor = '  const moreItems = isGames ? GAMES_MORE_ITEMS : RETAIL_MORE_ITEMS;\n';
    const start = s.indexOf(startAnchor);
    const endStart = s.indexOf(endAnchor, start);
    const hasBusinessNavigation = start >= 0 || endStart >= 0 || s.includes("{store.category || 'Retail'}");
    if (hasBusinessNavigation && (start < 0 || endStart < 0)) {
      throw new Error('[business-isolation] Index business navigation block missing');
    }
    if (start >= 0 && endStart >= 0) {
      const end = endStart + endAnchor.length;
      s = s.slice(0, start) + newBusinessBlock + s.slice(end);
    }
  }

  if (s.includes('{businessTemplate.name}') && !s.includes('const businessTemplate = getBusinessTemplate(store);')) {
    throw new Error('[business-isolation] businessTemplate declaration missing after Index transform');
  }

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

  const mainAnchor = "        <main className={`flex-1 ${store.uiMode === 'simple' && tab === 'dashboard' ? 'px-3 pt-1 pb-16 md:pt-2 space-y-3' : 'p-4 md:p-6 pb-20 md:pb-6 space-y-6'} w-full max-w-5xl lg:max-w-6xl mx-auto`}";
  if (!s.includes('<FlowShirtFab store={store}') && s.includes(mainAnchor)) {
    s = s.replace(
      mainAnchor,
      `        <FlowShirtFab store={store} onUpdate={setStore} onNavigate={handleNavigate} currentUser={currentUser} />\n\n${mainAnchor}`,
    );
  }

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

export function patchLaundryPricing(source: string): string {
  let s = source;

  s = s.replace(
    "import { Check, Pencil, Plus, Power, Shirt, Trash2, X } from 'lucide-react';",
    "import { Check, ChevronDown, ChevronUp, Pencil, Plus, Power, Shirt, Trash2, X } from 'lucide-react';",
  );

  const stateAnchor = "  const [draft, setDraft] = useState<ServiceDraft>(emptyDraft);";
  if (!s.includes('showGarmentPrices') && s.includes(stateAnchor)) {
    s = s.replace(stateAnchor, `${stateAnchor}\n  const [showGarmentPrices, setShowGarmentPrices] = useState(false);`);
  }

  const addStart = s.indexOf('  const addGarment = () => {');
  // Only replace addGarment itself. Using openNewService as the boundary used
  // to delete every handler inserted between the two functions, which left
  // visible edit/delete buttons calling identifiers removed from production.
  const addEndMatch = addStart >= 0 ? /\r?\n  };\r?\n/.exec(s.slice(addStart)) : null;
  const addEnd = addEndMatch?.index !== undefined
    ? addStart + addEndMatch.index + addEndMatch[0].length
    : -1;
  if (addStart >= 0 && addEnd > addStart) {
    const replacement = `  const addGarment = () => {\n    const clean = customGarment.trim();\n    if (!clean) return showToast('Enter a clothing type', 'error');\n\n    const existing = config.garmentTypes.find(garment => garment.toLowerCase() === clean.toLowerCase());\n    if (existing) {\n      setShowGarmentPrices(true);\n      setCustomGarment('');\n      showToast(\`${'${existing}'} is already in the price list\`, 'info');\n      window.setTimeout(() => {\n        const rowId = 'laundry-garment-' + existing.toLowerCase().replace(/[^a-z0-9]+/g, '-');\n        document.getElementById(rowId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });\n      }, 0);\n      return;\n    }\n\n    let next = addLaundryGarmentType(store, clean);\n    for (const service of allServices) {\n      next = setLaundryGarmentPrice(next, String(service.id), clean, Math.max(0, Number(service.sellingPrice) || 0));\n    }\n    next = seedLaundryGarmentPrices(next);\n    persist(next);\n    setCustomGarment('');\n    setShowGarmentPrices(true);\n    showToast(\`${'${clean}'} added to every laundry treatment\`, 'success');\n    window.setTimeout(() => {\n      const rowId = 'laundry-garment-' + clean.toLowerCase().replace(/[^a-z0-9]+/g, '-');\n      document.getElementById(rowId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });\n    }, 0);\n  };\n`;
    s = s.slice(0, addStart) + replacement + s.slice(addEnd);
  }

  const perPieceStart = `              {selectedPricing === 'per_piece' ? (\n                <div className="divide-y divide-border/70">`;
  const perPieceReplacement = `              {selectedPricing === 'per_piece' ? (\n                <div>\n                  <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3 bg-surface-2/40">\n                    <span className="text-[10px] text-muted-foreground font-bold">{config.garmentTypes.length} clothing types</span>\n                    <button\n                      type="button"\n                      onClick={() => setShowGarmentPrices(current => !current)}\n                      className="h-8 px-3 rounded-lg border border-border bg-card text-xs font-display font-black flex items-center gap-1.5"\n                    >\n                      {showGarmentPrices ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}\n                      {showGarmentPrices ? 'Hide all' : 'Show all'}\n                    </button>\n                  </div>\n                  <div className={showGarmentPrices ? 'divide-y divide-border/70' : 'hidden'}>`;
  s = s.replace(perPieceStart, perPieceReplacement);

  s = s.replace(
    '<div key={garment} className="p-3.5 flex items-center gap-3">',
    "<div id={`laundry-garment-${garment.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} key={garment} className=\"p-3.5 flex items-center gap-3\">",
  );

  const perPieceEnd = `                </div>\n              ) : (\n                <div className="p-4 text-xs text-muted-foreground">\n                  For KG, load or fixed-price services`;
  const perPieceEndReplacement = `                  </div>\n                  {!showGarmentPrices && (\n                    <button type="button" onClick={() => setShowGarmentPrices(true)} className="w-full p-4 text-xs font-display font-bold text-primary hover:bg-primary/5">\n                      Show all {config.garmentTypes.length} clothing prices\n                    </button>\n                  )}\n                </div>\n              ) : (\n                <div className="p-4 text-xs text-muted-foreground">\n                  For KG, load or fixed-price services`;
  s = s.replace(perPieceEnd, perPieceEndReplacement);

  return s;
}

function patchStoreData(source: string): string {
  return source.replace(
    "business_type: store.category || 'retail',",
    "business_type: store.storeType || store.category || 'retail',",
  );
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
      if (normalized.endsWith('/src/components/laundry/LaundryPricingSetup.tsx')) return { code: patchLaundryPricing(code), map: null };
      if (normalized.endsWith('/src/lib/store-data.ts')) return { code: patchStoreData(code), map: null };
      return null;
    },
  };
}
