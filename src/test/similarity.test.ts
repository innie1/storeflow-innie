import { describe, it, expect } from 'vitest';
import { extractCoreProduct, getSimilarity } from '../lib/similarity';
import { Product } from '../types/store';

// Helper to construct a mock product
function mockProduct(name: string, fields: Partial<Product> = {}): Product {
  return {
    id: Math.random().toString(36).slice(2, 9),
    name,
    costPrice: 1000,
    sellingPrice: 1200,
    quantity: 10,
    category: 'Groceries',
    ...fields
  };
}

// Simulates the similarity check logic exactly as declared in Inventory.tsx
function simulateCalculateSimilarityScore(p1: Product, p2: Product): number {
  if (p1.barcode && p2.barcode) {
    return p1.barcode === p2.barcode ? 100 : 0;
  }

  const { core: c1, attributes: a1 } = extractCoreProduct(p1.name);
  const { core: c2, attributes: a2 } = extractCoreProduct(p2.name);

  const c1Lower = c1.toLowerCase();
  const c2Lower = c2.toLowerCase();

  const nameSim = getSimilarity(c1Lower, c2Lower);
  const isFamilyMatch = nameSim >= 0.75 || c1Lower.includes(c2Lower) || c2Lower.includes(c1Lower);

  if (!isFamilyMatch) {
    return 0;
  }

  let confidence = 75;
  confidence += Math.round(nameSim * 15);

  if (a1.size && a2.size) {
    if (a1.size === a2.size) confidence += 5;
    else confidence -= 15;
  } else if (a1.size || a2.size) {
    confidence -= 5;
  }

  if (a1.container && a2.container) {
    if (a1.container === a2.container) confidence += 5;
    else confidence -= 10;
  } else if (a1.container || a2.container) {
    confidence -= 5;
  }

  if (a1.package && a2.package) {
    if (a1.package === a2.package) confidence += 5;
    else confidence -= 10;
  } else if (a1.package || a2.package) {
    confidence -= 5;
  }

  if (p1.singlesPerCarton !== undefined && p2.singlesPerCarton !== undefined) {
    if (p1.singlesPerCarton === p2.singlesPerCarton) {
      confidence += 5;
    } else {
      confidence -= 10;
    }
  }

  if (p1.costPrice > 0 && p2.costPrice > 0) {
    const diff = Math.abs(p1.costPrice - p2.costPrice) / Math.max(p1.costPrice, p2.costPrice);
    if (diff <= 0.15) {
      confidence += 5;
    } else {
      confidence -= 10;
    }
  }

  if (p1.sellingPrice > 0 && p2.sellingPrice > 0) {
    const diff = Math.abs(p1.sellingPrice - p2.sellingPrice) / Math.max(p1.sellingPrice, p2.sellingPrice);
    if (diff <= 0.15) {
      confidence += 5;
    } else {
      confidence -= 10;
    }
  }

  return Math.max(0, Math.min(100, confidence));
}

describe('StoreFlow Similar Product Detection V4', () => {
  it('should normalize product names and separate attributes', () => {
    const res1 = extractCoreProduct('Big Coke Pack');
    expect(res1.core).toBe('Coke');
    expect(res1.attributes.size).toBe('Big');
    expect(res1.attributes.package).toBe('Pack');

    const res2 = extractCoreProduct('Bottle Coke');
    expect(res2.core).toBe('Coke');
    expect(res2.attributes.container).toBe('Bottle');

    const res3 = extractCoreProduct('Big Lacasera Pack');
    expect(res3.core).toBe('Lacasera');
    expect(res3.attributes.size).toBe('Big');
    expect(res3.attributes.package).toBe('Pack');
  });

  it('should stop immediately if Core Product brand is different', () => {
    const p1 = mockProduct('Big Coke Pack');
    const p2 = mockProduct('Big Lacasera Pack');
    const score = simulateCalculateSimilarityScore(p1, p2);
    expect(score).toBe(0);

    const scoreMilk = simulateCalculateSimilarityScore(
      mockProduct('Peak Milk'),
      mockProduct('Cowbell')
    );
    expect(scoreMilk).toBe(0);
  });

  it('should flag same brand with different attributes as medium confidence duplicates', () => {
    const p1 = mockProduct('Big Coke Pack');
    const p2 = mockProduct('Bottle Coke');
    const score = simulateCalculateSimilarityScore(p1, p2);
    
    // Core is 'Coke' (same), but package/container attributes differ.
    // Score should be 80-94% (Possible duplicate - add to list, no popup)
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThan(95);
  });

  it('should flag identical brand and attributes as high confidence duplicate', () => {
    const p1 = mockProduct('Big Coke Pack');
    const p2 = mockProduct('Big Coke Pack');
    const score = simulateCalculateSimilarityScore(p1, p2);
    
    // Core is identical, attributes match perfectly
    // Score should be >= 95% (Very likely duplicate - show popup)
    expect(score).toBeGreaterThanOrEqual(95);
  });
});
