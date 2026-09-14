import { describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { flowMarketplaceSuggestions } from '@/lib/flow-marketplace-intel';
import { readSource } from './helpers/source';

const requests = [
  { id: 'r1', text: 'Peak Milk', date: new Date().toISOString() },
  { id: 'r2', text: 'Peak Milk', date: new Date().toISOString() },
];

const shop = (over: Partial<StoreData>): StoreData => ({
  storeName: 'Shop', accessCode: 'REQ001', products: [], sales: [], expenses: [], customers: [],
  pendingPayments: [], createdAt: new Date(0).toISOString(), customerRequests: requests,
  ...over,
} as unknown as StoreData);

/**
 * Customer Requests is about stock a shop could carry. Reported from a laundry,
 * where it still showed with "Peak Milk" as its example.
 */
describe('Customer Requests belongs to shops with stock', () => {
  it('is not suggested to a laundry', () => {
    const laundry = shop({ storeType: 'laundry', businessType: 'laundry' } as Partial<StoreData>);
    expect(flowMarketplaceSuggestions(laundry)).not.toContain('What are customers asking for?');
  });

  it('is still suggested to a shop that keeps stock', () => {
    const provisions = shop({ storeType: 'provision' } as Partial<StoreData>);
    expect(flowMarketplaceSuggestions(provisions)).toContain('What are customers asking for?');
  });

  it('is hidden from the Flow page and the settings for service shops', () => {
    const manager = readSource('src/components/Manager.tsx');
    expect(manager).toContain('{settings.customerRequests && !isServiceFirstBusiness(store) && (');
    expect(manager).toContain('{settings.customerRequests && !isServiceFirstBusiness(store) && requests.length > 0 && (');
    expect(readSource('src/components/Settings.tsx')).toContain('{!isServiceFirstBusiness(store) && <ToggleRow label="Customer Request Tracking"');
  });
});

/**
 * The contact icon on a phone field. Reported from a phone: tapping it left the
 * icon hanging below the box it belongs in.
 */
describe('the contact icon stays in its box', () => {
  const button = readSource('src/components/ContactPickButton.tsx');

  it('is centred without a transform', () => {
    expect(button).toContain('inset-y-0 my-auto');
    expect(button).not.toContain('-translate-y-1/2');
  });

  it('does not shrink when tapped, which is also a transform', () => {
    expect(button).not.toContain('active:scale-');
  });
});

/** Flow opens over the whole screen, so on a desktop its box ran edge to edge. */
describe("Flow's chat box on a desktop", () => {
  it('sits at half the window, centred', () => {
    expect(readSource('src/components/FlowComposer.tsx')).toContain('className="relative px-3 py-2 md:w-1/2 md:mx-auto"');
  });

  it('keeps its attachment menu lined up with it', () => {
    expect(readSource('src/components/FlowAttachmentMenu.tsx')).toContain('md:left-1/4 md:right-1/4');
  });
});
