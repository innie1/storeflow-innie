export type BuyListItem = { productId: string; name: string; quantity: number; unitCost?: number };
export type BuyListStatus = 'draft' | 'approved' | 'shared' | 'received' | 'cancelled';
export type BuyListRecord = { id: string; code: string; createdAt: string; status: BuyListStatus; items: BuyListItem[] };
const KEY = 'storeflow_buy_lists_v1';
export const loadBuyLists = (): BuyListRecord[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
export const saveBuyList = (list: BuyListRecord) => localStorage.setItem(KEY, JSON.stringify([list, ...loadBuyLists().filter(x => x.id !== list.id)]));
export const createBuyList = (items: BuyListItem[]): BuyListRecord => { const list: BuyListRecord = { id: crypto.randomUUID(), code: `PO-${Math.random().toString(36).slice(2,8).toUpperCase()}`, createdAt: new Date().toISOString(), status: 'approved', items }; saveBuyList(list); return list; };
export const findBuyList = (code: string) => loadBuyLists().find(x => x.code.toLowerCase() === code.trim().toLowerCase());
export const markBuyListReceived = (code: string) => { const list = findBuyList(code); if (!list) return null; if (list.status === 'received') return list; const next = { ...list, status: 'received' as const }; saveBuyList(next); return next; };
