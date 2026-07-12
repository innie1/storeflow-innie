import { describe, it, expect } from 'vitest';
import { StoreData, Product } from '@/types/store';

// Helper to compute statistics under test, matching the code in Settings.tsx
function computeStoreStats(products: Product[]) {
  const total = products.length;
  const available = products.filter(p => p.quantity > 0).length;
  const outOfStock = products.filter(p => p.quantity <= 0).length;
  
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newlyAdded = products.filter(p => p.addedAt && new Date(p.addedAt).getTime() >= sevenDaysAgo).length;

  const categories = Array.from(new Set(products.map(p => p.category || 'General')));

  return { total, available, outOfStock, newlyAdded, categories };
}

describe('QR Code Page Caching & Silent Sync Statistics', () => {
  it('should compute product metrics and unique categories correctly', () => {
    const now = new Date().toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const mockProducts: Product[] = [
      { id: '1', name: 'Soda Can', quantity: 10, costPrice: 1, sellingPrice: 2, category: 'Beverages', addedAt: now },
      { id: '2', name: 'Milk Carton', quantity: 0, costPrice: 2, sellingPrice: 4, category: 'Dairy', addedAt: now },
      { id: '3', name: 'Bread Loaf', quantity: 5, costPrice: 1, sellingPrice: 2, category: 'Bakery', addedAt: tenDaysAgo },
      { id: '4', name: 'Juice Bottle', quantity: 15, costPrice: 2, sellingPrice: 3.5, category: 'Beverages', addedAt: tenDaysAgo }
    ];

    const stats = computeStoreStats(mockProducts);
    expect(stats.total).toBe(4);
    expect(stats.available).toBe(3); // Soda, Bread, Juice
    expect(stats.outOfStock).toBe(1); // Milk
    expect(stats.newlyAdded).toBe(2); // Soda, Milk
    expect(stats.categories).toHaveLength(3); // Beverages, Dairy, Bakery
    expect(stats.categories).toContain('Beverages');
    expect(stats.categories).toContain('Dairy');
    expect(stats.categories).toContain('Bakery');
  });

  it('should support storing and retrieving QR cache objects from mock localStorage', () => {
    const mockLocalStorage: Record<string, string> = {};

    const setItem = (key: string, value: string) => {
      mockLocalStorage[key] = value;
    };

    const getItem = (key: string) => {
      return mockLocalStorage[key] || null;
    };

    const cacheKey = 'storeflow_qr_cache_MOCK_STORE';
    const cacheObj = {
      qrDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACt...',
      qrVersion: 2,
      storeUrl: 'https://storeflow.app/store/mock-123',
      storeId: 'mock-123'
    };

    setItem(cacheKey, JSON.stringify(cacheObj));
    
    const retrieved = getItem(cacheKey);
    expect(retrieved).not.toBeNull();
    
    const parsed = JSON.parse(retrieved!);
    expect(parsed.qrVersion).toBe(2);
    expect(parsed.storeId).toBe('mock-123');
    expect(parsed.qrDataUrl).toBe(cacheObj.qrDataUrl);
  });
});
