import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import type { StoreData } from '@/types/store';
import WorkerReportSheet from '@/components/staff/WorkerReportSheet';

/**
 * "My report" on a worker's home screen.
 *
 * What she used to type out on WhatsApp at the end of the week, made from
 * what she recorded: she picks the time and summary or full, and sends it to
 * the shop's number.
 */
export default function MyReportButton({ store, currentUser }: {
  store: StoreData;
  currentUser?: { id?: string; name?: string; role?: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const me = (store.staffMembers || []).find(member => member.id === currentUser?.id);
  const person = useMemo(() => (me ? { id: me.id, name: me.name, role: me.role } : null), [me?.id, me?.name, me?.role]);
  if (!currentUser?.id || currentUser.role === 'owner' || !person) return null;

  const shopPhone = String(store.profile?.phone || '').trim();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 h-11 px-4 rounded-xl bg-card border border-border text-foreground font-display font-black text-sm flex items-center gap-1.5 whitespace-nowrap active:scale-[0.98] transition"
      >
        <FileText className="w-4 h-4 text-primary" /> My report
      </button>
      {open && (
        <WorkerReportSheet
          store={store}
          person={person}
          sendTo={{ phone: shopPhone, label: shopPhone ? 'Send to the shop' : 'Send on WhatsApp' }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
