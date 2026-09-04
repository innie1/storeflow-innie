import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import serviceOrdersPlugin from '../../vite-plugin-service-orders';
import businessIsolationPlugin from '../../vite-plugin-business-isolation';
import {
  LAUNDRY_INTAKE_OPEN_STORAGE,
  consumeLaundryWorkspaceView,
  getLaundryActionView,
  getLaundryRecordSearchText,
  requestLaundryWorkspace,
} from '@/lib/laundry-workspace';

describe('laundry workspace routing', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('routes the two dashboard actions to different laundry views', () => {
    expect(getLaundryActionView('Record Laundry')).toBe('record');
    expect(getLaundryActionView('Laundry Records')).toBe('records');
    expect(getLaundryActionView('Services')).toBeNull();
  });

  it('opens intake only for Record Laundry and defaults records separately', () => {
    requestLaundryWorkspace('record');
    expect(window.sessionStorage.getItem(LAUNDRY_INTAKE_OPEN_STORAGE)).toBe('1');
    expect(consumeLaundryWorkspaceView()).toBe('record');

    requestLaundryWorkspace('records');
    expect(window.sessionStorage.getItem(LAUNDRY_INTAKE_OPEN_STORAGE)).toBeNull();
    expect(consumeLaundryWorkspaceView()).toBe('records');
  });

  it('makes handwritten tag, customer, service and garments searchable', () => {
    const searchText = getLaundryRecordSearchText({
      order_number: 'K7M2Q9',
      customer_name: 'Ada Obi',
      customer_phone: '08012345678',
      status: 'Accepted',
      notes: JSON.stringify({ service_name: 'Full Service', garment_summary: '2 Shirt, 1 Trouser', tag_code: 'K7M2Q9' }),
      order_items: [],
    });

    expect(searchText).toContain('k7m2q9');
    expect(searchText).toContain('ada obi');
    expect(searchText).toContain('full service');
    expect(searchText).toContain('trouser');
  });

  it('keeps the generic Orders component for online customer-app orders', () => {
    const plugin = serviceOrdersPlugin();
    expect(plugin.enforce).toBe('pre');

    const fixture = `import { subscribeToOrderPush } from '@/lib/push-notifications';\n\nexport default function Orders({ store, orders, onUpdate }: any) {\n  return (\n    <div className="space-y-3.5 pt-1">Online orders inbox</div>\n  );\n}`;
    const transform = plugin.transform as any;
    const result = transform(fixture, '/repo/src/components/Orders.tsx');
    const code = result?.code || fixture;

    expect(code).not.toContain("import LaundryWorkspace from '@/components/laundry/LaundryWorkspace';");
    expect(code).not.toContain('return <LaundryWorkspace');
    expect(code).toContain('Online orders inbox');
  });

  it('mounts Laundry Records as a separate Index surface beside Orders', () => {
    const plugin = serviceOrdersPlugin();
    const fixture = `import Orders from '@/components/Orders';\n\nexport default function Index() {\n  const tab: any = 'orders';\n  const store: any = {};\n  const orders: any[] = [];\n  const setStore = () => {};\n  const handleUpdateOrderStatus = () => {};\n  return (\n    <>\n            <div className={tab === 'orders' ? 'block' : 'hidden'}>\n              <Orders store={store} orders={orders} onUpdateOrderStatus={handleUpdateOrderStatus} onUpdate={setStore} />\n            </div>\n    </>\n  );\n}\n\n  // Auto-heal / maintain background push notification subscription when store is loaded`;
    const transform = plugin.transform as any;
    const result = transform(fixture, '/repo/src/pages/Index.tsx');
    const code = result?.code || fixture;

    expect(code).toContain("import LaundryWorkspace from '@/components/laundry/LaundryWorkspace';");
    expect(code).toContain("tab === 'orders'");
    expect(code).toContain("String(tab) === 'laundry-records'");
    expect(code).toContain('<LaundryWorkspace store={store} orders={orders} onUpdate={setStore} />');
  });

  it('keeps Orders named Orders and adds a second Laundry Records main-menu tab', () => {
    const plugin = businessIsolationPlugin();
    const fixture = `import { StoreData, TabId, Product } from '@/types/store';\nimport { ShoppingCart, Receipt } from 'lucide-react';\nconst RETAIL_MAIN_TABS: { id: TabId; label: string; icon: string }[] = [];\nconst GAMES_MAIN_TABS: any[] = [];\nconst RETAIL_MORE_ITEMS: any[] = [];\nconst GAMES_MORE_ITEMS: any[] = [];\nfunction x(store: any) {\n  const isGames = store?.category === 'games';\n  const isLaundry = store?.storeType === 'laundry';\n\n  const unreadCount = store ? (store.flowNotifications || []).filter(n => !n.read).length : 0;\n\n  const mainTabs = isGames\n    ? GAMES_MAIN_TABS\n    : isLaundry\n    ? RETAIL_MAIN_TABS.map(t => (t.id === 'inventory' ? { ...t, label: 'Services', icon: '🧺' } : t))\n    : RETAIL_MAIN_TABS;\n  const moreItems = isGames ? GAMES_MORE_ITEMS : RETAIL_MORE_ITEMS;\n  return { mainTabs, moreItems, unreadCount };\n}\nfunction renderTabIcon(id: TabId, className='x') { switch(id) {\n    case 'orders':\n      return <ShoppingCart className={className} />;\n    default: return null;\n  } }`;
    const transform = plugin.transform as any;
    const result = transform(fixture, '/repo/src/pages/Index.tsx');
    const code = result?.code || fixture;

    // Labeled "Intake" rather than "Laundry Records" in the nav — the full
    // phrase truncated on the 6-tab bottom bar ("Laundry ..."); the fuller
    // name still appears on the workspace screen itself and its quick-action
    // entry points, where there's room for it.
    expect(code).toContain("label: 'Intake'");
    expect(code).toContain("id: 'laundry-records' as TabId");
    expect(code).not.toContain("if (t.id === 'orders' && businessType === 'laundry') return { ...t, label: 'Laundry Records'");
    expect(code).toContain("case 'laundry-records':");
  });

  it('declares businessTemplate when transforming the real Price List navigation', () => {
    const plugin = businessIsolationPlugin();
    const source = fs.readFileSync('src/pages/Index.tsx', 'utf8');
    const transform = plugin.transform as any;
    const result = transform(source, '/repo/src/pages/Index.tsx');
    const code = result?.code || source;
    const declaration = code.indexOf('const businessTemplate = getBusinessTemplate(store);');
    const usage = code.indexOf('{businessTemplate.name}');

    expect(declaration).toBeGreaterThan(-1);
    expect(usage).toBeGreaterThan(declaration);
    expect(code).toContain("businessType === 'laundry' ? 'Price List' : 'Services'");
  });

  it('routes only laundry Services to the garment-by-service price list', () => {
    const plugin = businessIsolationPlugin();
    const fixture = `import { Plus, Pencil, Trash2, X, Clock, Power, Scale, Tag, Play, Timer, Pause, CalendarClock } from 'lucide-react';\ninterface ServicesProps { store: any; onUpdate: any; currentUser?: any; }\nexport default function Services({ store, onUpdate, currentUser }: ServicesProps) {\n  return <div>Generic service editor</div>;\n}`;
    const transform = plugin.transform as any;
    const result = transform(fixture, '/repo/src/components/Services.tsx');
    const code = result?.code || fixture;

    expect(code).toContain("import LaundryPricingSetup from '@/components/laundry/LaundryPricingSetup';");
    expect(code).toContain("=== 'laundry'");
    expect(code).toContain('<LaundryPricingSetup store={store} onUpdate={onUpdate} currentUser={currentUser} />');
    expect(code).toContain('Generic service editor');
  });
});
