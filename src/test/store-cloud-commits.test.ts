import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ remote: {} as any, handler: null as any, calls: 0 }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id:'owner' } } }, error:null }) },
  from: () => { const query: any = { select: () => query, eq: () => query, retry: () => query, abortSignal: () => query, single: async () => ({data:{id:'store',data:mock.remote},error:null}), maybeSingle: async () => ({data:{id:'store'},error:null}) }; return query; },
  rpc: async (_name: string, args: any) => { mock.calls++; return mock.handler(args); },
} }));
import { createStore } from '@/lib/store-data';
import { commitCashCheckout } from '@/lib/committed-checkout';
import { cloudSnapshot, getPendingStoreSync, retryStoreSync } from '@/lib/store-cloud-sync';
import { mergeStoreSnapshot } from '@/lib/store-sync-guard';
import { noteCloudReached } from '@/lib/cloud-reach';
import type { StoreData } from '@/types/store';
function shop(): StoreData {
 const s=createStore('Cloud test','retail');
 const store={...s,storeId:'cloud-id',products:[{id:'p',name:'Soap',quantity:1,costPrice:60,sellingPrice:100,category:'Goods'}],sales:[],cashBalance:0,bankBalance:0,managerSettings:{...s.managerSettings!,multiDeviceSync:true,autoBackupsEnabled:false}};
 localStorage.setItem('storeflow_'+store.accessCode,JSON.stringify(store));mock.remote=cloudSnapshot(store);return store;
}
// The half-minute an unreachable cloud is left alone is per page, so each test starts with a reachable one.
beforeEach(()=>{noteCloudReached();localStorage.clear();mock.calls=0;vi.spyOn(navigator,'onLine','get').mockReturnValue(true);mock.handler=async (args:any)=>{try {mock.remote=mergeStoreSnapshot(args.p_base,args.p_next,mock.remote);return {data:{data:reply(args,mock.remote)},error:null};}catch(error:any){return {data:null,error:{code:'40001',message:error.message}};}};});
// What the cloud sends back: with p_reply 'changes', only the parts that differ
// from what the phone sent (supabase/migrations/*_reply_with_changes_only.sql).
function reply(args:any,remote:any){
 if(args.p_reply!=='changes')return remote;
 return Object.fromEntries(Object.entries(remote).filter(([key,value])=>JSON.stringify(args.p_next?.[key])!==JSON.stringify(value)));
}
describe('the reply to a save',()=>{
 it('is asked to carry only what changed, and the shop comes out the same',async()=>{
  const s=shop();const seen:any[]=[];const original=mock.handler;mock.handler=async(args:any)=>{seen.push(args);return original(args);};
  // Another phone renamed the shop meanwhile: that, and only that, comes back.
  mock.remote={...mock.remote,storeName:'Renamed elsewhere'};
  const r=await commitCashCheckout(s,[{productId:'p',quantity:1}]);
  expect(r.error).toBeUndefined();expect(seen[0].p_reply).toBe('changes');
  expect(r.store.storeName).toBe('Renamed elsewhere');expect(r.store.products[0].quantity).toBe(0);expect(r.store.sales).toHaveLength(1);
  // Our own copy keeps what the cloud never holds.
  expect(r.store.managerSettings).toEqual(expect.objectContaining({multiDeviceSync:true}));
  const saved=JSON.parse(localStorage.getItem('storeflow_'+s.accessCode)!);
  localStorage.setItem('storeflow_'+s.accessCode,JSON.stringify({...saved,customers:[{id:'c1',name:'Ada'}]}));
  const next={...saved,customers:[{id:'c1',name:'Ada'}]};
  localStorage.setItem('storeflow_sync_pending_'+s.accessCode,JSON.stringify({base:saved,next,state:'pending'}));
  await retryStoreSync(s.accessCode);
  expect(seen[1].p_reply).toBe('changes');expect(getPendingStoreSync(s.accessCode)).toBeNull();
  expect(JSON.parse(localStorage.getItem('storeflow_'+s.accessCode)!).customers).toEqual([{id:'c1',name:'Ada'}]);
  expect(mock.remote.customers).toEqual([{id:'c1',name:'Ada'}]);
 });
});
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
  // The dropped line is left alone for half a minute; this is it coming back.
  noteCloudReached();
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
