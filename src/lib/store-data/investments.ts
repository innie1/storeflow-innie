import { StoreData, Investment } from '@/types/store';
import { generateId2 } from './ids';
import { saveStore } from './load-save';

export function addInvestment(store: StoreData, investment: Omit<Investment, 'id'>): StoreData {
  const newInv: Investment = { ...investment, id: generateId2() };
  const updated: StoreData = {
    ...store,
    investments: [newInv, ...(store.investments || [])],
  };
  saveStore(updated);
  return updated;
}

export function deleteInvestment(store: StoreData, id: string): StoreData {
  const updated: StoreData = {
    ...store,
    investments: (store.investments || []).filter(i => i.id !== id),
  };
  saveStore(updated);
  return updated;
}

export function getTotalInvestment(store: StoreData): number {
  return (store.investments || []).reduce((sum, i) => sum + i.amount, 0);
}
