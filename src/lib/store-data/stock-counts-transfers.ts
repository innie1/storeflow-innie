import { stockPrecision, packSize, stockBase, saleUnits } from '@/lib/inventory-sale-math';
import { StoreData } from '@/types/store';
import { recordInventoryMovement } from './inventory-movements';
import { generateId } from './ids';
import { loadStore, saveStore } from './load-save';

// ─── Stock Count Mode Auditing ────────────────────────────────────────────────
export function recordStockCountAudit(store: StoreData, productId: string, productName: string, expected: number, actual: number): StoreData {
  const variance = actual - expected;
  const auditEntry = {
    id: generateId(),
    date: new Date().toISOString(),
    expected,
    actual,
    variance,
    product: productName
  };

  // Adjust the product's actual stock quantity in the inventory to match actual count
  const updatedProducts = store.products.map(p => p.id === productId ? { ...p, quantity: actual } : p);

  if (!Number.isFinite(actual) || actual < 0) throw new Error('Enter a valid stock count.');
  const updated = recordInventoryMovement({ ...store, products: updatedProducts, stockCountAudits: [auditEntry, ...(store.stockCountAudits || [])] }, productId, 'Adjustment', variance, 'Staff', 'Stock count');
  saveStore(updated);
  return updated;
}

// ─── Inventory Multi-Store Transfers ──────────────────────────────────────────
export function transferStock(
  sourceStore: StoreData,
  productId: string,
  quantity: number,
  destStoreCode: string
): StoreData {
  const product = sourceStore.products.find(p => p.id === productId);
  if (!product || !Number.isFinite(quantity) || quantity <= 0 || stockBase(product) + 1e-8 < saleUnits(product, quantity)) throw new Error('Check the transfer quantity.');
  if (destStoreCode.toUpperCase() === sourceStore.accessCode.toUpperCase()) throw new Error('Choose another store.');
  const destStore = loadStore(destStoreCode);
  if (!destStore) throw new Error('Destination store is unavailable. Nothing was transferred.');
  const units = saleUnits(product, quantity);
  if (packSize(product) > 1 && !Number.isInteger(units)) throw new Error('Transfer whole pieces only.');

  const now = new Date().toISOString();

  // Decrease source stock
  let updatedSource: StoreData = {
    ...sourceStore,
    products: sourceStore.products.map(p => p.id === productId ? { ...p, quantity: stockPrecision(stockBase(p) - units) / packSize(p) } : p),
    transfers: [
      {
        id: generateId(),
        productId,
        productName: product.name,
        quantity,
        sourceStoreCode: sourceStore.accessCode,
        destStoreCode,
        date: now
      },
      ...(sourceStore.transfers || [])
    ]
  };

  updatedSource = recordInventoryMovement(
    updatedSource,
    productId,
    'Transfer',
    -quantity,
    'Staff',
    `To Store ${destStoreCode}`
  );

  // Load and update destination store
  if (destStore) {
    let destProducts = [...destStore.products];
    const destProd = destProducts.find(p => (product.barcode ? p.barcode === product.barcode : p.name.toLowerCase() === product.name.toLowerCase() && p.unit === product.unit && packSize(p) === packSize(product)));
    let targetProductId = destProd ? destProd.id : '';

    if (destProd) {
      destProducts = destProducts.map(p => p.id === destProd.id ? { ...p, quantity: stockPrecision(stockBase(p) + units) / packSize(p), costPrice: (p.quantity * p.costPrice + quantity * product.costPrice) / (p.quantity + units / packSize(p)) } : p);
    } else {
      targetProductId = generateId();
      // Add product as new in destination store
      destProducts.push({
        ...product,
        units_sold: 0, total_revenue: 0, total_profit: 0, first_sale_at: undefined, last_sold_at: undefined, backorderedQty: 0, discontinued: false,
        id: targetProductId,
        name: product.name,
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        quantity,
        category: product.category,
        barcode: product.barcode,
        addedAt: now,
        initialQuantity: quantity,
        priceHistory: product.costPrice > 0 ? [{ costPrice: product.costPrice, date: now }] : []
      });
    }

    let updatedDest: StoreData = {
      ...destStore,
      products: destProducts,
      transfers: [
        {
          id: generateId(),
          productId: targetProductId || 'new',
          productName: product.name,
          quantity,
          sourceStoreCode: sourceStore.accessCode,
          destStoreCode,
          date: now
        },
        ...(destStore.transfers || [])
      ]
    };

    updatedDest = recordInventoryMovement(
      updatedDest,
      targetProductId,
      'Transfer',
      units / (destProd ? packSize(destProd) : packSize(product)),
      'Staff',
      `From Store ${sourceStore.accessCode}`
    );
    // Keep a recovery journal until BOTH local stores are durable. A reload
    // completes an interrupted pair; retries must not re-apply the movement.
    const key = 'storeflow_transfer_journal';
    localStorage.setItem(key, JSON.stringify({ source: updatedSource, destination: updatedDest, sourceBase: sourceStore, destinationBase: destStore }));
    saveStore(updatedDest, { skipCloudSync: true });
    saveStore(updatedSource, { skipCloudSync: true });
    localStorage.removeItem(key);
    saveStore(updatedDest, { cloudBase: destStore });

  }

  saveStore(updatedSource, { cloudBase: sourceStore });
  return updatedSource;
}
