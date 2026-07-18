import { describe, it, expect } from "vitest";
import { StoreData, Product } from "@/types/store";
import {
  recordStockCountAudit,
  transferStock,
  recordLostSale,
  createStore,
  saveStore,
  receiveStock,
  addExpense,
  getDashboardStats
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
    const store = createStore("Test Store Retail", "retail");
    const opportunities = getTopOpportunities(store);
    expect(opportunities.length).toBeGreaterThan(0);
    expect(opportunities[0].title).toBeDefined();

    const leaks = getProfitLeaks(store);
    expect(leaks).toBeDefined();
  });

  describe("StoreFlow Redesigned Financial classification and Health Engine", () => {
    it("should classify restocking as Inventory Investment and NOT Operating Expenses", () => {
      let store = createStore("Test Store Retail", "retail");
      // Add a dummy sale so it's not treated as initial import
      store.sales = [
        { id: "s1", date: new Date().toISOString(), productId: store.products[0].id, productName: store.products[0].name, quantity: 1, costPrice: 100, sellingPrice: 200, total: 200, profit: 100 }
      ];
      
      const initialStats = getDashboardStats(store);

      // Perform a restock
      const pId = store.products[0].id;
      store = receiveStock(store, [{ productId: pId, quantity: 10, costPrice: store.products[0].costPrice }], 'balance');

      const updatedStats = getDashboardStats(store);
      
      // Inventory Investment should increase by the restock cost
      expect(updatedStats.inventoryInvestment).toBeGreaterThan(0);
      
      // Operating expenses (totalExpenses) should remain 0
      expect(updatedStats.operatingExpenses).toBe(0);
      expect(updatedStats.totalExpenses).toBe(0);
    });

    it("should not penalize business health score when restocking inventory", () => {
      let store = createStore("Test Store Retail", "retail");
      
      // Log some sales first to have base activity
      store.sales = [
        { id: "s1", date: new Date().toISOString(), productId: store.products[0].id, productName: store.products[0].name, quantity: 1, costPrice: 100, sellingPrice: 200, total: 200, profit: 100 }
      ];

      const initialHealth = healthScore(store);

      // Perform restocking
      const pId = store.products[0].id;
      store = receiveStock(store, [{ productId: pId, quantity: 20, costPrice: store.products[0].costPrice }], 'balance');

      const updatedHealth = healthScore(store);

      // Expense control score should NOT decline due to restocking
      expect(updatedHealth.expense).toBeGreaterThanOrEqual(initialHealth.expense);
      expect(updatedHealth.overall).toBeGreaterThanOrEqual(initialHealth.overall);
    });

    it("should deduct health score points for physical inventory losses (shrinkage)", () => {
      let store = createStore("Test Store Retail", "retail");
      
      // Log some sales first to have base activity
      store.sales = [
        { id: "s1", date: new Date().toISOString(), productId: store.products[0].id, productName: store.products[0].name, quantity: 1, costPrice: 100, sellingPrice: 200, total: 200, profit: 100 }
      ];
      
      const initialHealth = healthScore(store);

      // Perform audit with negative variance (loss of 50 units)
      const pId = store.products[0].id;
      const initialQty = store.products[0].quantity;
      store = recordStockCountAudit(store, pId, store.products[0].name, initialQty, initialQty - 50);

      const updatedHealth = healthScore(store);

      // Inventory score should drop due to audit losses
      expect(updatedHealth.inventory).toBeLessThan(initialHealth.inventory);
    });
  });
});
