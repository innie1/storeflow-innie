import { StoreData, MemoryEvent, DiaryEntry } from '@/types/store';
import { generateId } from './ids';
import { saveStore } from './load-save';

// ─── Flow Memory Timeline ────────────────────────────────────────────────────
export function addMemoryTimelineEvent(store: StoreData, event: Omit<MemoryEvent, 'id'>): StoreData {
  const newEv: MemoryEvent = {
    ...event,
    id: generateId()
  };
  const updated = {
    ...store,
    memoryTimeline: [newEv, ...(store.memoryTimeline || [])]
  };
  saveStore(updated);
  return updated;
}

// ─── Diary Helpers ────────────────────────────────────────────────────────────
export function addDiaryEntry(store: StoreData, text: string, audioData?: string): StoreData {
  const newEntry: DiaryEntry = {
    id: generateId(),
    text,
    date: new Date().toISOString(),
    audioData
  };
  const updated = {
    ...store,
    diaryEntries: [newEntry, ...(store.diaryEntries || [])]
  };
  saveStore(updated);
  return updated;
}

export function deleteDiaryEntry(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    diaryEntries: (store.diaryEntries || []).filter(d => d.id !== id)
  };
  saveStore(updated);
  return updated;
}
