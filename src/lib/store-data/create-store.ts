import { Product, StoreData, Investment, StoreCategory, StoreType, GameService } from '@/types/store';
import { STORE_PREFIX } from './keys';
import { generateCode, generateId, generateStoreUniqueCode, generatePermanentStoreId } from './ids';
import { upsertStoreIndex } from './store-index';
import { shopStorage } from '@/lib/shop-storage';

export const DEFAULT_GAMES: Omit<GameService, 'id'>[] = [
  { name: 'PlayStation', icon: '🎮', price: 500, enabled: false, order: 0 },
  { name: 'Snooker', icon: '🎱', price: 1000, enabled: false, order: 1 },
  { name: 'Xbox', icon: '🎮', price: 500, enabled: false, order: 2 },
  { name: 'Table Tennis', icon: '🏓', price: 300, enabled: false, order: 3 },
  { name: 'Darts', icon: '🎯', price: 200, enabled: false, order: 4 },
  { name: 'Karaoke', icon: '🎤', price: 1500, enabled: false, order: 5 },
  { name: 'VR Games', icon: '🥽', price: 2000, enabled: false, order: 6 },
];

export function createStore(storeName: string, category: StoreCategory = 'retail', retailType?: string, logoStyle?: string, storeTypeOverride?: StoreType, uiMode: 'simple' | 'full' = 'simple'): StoreData {
  const code = generateCode();
  const now = new Date().toISOString();
  // New stores always start with an empty catalogue — no auto-imported starter products.
  const products: Product[] = [];
  const inventoryValue = products.reduce((sum, p) => sum + p.costPrice * p.quantity, 0);
  const investments: Investment[] = inventoryValue > 0 ? [{
    id: generateId(),
    amount: Math.round(inventoryValue * 100) / 100,
    note: 'Auto: starting inventory value',
    date: now,
    type: 'initial',
  }] : [];
  const games: GameService[] | undefined = category === 'games'
    ? DEFAULT_GAMES.map(g => ({ ...g, id: generateId() }))
    : undefined;
  const storeId = generatePermanentStoreId();
  const store: StoreData = {
    storeId,
    storeName,
    accessCode: code,
    category,
    retailType,
    storeType: storeTypeOverride || (category === 'restaurant' ? 'restaurant' : category === 'games' ? 'games' : category === 'other' ? 'other' : 'provision'),
    uiMode: uiMode,
    simpleOnboarding: { complete: false },
    products,
    sales: [],
    restocks: [],
    expenses: [],
    investments,
    games,
    gameSessions: category === 'games' ? [] : undefined,
    createdAt: now,
    profile: {
      storeType: '',
      location: '',
      phone: '',
      email: '',
      logoStyle: logoStyle || 'minimalist',
      uniqueCode: generateStoreUniqueCode(),
    }
  };
  shopStorage.setItem(STORE_PREFIX + code, JSON.stringify(store));
  upsertStoreIndex(store);
  return store;
}
