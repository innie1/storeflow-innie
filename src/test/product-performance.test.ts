import { describe, it, expect } from 'vitest';
import { StoreData, Product } from '@/types/store';
import { 
  addProduct, 
  updateProduct, 
  deleteProduct, 
  receiveStock, 
  recordSale, 
  deleteSale, 
  transferStock, 
  importProducts,
  syncProductPerformance
} from '@/lib/store-data';

function createMockStore(): StoreData {
  return {
    id: 'store-123',
    accessCode: 'MOCK',
    name: 'Mock Store',
    category: 'Groceries',
    products: [],
    sales: [],
    expenses: [],
    investments: [],
    transfers: [],
    inventoryMovements: [],
    cashBalance: 100000,
    bankBalance: 0,
    walletBalance: 0
  };
}

describe('Product Performance Analytics & Inventory Movements', () => {
  it('should initialize performance metrics and record manual movement on addProduct', () => {
    let store = createMockStore();
    store = addProduct(store, {
      name: 'Product A',
      costPrice: 100,
      sellingPrice: 150,
      quantity: 50,
      category: 'General'
    }, 'Owner', 'manager');

    expect(store.products).toHaveLength(1);
    const p = store.products[0];
    expect(p.name).toBe('Product A');
    expect(p.restock_count).toBe(0);
    expect(p.units_sold).toBe(0);
    expect(p.total_revenue).toBe(0);
    expect(p.total_profit).toBe(0);

    expect(store.inventoryMovements).toHaveLength(1);
    const m = store.inventoryMovements![0];
    expect(m.productId).toBe(p.id);
    expect(m.movementType).toBe('Adjustment');
    expect(m.quantity).toBe(50);
    expect(m.user).toBe('Owner');
    expect(m.source).toBe('Manual');
  });

  it('should record movement and update restock_count on receiveStock', () => {
    let store = createMockStore();
    store = addProduct(store, {
      name: 'Product A',
      costPrice: 100,
      sellingPrice: 150,
      quantity: 10,
      category: 'General'
    }, 'Owner', 'manager');

    const pid = store.products[0].id;
    store = receiveStock(store, [{ productId: pid, quantity: 20, costPrice: 110 }], 'balance', 'Restock Button', 'Manager Bob', 'manager');

    const p = store.products.find(x => x.id === pid)!;
    expect(p.quantity).toBe(30);
    expect(p.restock_count).toBe(1);

    // Movement logs should contain the add movement AND the restock movement
    expect(store.inventoryMovements).toHaveLength(2);
    const restockMovement = store.inventoryMovements!.find(m => m.movementType === 'Restock')!;
    expect(restockMovement.productId).toBe(pid);
    expect(restockMovement.quantity).toBe(20);
    expect(restockMovement.user).toBe('Manager Bob');
    expect(restockMovement.source).toBe('Restock Button');
  });

  it('should update metrics and log movement on recordSale', () => {
    let store = createMockStore();
    store = addProduct(store, {
      name: 'Product A',
      costPrice: 100,
      sellingPrice: 150,
      quantity: 50,
      category: 'General'
    }, 'Owner', 'manager');

    const pid = store.products[0].id;
    
    // Perform a sale
    store = recordSale(store, pid, 5, 'Cashier Jane', 'staff', 'tx-1');

    const p = store.products.find(x => x.id === pid)!;
    expect(p.quantity).toBe(45);
    expect(p.units_sold).toBe(5);
    expect(p.total_revenue).toBe(750); // 150 * 5
    expect(p.total_profit).toBe(250); // (150 - 100) * 5
    expect(p.first_sale_at).toBeDefined();
    expect(p.last_sold_at).toBeDefined();

    // Check movements
    const saleMovement = store.inventoryMovements!.find(m => m.movementType === 'Sale')!;
    expect(saleMovement.productId).toBe(pid);
    expect(saleMovement.quantity).toBe(-5);
    expect(saleMovement.user).toBe('Cashier Jane');
  });

  it('should restore quantity, subtract metrics, and recompute sale dates on deleteSale', async () => {
    let store = createMockStore();
    store = addProduct(store, {
      name: 'Product A',
      costPrice: 100,
      sellingPrice: 150,
      quantity: 50,
      category: 'General'
    });

    const pid = store.products[0].id;
    
    // First sale
    store = recordSale(store, pid, 2, 'Staff', 'staff', 'tx-1');
    const firstSaleTime = store.sales[0].date;

    // Wait a brief moment to ensure different timestamp
    await new Promise(r => setTimeout(r, 10));

    // Second sale
    store = recordSale(store, pid, 3, 'Staff', 'staff', 'tx-2');
    const secondSaleTime = store.sales[0].date;

    let p = store.products.find(x => x.id === pid)!;
    expect(p.quantity).toBe(45);
    expect(p.units_sold).toBe(5);
    expect(p.total_revenue).toBe(750);
    expect(p.first_sale_at).toBe(firstSaleTime);
    expect(p.last_sold_at).toBe(secondSaleTime);

    // Delete the second sale
    store = deleteSale(store, 'tx-2');

    p = store.products.find(x => x.id === pid)!;
    expect(p.quantity).toBe(48); // restored by 3
    expect(p.units_sold).toBe(2);
    expect(p.total_revenue).toBe(300);
    expect(p.total_profit).toBe(100);
    
    // Should re-evaluate first and last sold to match only the remaining first sale
    expect(p.first_sale_at).toBe(firstSaleTime);
    expect(p.last_sold_at).toBe(firstSaleTime);

    // Movement log should have a 'Return' entry
    const returnMovement = store.inventoryMovements!.find(m => m.movementType === 'Return')!;
    expect(returnMovement.productId).toBe(pid);
    expect(returnMovement.quantity).toBe(3);
  });

  it('should track movements on transferStock', () => {
    let storeA = createMockStore();
    storeA.accessCode = 'STOREA';
    storeA = addProduct(storeA, {
      name: 'Product A',
      costPrice: 100,
      sellingPrice: 150,
      quantity: 50,
      category: 'General'
    });
    const pid = storeA.products[0].id;

    // We stub loadStore and saveStore globally for destination store if needed, 
    // but transferStock uses localStorage in loadStore. Since window/localStorage is empty,
    // destStore won't be found but updatedSource will still be returned.
    // Let's test updatedSource.
    storeA = transferStock(storeA, pid, 10, 'STOREB');

    expect(storeA.products[0].quantity).toBe(40);
    const transferOut = storeA.inventoryMovements!.find(m => m.movementType === 'Transfer')!;
    expect(transferOut.quantity).toBe(-10);
    expect(transferOut.source).toBe('To Store STOREB');
  });

  it('should sync product performance correctly from sales history', () => {
    let store = createMockStore();
    // Add product directly to simulate legacy data with missing analytics fields
    const rawProduct: Product = {
      id: 'prod-legacy',
      name: 'Legacy Product',
      costPrice: 10,
      sellingPrice: 15,
      quantity: 100,
      category: 'General',
      addedAt: new Date().toISOString()
    };
    store.products.push(rawProduct);

    // Add sales directly
    store.sales = [
      {
        id: 'sale-1',
        productId: 'prod-legacy',
        productName: 'Legacy Product',
        quantity: 5,
        unitPrice: 15,
        total: 75,
        profit: 25,
        date: new Date('2026-07-01').toISOString()
      },
      {
        id: 'sale-2',
        productId: 'prod-legacy',
        productName: 'Legacy Product',
        quantity: 10,
        unitPrice: 15,
        total: 150,
        profit: 50,
        date: new Date('2026-07-05').toISOString()
      }
    ];

    // Trigger sync
    store = syncProductPerformance(store);

    const p = store.products[0];
    expect(p.units_sold).toBe(15);
    expect(p.total_revenue).toBe(225);
    expect(p.total_profit).toBe(75);
    expect(p.first_sale_at).toBe(store.sales[0].date);
    expect(p.last_sold_at).toBe(store.sales[1].date);
    expect(p.restock_count).toBe(1); // Default to 1 if quantity > 0 and no restocks
  });
});
