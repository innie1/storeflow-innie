import { StoreData, BusinessGoal } from '@/types/store';
import { generateId } from './ids';
import { saveStore } from './load-save';

// ─── Business Goals ───────────────────────────────────────────────────────────
export function addGoal(store: StoreData, goal: Omit<BusinessGoal, 'id' | 'completed'>): StoreData {
  const newGoal: BusinessGoal = {
    ...goal,
    id: generateId(),
    completed: goal.current >= goal.target
  };
  const updated = {
    ...store,
    goals: [newGoal, ...(store.goals || [])]
  };
  saveStore(updated);
  return updated;
}

export function updateGoal(store: StoreData, id: string, updates: Partial<BusinessGoal>): StoreData {
  const updated = {
    ...store,
    goals: (store.goals || []).map(g => {
      if (g.id !== id) return g;
      const combined = { ...g, ...updates };
      return {
        ...combined,
        completed: combined.current >= combined.target
      };
    })
  };
  saveStore(updated);
  return updated;
}

export function deleteGoal(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    goals: (store.goals || []).filter(g => g.id !== id)
  };
  saveStore(updated);
  return updated;
}
