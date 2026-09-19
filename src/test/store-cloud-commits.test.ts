import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ remote: {} as any, handler: null as any, calls: 0 }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id:'owner' } } }, error:null }) },
  from: () => { const query: any = { select: () => query, eq: () => query, single: async () => ({data:{id:'store',data:mock.remote},error:null}), maybeSingle: async () => ({data:{id:'store'},error:null}) }; return query; },
  rpc: async (_name: string, args: any) => { mock.calls++; return mock.handler(args); },
} }));
import { createStore } from '@/lib/store-data';
import { commitCashCheckout } from '@/lib/committed-checkout';
import { cloudSnapshot, getPendingStoreSync, retryStoreSync } from '@/lib/store-cloud-sync';
import { mergeStoreSnapshot } from '@/lib/store-sync-guard';
import type { StoreData } from '@/types/store';
function shop(): StoreData {
 const s=createStore('Cloud test','retail');
 const store={...s,storeId:'cloud-id',products:[{id:'p',name:'Soap',quantity:1,costPrice:60,sellingPrice:100,category:'Goods'}],sales:[],cashBalance:0,bankBalance:0,managerSettings:{...s.managerSettings!,multiDeviceSync:true,autoBackupsEnabled:false}};
 localStorage.setItem('storeflow_'+store.accessCode,JSON.stringify(store));mock.remote=cloudSnapshot(store);return store;
}
beforeEach(()=>{localStorage.clear();mock.calls=0;vi.spyOn(navigator,'onLine','get').mockReturnValue(true);mock.handler=async (args:any)=>{try {mock.remote=mergeStoreSnapshot(args.p_base,args.p_next,mock.remote);return {data:{data:mock.remote},error:null};}catch(error:any){return {data:null,error:{code:'40001',message:error.message}};}};});
describe('server-confirmed counter checkout',()=>{
 it('waits for the server before changing local stock or returning a sale',async()=>{
  const s=shop();let release!:()=>void;const gate=new Promise<void>(r=>release=r);const original=mock.handler;
  mock.handler=async(args:any)=>{await gate;return original(args);};
  let returned=false;const saving=commitCashCheckout(s,[{productId:'p',quantity:1}]).then(r=>{returned=true;return r;});
  await vi.waitFor(()=>expect(mock.calls).toBe(1));expect(returned).toBe(false);expect(JSON.parse(localStorage.getItem('storeflow_'+s.accessCode)!).products[0].quantity).toBe(1);
  release();const r=await saving;expect(r.error).toBeUndefined();expect(r.store.products[0].quantity).toBe(0);expect(mock.remote.cashBalance).toBe(100);expect(getPendingStoreSync(s.accessCode)).toBeNull();
 });
 it('rejects a competing sale without persisting the losing sale',async()=>{
  const s=shop();mock.remote={...mock.remote,products:[{...s.products[0],quantity:0}],sales:[{id:'other'}]};
  const r=await commitCashCheckout(s,[{productId:'p',quantity:1}]);expect(r.error).toContain('Another device');expect(r.sales).toHaveLength(0);expect(mock.remote.sales).toEqual([{id:'other'}]);
  await retryStoreSync(s.accessCode);expect(getPendingStoreSync(s.accessCode)).toBeNull();
 });
 it('recovers a lost response using the exact same transaction IDs',async()=>{
  const s=shop();const original=mock.handler;let first=true;
  mock.handler=async(args:any)=>{const result=await original(args);if(first){first=false;return {data:null,error:{message:'Connection lost'}};}return result;};
  const r=await commitCashCheckout(s,[{productId:'p',quantity:1}]);expect(r.error).toBeUndefined();
  await retryStoreSync(s.accessCode);expect(mock.remote.sales).toHaveLength(1);expect(mock.remote.sales[0].id).toBe(r.sales[0].id);expect(mock.remote.cashBalance).toBe(100);expect(getPendingStoreSync(s.accessCode)).toBeNull();
 });
 it('keeps offline checkout pending without pretending it was uploaded',async()=>{
  const s=shop();vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
  const r=await commitCashCheckout(s,[{productId:'p',quantity:1}]);await retryStoreSync(s.accessCode);
  expect(r.error).toBeUndefined();expect(getPendingStoreSync(s.accessCode)?.next.sales).toHaveLength(1);expect(mock.calls).toBe(0);
 });
 it('retains an edit made while online checkout is in flight for conflict review',async()=>{
  const s=shop();let release!:()=>void;const gate=new Promise<void>(r=>release=r);const original=mock.handler;
  mock.handler=async(args:any)=>{await gate;return original(args);};const saving=commitCashCheckout(s,[{productId:'p',quantity:1}]);
  await vi.waitFor(()=>expect(mock.calls).toBe(1));localStorage.setItem('storeflow_'+s.accessCode,JSON.stringify({...s,cashBalance:50}));release();
  const r=await saving;expect(r.error).toBeUndefined();expect(r.store.cashBalance).toBe(50);expect(mock.remote.cashBalance).toBe(100);expect(getPendingStoreSync(s.accessCode)?.state).toBe('conflict');
 });
 it('recovers a closed tab after the request reached the server but before the local write',async()=>{
  const s=shop();const next={...s,cashBalance:100,sales:[{id:'durable'}]};
  mock.remote=cloudSnapshot(next as any);localStorage.setItem('storeflow_sync_pending_'+s.accessCode,JSON.stringify({base:s,next,state:'syncing'}));
  await retryStoreSync(s.accessCode);expect(getPendingStoreSync(s.accessCode)).toBeNull();expect(JSON.parse(localStorage.getItem('storeflow_'+s.accessCode)!).sales).toHaveLength(1);
 });
});
