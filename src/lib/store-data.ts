/*
 * A shop's data on the phone: loading and saving it, and every change made
 * to it - products, sales, stock, expenses, payments, customers, staff,
 * savings and the rest.
 *
 * Each area lives in its own file in ./store-data; this file gathers them
 * so everything keeps importing from '@/lib/store-data'.
 */

export * from './store-data/keys';
export * from './store-data/money';
export * from './store-data/inventory-movements';
export * from './store-data/ids';
export * from './store-data/default-products';
export * from './store-data/store-index';
export * from './store-data/create-store';
export * from './store-data/load-save';
export * from './store-data/trash';
export * from './store-data/purchase-orders';
export * from './store-data/products';
export * from './store-data/sales';
export * from './store-data/stock';
export * from './store-data/expenses';
export * from './store-data/dashboard-stats';
export * from './store-data/investments';
export * from './store-data/pending-payments';
export * from './store-data/customers';
export * from './store-data/suppliers';
export * from './store-data/goals';
export * from './store-data/diary';
export * from './store-data/staff';
export * from './store-data/wishlist';
export * from './store-data/stock-counts-transfers';
export * from './store-data/vault';
export * from './store-data/roi';
export * from './store-data/scans';
export * from './store-data/recurring-bills';
export * from './store-data/sales-target';
export * from './store-data/auto-price';
export { recordActivityLog } from './activity-log';
