import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import StoreIntegrityPanel from '@/components/StoreIntegrityPanel';
import { createStore } from '@/lib/store-data';
beforeEach(()=>{localStorage.clear();vi.spyOn(navigator,'onLine','get').mockReturnValue(false);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('shows the owner a read-only historical stock check',()=>{
 const store=createStore('Preview','retail');store.products=[{id:'p',name:'Soap',quantity:0.04,costPrice:1,sellingPrice:2,category:'Goods',isCartonSingleEnabled:true,singlesPerCarton:12}];
 const before=JSON.stringify(store);render(<StoreIntegrityPanel store={store} owner />);
 fireEvent.click(screen.getByRole('button',{name:'Check records'}));expect(screen.getByText(/does not represent valid whole pieces/)).toBeInTheDocument();expect(JSON.stringify(store)).toBe(before);
});
it('shows offline pending status and retry without exposing owner controls to staff',()=>{
 const store=createStore('Pending','retail');localStorage.setItem('storeflow_sync_pending_'+store.accessCode,JSON.stringify({base:store,next:store,state:'pending'}));
 render(<StoreIntegrityPanel store={store} owner={false} />);expect(screen.getByRole('status')).toHaveTextContent('saved on this device');expect(screen.getByRole('button',{name:'Retry sync'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Check records'})).not.toBeInTheDocument();
});
