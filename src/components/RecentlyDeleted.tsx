import { useState } from 'react';
import { StoreData, TrashItem, Product, Sale, Expense } from '@/types/store';
import { getTrash, restoreTrashItem, purgeTrashItem, emptyTrash } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import ConfirmAccessCode from '@/components/ConfirmAccessCode';

interface RecentlyDeletedProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  onClose: () => void;
}

const KIND_META = {
  product: { icon: '📦', label: 'Product' },
  sale: { icon: '🧾', label: 'Sale' },
  expense: { icon: '💸', label: 'Expense' },
} as const;

function describe(item: TrashItem): { title: string; subtitle: string } {
  if (item.kind === 'product') {
    const p = item.payload as Product;
    return { title: p.name, subtitle: `${p.category} • Qty ${p.quantity} • ₦${p.sellingPrice.toLocaleString()}` };
  }
  if (item.kind === 'sale') {
    const s = item.payload as Sale;
    return {
      title: s.productName,
      subtitle: `${s.quantity} × ₦${s.unitPrice.toLocaleString()} = ₦${s.total.toLocaleString()}`,
    };
  }
  const e = item.payload as Expense;
  return { title: e.category, subtitle: `₦${e.amount.toLocaleString()}${e.note ? ` • ${e.note}` : ''}` };
}

function timeLeft(deletedAt: string): string {
  const ms = 7 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(deletedAt).getTime());
  if (ms <= 0) return 'expiring';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days >= 1) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

export default function RecentlyDeleted({ store, onUpdate, onClose }: RecentlyDeletedProps) {
  const trash = getTrash(store);
  const [filter, setFilter] = useState<'all' | TrashItem['kind']>('all');
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState<TrashItem | null>(null);

  const list = filter === 'all' ? trash : trash.filter(t => t.kind === filter);

  const handleRestore = (item: TrashItem) => {
    onUpdate(restoreTrashItem(store, item.id));
    showToast(`${KIND_META[item.kind].label} restored`);
  };

  const doPurge = () => {
    if (!confirmPurge) return;
    onUpdate(purgeTrashItem(store, confirmPurge.id));
    setConfirmPurge(null);
    showToast('Permanently deleted');
  };

  const doEmpty = () => {
    onUpdate(emptyTrash(store));
    setConfirmEmpty(false);
    showToast('Trash emptied');
  };

  const counts = {
    all: trash.length,
    product: trash.filter(t => t.kind === 'product').length,
    sale: trash.filter(t => t.kind === 'sale').length,
    expense: trash.filter(t => t.kind === 'expense').length,
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-card rounded-t-2xl sm:rounded-2xl shadow-card max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              🗑 Recently Deleted
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Items are kept for 7 days before being permanently removed.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        {/* Filters */}
        <div className="px-5 pt-3 pb-2 flex gap-1.5 flex-wrap">
          {(['all', 'product', 'sale', 'expense'] as const).map(k => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-2.5 py-1 rounded-md text-xs font-display font-semibold border transition-colors ${
                filter === k
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface-2 text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {k === 'all' ? `All (${counts.all})` : `${KIND_META[k].icon} ${KIND_META[k].label}s (${counts[k]})`}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {list.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">
              {trash.length === 0 ? 'Trash is empty.' : 'No items in this category.'}
            </p>
          ) : (
            <div className="space-y-2 pt-1">
              {list.map(item => {
                const { title, subtitle } = describe(item);
                return (
                  <div key={item.id} className="p-3 rounded-lg bg-surface-2 border border-border flex items-center gap-3">
                    <div className="text-2xl shrink-0">{KIND_META[item.kind].icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-sm truncate">{title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Deleted {new Date(item.deletedAt).toLocaleString()} • {timeLeft(item.deletedAt)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => handleRestore(item)}
                        className="px-2.5 py-1 rounded text-[11px] font-display font-semibold bg-success/10 border border-success/20 text-success hover:bg-success/20"
                      >
                        ↺ Restore
                      </button>
                      <button
                        onClick={() => setConfirmPurge(item)}
                        className="px-2.5 py-1 rounded text-[11px] font-display font-semibold bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20"
                      >
                        ✕ Forever
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {trash.length > 0 && (
          <div className="p-4 border-t border-border">
            <button
              onClick={() => setConfirmEmpty(true)}
              className="w-full p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-display font-semibold hover:bg-destructive/20"
            >
              Empty Trash ({trash.length})
            </button>
          </div>
        )}

        {confirmEmpty && (
          <ConfirmAccessCode
            expectedCode={store.accessCode}
            title="Empty trash?"
            message={`Permanently delete all ${trash.length} item${trash.length === 1 ? '' : 's'} in the trash. This cannot be undone.`}
            confirmLabel="Empty Trash"
            onConfirm={doEmpty}
            onCancel={() => setConfirmEmpty(false)}
          />
        )}

        {confirmPurge && (
          <ConfirmAccessCode
            expectedCode={store.accessCode}
            title="Permanently delete?"
            message={`This will remove "${describe(confirmPurge).title}" forever. This cannot be undone.`}
            confirmLabel="Delete Forever"
            onConfirm={doPurge}
            onCancel={() => setConfirmPurge(null)}
          />
        )}
      </div>
    </div>
  );
}
