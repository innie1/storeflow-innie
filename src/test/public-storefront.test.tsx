import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BusinessStorefront from '@/components/business/BusinessStorefront';
import { getPublicStorefront, placeStorefrontOrder } from '@/lib/public-storefront';
import { prepareStoreForMarketplacePublish } from '@/lib/marketplace-publish';
import type { StoreData } from '@/types/store';

const publishedStore: StoreData = {
  id: '11111111-1111-4111-8111-111111111111',
  storeId: 'SF-WASHLIE',
  storeName: 'Washlie',
  accessCode: 'WASH01',
  storeType: 'laundry',
  products: [
    { id: 'real-wash', name: 'Wash & Fold', category: 'Service', costPrice: 0, sellingPrice: 1500, quantity: 999999, isService: true },
  ],
  sales: [],
  createdAt: new Date(0).toISOString(),
};

describe('public storefront access', () => {
  it('publishes only this service store actual active services', () => {
    const contaminated = {
      ...publishedStore,
      products: [
        ...publishedStore.products,
        { id: 'mineral', name: 'Mineral', category: 'Beverages', costPrice: 100, sellingPrice: 200, quantity: 10 },
        { id: 'disabled', name: 'Old Service', category: 'Service', costPrice: 0, sellingPrice: 500, quantity: 1, isService: true, discontinued: true },
      ],
    } as StoreData;

    const result = prepareStoreForMarketplacePublish(contaminated, { onlineOrdersEnabled: true });

    expect(result.marketplaceSettings).toEqual({ onlineOrdersEnabled: true });
    expect((result.businessTemplate as any).offerings.map((item: any) => item.name)).toEqual(['Wash & Fold']);
  });

  it('loads the exact published store through the scoped RPC for guests', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: publishedStore.id, store_id: publishedStore.storeId, access_code: publishedStore.accessCode, data: publishedStore },
      error: null,
    });

    const result = await getPublicStorefront('https://storeflow-customer.vercel.app/s/SF-WASHLIE', { rpc });

    expect(rpc).toHaveBeenCalledWith('get_public_storefront', { p_key: 'https://storeflow-customer.vercel.app/s/SF-WASHLIE' });
    expect(result?.storeName).toBe('Washlie');
    expect(result?.products.map(item => item.name)).toEqual(['Wash & Fold']);
  });

  it('shows only the merchant catalogue and never template offerings', () => {
    render(<BusinessStorefront store={publishedStore} />);

    expect(screen.getByText('Wash & Fold')).toBeInTheDocument();
    expect(screen.queryByText('Wash Only')).not.toBeInTheDocument();
    expect(screen.queryByText('Dry Cleaning')).not.toBeInTheDocument();
  });

  it('submits item identity and quantity while the server owns names and prices', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: 'order-id', order_number: 'SF-1234', status: 'Pending', total: 3000 },
      error: null,
    });

    const result = await placeStorefrontOrder({
      storeKey: publishedStore.id!, customerName: 'Guest User', customerPhone: '08012345678',
      items: [{ offeringId: 'real-wash', quantity: 2, isService: true }],
    }, { rpc });

    expect(rpc).toHaveBeenCalledWith('customer_place_storefront_order', expect.objectContaining({
      p_store_key: publishedStore.id,
      p_items: [{ offering_id: 'real-wash', quantity: 2, is_service: true }],
    }));
    expect(result.order_number).toBe('SF-1234');
  });
});
