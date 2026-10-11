import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { myStaffExpenses, recordsAsStaff } from '@/lib/staff-expenses';
import RecordExpenseSheet from '@/components/staff/RecordExpenseSheet';

/**
 * "+ Record Expense" on a worker's home screen.
 *
 * Every worker spends shop money now and then - Hypo, nylon, a bike to a
 * customer - and until now none of them could say so: the only way in was
 * the Expenses page, which their role cannot open because it shows the
 * shop's totals. Owners and managers keep using that page.
 */

interface Props {
  store: StoreData;
  currentUser?: { id?: string; name?: string; role?: string } | null;
  onUpdate: (store: StoreData) => void;
}

export default function StaffExpenseButton({ store, currentUser, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  if (!recordsAsStaff(currentUser)) return null;
  // The account as the shop holds it now, not as it was at sign-in.
  const me = (store.staffMembers || []).find(member => member.id === currentUser!.id);
  if (!me) return null;

  const waiting = myStaffExpenses(store, me.id).filter(item => item.status === 'pending').length;

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-11 px-4 rounded-xl bg-card border border-primary/30 text-primary font-display font-black text-sm flex items-center gap-1.5 active:scale-[0.98] transition"
        >
          <Plus className="w-4 h-4" /> Record Expense
        </button>
        {waiting > 0 && (
          <span className="text-xs text-muted-foreground">
            {waiting} waiting for approval
          </span>
        )}
      </div>
      {open && (
        <RecordExpenseSheet
          store={store}
          worker={{ id: me.id, name: me.name, role: me.role }}
          onUpdate={onUpdate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
