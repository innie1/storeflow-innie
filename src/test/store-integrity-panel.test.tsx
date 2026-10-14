import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import StoreIntegrityPanel from '@/components/StoreIntegrityPanel';
import { createStore } from '@/lib/store-data';
beforeEach(()=>{localStorage.clear();vi.spyOn(navigator,'onLine','get').mockReturnValue(false);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('shows the owner a read-only historical stock check',()=>{
 const store=createStore('Preview','retail');store.products=[{id:'p',name:'Soap',quantity:0.04,costPrice:1,sellingPrice:2,category:'Goods',isCartonSingleEnabled:true,singlesPerCarton:12}];
 // Drawn only when the owner has something to decide: a held sync.
 localStorage.setItem('storeflow_sync_pending_'+store.accessCode,JSON.stringify({base:store,next:store,state:'conflict'}));
 const before=JSON.stringify(store);render(<StoreIntegrityPanel store={store} owner />);
 expect(screen.getByRole('status')).toHaveTextContent('Sync needs your review');
 expect(screen.getByRole('button',{name:'Review'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Check records'}));expect(screen.getByText(/does not represent valid whole pieces/)).toBeInTheDocument();expect(JSON.stringify(store)).toBe(before);
});
it('keeps waiting, syncing and failed tries off the page - the app retries them itself',()=>{
 const store=createStore('Pending','retail');
 for (const state of ['pending','syncing','error']) {
  localStorage.setItem('storeflow_sync_pending_'+store.accessCode,JSON.stringify({base:store,next:store,state,error:'Sync failed.'}));
  const { container } = render(<StoreIntegrityPanel store={store} owner />);
  expect(container.innerHTML).toBe('');
  cleanup();
 }
});
it('shows a worker nothing, even when the sync is held - only the owner can settle it',()=>{
 const store=createStore('Held','retail');localStorage.setItem('storeflow_sync_pending_'+store.accessCode,JSON.stringify({base:store,next:store,state:'conflict'}));
 const { container } = render(<StoreIntegrityPanel store={store} owner={false} />);expect(container.innerHTML).toBe('');
});
