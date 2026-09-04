import { beforeEach, describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';
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
    // Orders is the online customer-app inbox. Laundry gets its own surface;
    // it must never take over Orders.
    const source = readSource('src/components/Orders.tsx');
    expect(source).not.toContain("import LaundryWorkspace from '@/components/laundry/LaundryWorkspace';");
    expect(source).not.toContain('return <LaundryWorkspace');
  });

  it('mounts Laundry Records as a separate Index surface beside Orders', () => {
    const source = readSource('src/pages/Index.tsx');
    expect(source).toContain("import LaundryWorkspace from '@/components/laundry/LaundryWorkspace';");
    expect(source).toContain("tab === 'orders'");
    expect(source).toContain("String(tab) === 'laundry-records'");
    expect(source).toContain('<LaundryWorkspace store={store} orders={orders} onUpdate={setStore} />');
  });

  it('keeps Orders named Orders and adds a second Laundry Records main-menu tab', () => {
    const source = readSource('src/pages/Index.tsx');
    // Labeled "Intake" rather than "Laundry Records" in the nav -- the full
    // phrase truncated on the 6-tab bottom bar. The fuller name still appears
    // on the workspace screen itself and its quick-action entry points.
    expect(source).toContain("label: 'Intake'");
    expect(source).toContain("id: 'laundry-records' as TabId");
    expect(source).toContain("case 'laundry-records':");
  });

  it('declares businessTemplate before the Price List navigation uses it', () => {
    const source = readSource('src/pages/Index.tsx');
    const declaration = source.indexOf('const businessTemplate = getBusinessTemplate(store);');
    const usage = source.indexOf('{businessTemplate.name}');

    expect(declaration).toBeGreaterThan(-1);
    expect(usage).toBeGreaterThan(declaration);
    expect(source).toContain("businessType === 'laundry' ? 'Price List' : 'Services'");
  });

  it('routes only laundry Services to the garment-by-service price list', () => {
    const source = readSource('src/components/Services.tsx');
    expect(source).toContain("import LaundryPricingSetup from '@/components/laundry/LaundryPricingSetup';");
    expect(source).toContain("=== 'laundry'");
    expect(source).toContain('<LaundryPricingSetup store={store} onUpdate={onUpdate} currentUser={currentUser} />');
  });
});
