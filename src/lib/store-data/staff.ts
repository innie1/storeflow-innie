import { recordActivityLog } from '../activity-log';
import { StoreData, StaffMember, Shift, CashSession } from '@/types/store';
import { generateId } from './ids';
import { saveStore } from './load-save';

// ─── Staff Management Helpers ─────────────────────────────────────────────────
export function addStaffMember(store: StoreData, staff: Omit<StaffMember, 'id'>, actorName?: string, actorRole?: string): StoreData {
  const newStaff: StaffMember = {
    ...staff,
    id: generateId()
  };
  let updated: StoreData = {
    ...store,
    staffMembers: [newStaff, ...(store.staffMembers || [])]
  };
  if (actorName) {
    updated = recordActivityLog(updated, actorName, actorRole, `Registered staff account: ${staff.name} (${staff.role})`);
  }
  saveStore(updated);
  return updated;
}

export function updateStaffMember(store: StoreData, id: string, updates: Partial<StaffMember>, actorName?: string, actorRole?: string): StoreData {
  const staff = (store.staffMembers || []).find(s => s.id === id);
  const staffName = staff?.name || 'Staff Member';
  let updated: StoreData = {
    ...store,
    staffMembers: (store.staffMembers || []).map(s => s.id === id ? { ...s, ...updates } : s)
  };
  if (actorName) {
    let desc = `Updated staff account details for: ${staffName}`;
    if (updates.pin) desc = `Reset PIN for staff account: ${staffName}`;
    updated = recordActivityLog(updated, actorName, actorRole, desc);
  }
  saveStore(updated);
  return updated;
}

export function deleteStaffMember(store: StoreData, id: string, actorName?: string, actorRole?: string): StoreData {
  const staff = (store.staffMembers || []).find(s => s.id === id);
  const staffName = staff?.name || 'Staff Member';
  let updated: StoreData = {
    ...store,
    staffMembers: (store.staffMembers || []).filter(s => s.id !== id)
  };
  if (actorName) {
    updated = recordActivityLog(updated, actorName, actorRole, `Deleted staff account: ${staffName}`);
  }
  saveStore(updated);
  return updated;
}

// ─── Shift Tracking Helpers ───────────────────────────────────────────────────
export function startShift(store: StoreData, staffId: string, staffName: string, openingCash: number): StoreData {
  const newShift: Shift = {
    id: generateId(),
    staffId,
    staffName,
    startTime: new Date().toISOString(),
    salesMade: 0,
    revenue: 0,
    openingCash
  };
  const updated = {
    ...store,
    shifts: [newShift, ...(store.shifts || [])]
  };
  saveStore(updated);
  return updated;
}

export function endShift(store: StoreData, id: string, closingCash: number): StoreData {
  const updated = {
    ...store,
    shifts: (store.shifts || []).map(s => {
      if (s.id !== id) return s;
      return {
        ...s,
        endTime: new Date().toISOString(),
        closingCash
      };
    })
  };
  saveStore(updated);
  return updated;
}

// ─── Cash Session Drawer Helpers ──────────────────────────────────────────────
export function recordCashSession(store: StoreData, session: Omit<CashSession, 'id'>): StoreData {
  const newSession: CashSession = {
    ...session,
    id: generateId()
  };
  const updated = {
    ...store,
    cashSessions: [newSession, ...(store.cashSessions || [])]
  };
  saveStore(updated);
  return updated;
}
