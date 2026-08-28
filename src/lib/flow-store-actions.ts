import { Customer, Product, StoreData } from '@/types/store';
import { deleteProduct, saveStore, updateProduct } from '@/lib/store-data';

export interface ProductMatch {
  product: Product;
  score: number;
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ');
}

export function findFlowProduct(store: StoreData, query: string): ProductMatch | null {
  const needle = normalize(query);
  if (!needle) return null;
  const products = store.products.filter(p => !p.discontinued);

  const exact = products.find(p => normalize(p.name) === needle || (p.voiceAliases || []).some(a => normalize(a) === needle));
  if (exact) return { product: exact, score: 1 };

  const contains = products.find(p => normalize(p.name).includes(needle) || needle.includes(normalize(p.name)) || (p.voiceAliases || []).some(a => normalize(a).includes(needle) || needle.includes(normalize(a))));
  if (contains) return { product: contains, score: 0.93 };

  const words = new Set(needle.split(' ').filter(Boolean));
  let best: ProductMatch | null = null;
  for (const product of products) {
    const nameWords = new Set(normalize(product.name).split(' ').filter(Boolean));
    const aliasWords = (product.voiceAliases || []).flatMap(a => normalize(a).split(' '));
    const all = new Set([...nameWords, ...aliasWords]);
    const overlap = [...words].filter(w => all.has(w)).length;
    const score = words.size ? overlap / words.size : 0;
    if (score >= 0.5 && (!best || score > best.score)) best = { product, score: Math.min(0.89, score) };
  }
  return best;
}

export function changeProductPrice(store: StoreData, match: ProductMatch, price: number): StoreData {
  return updateProduct(store, match.product.id, { sellingPrice: Math.round(price * 100) / 100 }, 'Flow', 'owner');
}

export function changeProductCost(store: StoreData, match: ProductMatch, cost: number): StoreData {
  return updateProduct(store, match.product.id, { costPrice: Math.round(cost * 100) / 100 }, 'Flow', 'owner');
}

export function changeProductStock(store: StoreData, match: ProductMatch, quantity: number): StoreData {
  return updateProduct(store, match.product.id, { quantity: Math.max(0, Math.round(quantity * 100) / 100) }, 'Flow', 'owner');
}

export function archiveProduct(store: StoreData, match: ProductMatch): StoreData {
  return updateProduct(store, match.product.id, { discontinued: true }, 'Flow', 'owner');
}

export function restoreProduct(store: StoreData, match: ProductMatch): StoreData {
  return updateProduct(store, match.product.id, { discontinued: false }, 'Flow', 'owner');
}

export function removeProduct(store: StoreData, match: ProductMatch): StoreData {
  return deleteProduct(store, match.product.id, 'Flow', 'owner');
}

export function findFlowCustomer(store: StoreData, query: string): Customer | null {
  const needle = normalize(query);
  if (!needle) return null;
  const customers = store.customers || [];
  return customers.find(c => normalize(c.name) === needle || normalize(c.phone) === needle)
    || customers.find(c => normalize(c.name).includes(needle) || needle.includes(normalize(c.name)))
    || null;
}

export function addFlowCustomer(store: StoreData, name: string, phone = ''): StoreData {
  const customer: Customer = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    phone: phone.trim(),
    totalPurchases: 0,
    outstandingDebt: 0,
    purchaseHistory: [],
    loyaltyPoints: 0,
    visitsCount: 0,
  };
  const updated = { ...store, customers: [customer, ...(store.customers || [])] };
  saveStore(updated);
  return updated;
}

export function changeCustomerDebt(store: StoreData, customer: Customer, amount: number): StoreData {
  const updated = {
    ...store,
    customers: (store.customers || []).map(c => c.id === customer.id ? { ...c, outstandingDebt: Math.max(0, Math.round((c.outstandingDebt + amount) * 100) / 100) } : c),
  };
  saveStore(updated);
  return updated;
}

export function recordCustomerPayment(store: StoreData, customer: Customer, amount: number): StoreData {
  return changeCustomerDebt(store, customer, -Math.abs(amount));
}
