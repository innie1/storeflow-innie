import { beforeEach, describe, expect, it } from 'vitest';
import serviceOrdersPlugin from '../../vite-plugin-service-orders';
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

  it('mounts the laundry workspace before React transforms the legacy Orders source', () => {
    const plugin = serviceOrdersPlugin();
    expect(plugin.enforce).toBe('pre');

    const fixture = `import { subscribeToOrderPush } from '@/lib/push-notifications';\n\nexport default function Orders({ store, orders, onUpdate }: any) {\n  return (\n    <div className="space-y-3.5 pt-1">Legacy orders</div>\n  );\n}`;
    const transform = plugin.transform as any;
    const result = transform(fixture, '/repo/src/components/Orders.tsx');
    const code = result?.code || fixture;

    expect(code).toContain("import LaundryWorkspace from '@/components/laundry/LaundryWorkspace';");
    expect(code).toContain("=== 'laundry'");
    expect(code).toContain('return <LaundryWorkspace store={store} orders={orders} onUpdate={onUpdate} />;');
    expect(code).toContain('Legacy orders');
  });
});
