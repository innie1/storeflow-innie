import { describe, it, expect } from "vitest";
import { StoreData, Product } from "@/types/store";
import {
  recordStockCountAudit,
  transferStock,
  recordLostSale,
  createStore,
  saveStore
} from "@/lib/store-data";
import {
  healthScore,
  getTopOpportunities,
  getProfitLeaks,
  getSmartDiscounts
} from "@/lib/manager-intel";

// Mock localStorage for Vitest running in Node environment
const localStorageMock = (() => {
  let storeMock: Record<string, string> = {};
  return {
    getItem: (key: string) => storeMock[key] || null,
    setItem: (key: string, value: string) => {
      storeMock[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete storeMock[key];
    },
    clear: () => {
      storeMock = {};
    }
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe("StoreFlow Expanded Features Tests", () => {
  it("should record a lost sale correctly", () => {
    let store = createStore("Test Store Retail", "retail");
    store = recordLostSale(store, "Special Milo Pack", 2);
    expect(store.lostSales).toBeDefined();
    expect(store.lostSales?.length).toBe(1);
    expect(store.lostSales?.[0].productName).toBe("Special Milo Pack");
    expect(store.lostSales?.[0].quantity).toBe(2);
  });

  it("should perform stock count audit and adjust stock", () => {
    let store = createStore("Test Store Retail", "retail");
    
    // Add a test product
    const pId = store.products[0].id;
    const initialQty = store.products[0].quantity;
    
    // Perform audit: expected is initialQty, actual is initialQty - 3
    store = recordStockCountAudit(store, pId, store.products[0].name, initialQty, initialQty - 3);
    
    // Check product quantity adjusted
    const product = store.products.find(p => p.id === pId);
    expect(product?.quantity).toBe(initialQty - 3);
    
    // Check audit log recorded
    expect(store.stockCountAudits).toBeDefined();
    expect(store.stockCountAudits?.length).toBe(1);
    expect(store.stockCountAudits?.[0].variance).toBe(-3);
  });

  it("should calculate health score and break down indicators", () => {
    const store = createStore("Test Store Retail", "retail");
    const score = healthScore(store);
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score.details).toBeDefined();
  });

  it("should generate top opportunities and profit leaks", () => {
    let store = createStore("Test Store Retail", "retail");
    
    // Make a product dead stock by setting addedAt to 10 days ago
    if (store.products.length > 0) {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      store.products[0].addedAt = tenDaysAgo.toISOString();
    }

    const opportunities = getTopOpportunities(store);
    expect(opportunities.length).toBeGreaterThan(0);
    expect(opportunities[0].title).toBeDefined();

    const leaks = getProfitLeaks(store);
    expect(leaks).toBeDefined();
  });
});
