import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from '@/lib/store-data';
import { prepareInventoryOrder } from '@/lib/inventory-orders';
import { inspectStoreRecords } from '@/lib/store-reconciliation';
import { mergeStoreSnapshot } from '@/lib/store-sync-guard';
import type { StoreData } from '@/types/store';
function shop(): StoreData {
  const s = createStore('Atomic shop','retail');
  return { ...s, storeId: undefined, managerSettings: { ...s.managerSettings!, multiDeviceSync: false, autoBackupsEnabled: false }, products: [{ id:'p',name:'Soap',quantity:2,costPrice:600,sellingPrice:1000,category:'Goods' }], sales: [], customers: [], pendingPayments: [], cashBalance:0, bankBalance:0 };
}
function order(overrides = {}) { return { id:'order1',status:'Pending',total:900,customer_name:'Ada',customer_phone:'08012345678',order_items:[{id:'line',product_id:'p',quantity:1,price:1000}], ...overrides }; }
function reserve(s: StoreData, o = order()) { const r = prepareInventoryOrder(s,o,'Accepted'); return { s:r.store, o:{...o,status:'Ready',notes:JSON.stringify(r.notes)} }; }
beforeEach(() => localStorage.clear());
describe('atomic online order proposals', () => {
  it('reserves duplicate product lines together and rejects overselling without side effects', () => {
    const s=shop(); const o=order({order_items:[{product_id:'p',quantity:2,price:1000},{product_id:'p',quantity:1,price:1000}]});
    const before=JSON.stringify(s); expect(()=>prepareInventoryOrder(s,o,'Accepted')).toThrow('Not enough'); expect(JSON.stringify(s)).toBe(before);
  });
  it('rejects missing products and repeated acceptance', () => {
    expect(()=>prepareInventoryOrder(shop(),order({order_items:[{product_id:'missing',quantity:1,price:1}]}),'Accepted')).toThrow('missing');
    expect(()=>prepareInventoryOrder(shop(),order({status:'Accepted'}),'Accepted')).toThrow('status');
  });
  it('does not persist a proposal before the server commits', () => {
    const s=shop(); const before=localStorage.getItem('storeflow_'+s.accessCode);
    const {s:reserved,o}=reserve(s);
    prepareInventoryOrder(reserved,o,'Completed',{confirmedPayment:{paid:900,method:'cash'}});
    expect(localStorage.getItem('storeflow_'+s.accessCode)).toBe(before);
  });
  it('completes once, preserves catalogue price and applies discount and cash correctly', () => {
    const {s,o}=reserve(shop());s.products[0].sellingPrice=1200;
    const r=prepareInventoryOrder(s,o,'Completed',{confirmedPayment:{paid:900,method:'cash'}}).store;
    expect(r.products[0].quantity).toBe(1);expect(r.products[0].sellingPrice).toBe(1200);
    expect(r.sales[0]).toMatchObject({total:900,profit:300,unitPrice:1000,channel:'online_order',transactionId:'order-order1',baseQuantity:1});
    expect(r.cashBalance).toBe(900);expect(r.bankBalance).toBe(0);
    expect(()=>prepareInventoryOrder(r,o,'Completed',{confirmedPayment:{paid:900,method:'cash'}})).toThrow('already');
  });
  it('creates debt and records only the actual transfer deposit', () => {
    const {s,o}=reserve(shop());const r=prepareInventoryOrder(s,o,'Completed',{confirmedPayment:{paid:200,method:'transfer'}}).store;
    expect(r.bankBalance).toBe(200);expect(r.pendingPayments![0]).toMatchObject({total:900,paid:200,balance:700});expect(r.customers![0].outstandingDebt).toBe(700);
  });
  it('requires payment confirmation and rejects overpayment', () => {
    const {s,o}=reserve(shop());expect(()=>prepareInventoryOrder(s,o,'Completed')).toThrow('Confirm');
    expect(()=>prepareInventoryOrder(s,o,'Completed',{confirmedPayment:{paid:1000,method:'cash'}})).toThrow('Confirm');
  });
  it('releases exactly the reserved pieces even after pack size changes', () => {
    const s=shop();s.products[0]={...s.products[0],isCartonSingleEnabled:true,singlesPerCarton:12};
    const {s:reserved,o}=reserve(s); reserved.products[0]={...reserved.products[0],singlesPerCarton:6,quantity:2};
    const r=prepareInventoryOrder(reserved,o,'Cancelled').store;expect(r.products[0].quantity).toBe(4);
  });
  it('leaves service stock untouched on acceptance', () => {
    const s=shop();s.products[0].isService=true;s.products[0].quantity=0;
    expect(prepareInventoryOrder(s,order(),'Accepted').store.products[0].quantity).toBe(0);
  });
  it('reserves and completes individual pieces with historical unit snapshots', () => {
    const s=shop();s.products[0]={...s.products[0],quantity:1,isCartonSingleEnabled:true,singlesPerCarton:12,singleSellingPrice:100};
    const o=order({total:200,order_items:[{product_id:'p',quantity:2,price:100,metadata:{saleType:'single'}}]});
    const {s:reserved,o:ready}=reserve(s,o);const r=prepareInventoryOrder(reserved,ready,'Completed',{confirmedPayment:{paid:200,method:'pos'}}).store;
    expect(r.products[0].quantity*12).toBeCloseTo(10);expect(r.sales[0].baseQuantity).toBe(2);expect(r.bankBalance).toBe(200);
  });
});
describe('historical preview and conflict domain',()=>{
  it('flags fractional pieces, missing debt links and mixed payments without changing data',()=>{
    const s=shop();s.products[0]={...s.products[0],quantity:0.04,isCartonSingleEnabled:true,singlesPerCarton:12};
    s.sales=[{id:'old',productId:'p',productName:'Soap',quantity:1,unitPrice:100,total:100,profit:50,date:'2026-01-01',paymentMethod:'mixed',pendingPaymentId:'missing'}];
    const before=JSON.stringify(s);expect(inspectStoreRecords(s)).toHaveLength(3);expect(JSON.stringify(s)).toBe(before);
  });
  it('rejects a sale dependent on stock another device changed even if the final stock matches',()=>{
    const base={products:[{quantity:1}],sales:[],cashBalance:0};
    expect(()=>mergeStoreSnapshot(base,{products:[{quantity:0}],sales:[{id:'sale'}],cashBalance:100},{...base,products:[{quantity:0}]})).toThrow('Another device');
  });
  it('compares object values regardless of JSON key order',()=>{
    const base={products:[{id:'p',quantity:1}],sales:[]};
    expect(mergeStoreSnapshot(base,{...base,sales:[1]},{products:[{quantity:1,id:'p'}],sales:[]})).toEqual({...base,sales:[1]});
  });
});
