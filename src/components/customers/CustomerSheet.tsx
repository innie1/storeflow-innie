import { useMemo } from 'react';
import { ChevronLeft, Edit, MessageCircle, Phone, Trash2 } from 'lucide-react';
import type { Customer, StoreData } from '@/types/store';
import { customerHistory, impactLine } from '@/lib/customer-history';
import ScrollLock from '@/components/ScrollLock';

/**
 * One customer, opened from the customer book.
 *
 * Their bundles, newest first, and what they mean to the shop - money brought
 * in, what they owe, how often they come. Somebody who is not trusted with the
 * shop's money still sees the bundles and what is owed, because that is what a
 * hand-over needs, but not the takings or where the customer ranks.
 */

interface Props {
  store: StoreData;
  customer: Customer;
  /** The shop's bundles from the cloud, so ones booked on another phone are here too. */
  orders?: any[];
  canSeeMoney: boolean;
  /** A follow-up worth sending, when there is one. */
  signal?: { label: string; message: string } | null;
  onFollowUp?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;
const shortDate = (at: number) =>
  at ? new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function CustomerSheet({
  store, customer, orders, canSeeMoney, signal, onFollowUp, onEdit, onDelete, onClose,
}: Props) {
  const history = useMemo(() => customerHistory(store, customer, orders || []), [store, customer, orders]);
  const impact = canSeeMoney ? impactLine(history) : null;
  // The book's purchase rhythm knows nothing about bundles, so for somebody who
  // only ever brings laundry it read "No purchase recorded yet" right above
  // their bundles. Their pieces and last visit say it properly.
  const showStanding = !(history.dropOffs > 0 && !(customer.purchaseHistory || []).length && !customer.lastPurchaseDate);
  const whatsapp = customer.phone ? `https://wa.me/${customer.phone.replace(/\D/g, '').replace(/^0/, '234')}` : '';

  const figures = [
    ...(canSeeMoney ? [{ label: 'Brought in', value: money(history.broughtIn), tone: 'text-success' }] : []),
    { label: 'Owes now', value: money(history.owes), tone: history.owes > 0 ? 'text-amber-500' : 'text-foreground' },
    { label: history.dropOffs === 1 ? 'Drop-off' : 'Drop-offs', value: String(history.dropOffs), tone: 'text-foreground' },
  ];

  return (
    <div className="fixed inset-0 z-[75] bg-background flex flex-col" role="dialog" aria-label={customer.name}>
      <ScrollLock />
      <div className="shrink-0 flex items-center gap-2 border-b border-border p-4">
        <button onClick={onClose} aria-label="Back to customers" className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-black text-base truncate">{customer.name}</h3>
          <p className="text-[11px] text-muted-foreground truncate">{customer.phone || 'No number yet'}</p>
          {customer.address && <p className="text-[10px] text-muted-foreground truncate">{customer.address}</p>}
        </div>
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${customer.name}`}
            className="w-9 h-9 rounded-xl bg-emerald-600/15 text-emerald-500 flex items-center justify-center shrink-0">
            <MessageCircle className="w-4 h-4" />
          </a>
        )}
        {customer.phone && (
          <a href={`tel:${customer.phone}`} aria-label={`Call ${customer.name}`}
            className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
            <Phone className="w-4 h-4" />
          </a>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3 text-left">
        <div className={`grid gap-2 ${figures.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {figures.map(figure => (
            <div key={figure.label} className="rounded-2xl bg-card border border-border p-3">
              <p className={`font-display font-black text-lg leading-tight ${figure.tone}`}>{figure.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{figure.label}</p>
            </div>
          ))}
        </div>

        {/* What they mean to the shop, said once, in words. */}
        <div className="rounded-2xl bg-card border border-border p-3.5 space-y-1">
          {impact && <p className="text-xs font-display font-bold text-foreground">{impact}</p>}
          {showStanding && <p className="text-[11px] text-muted-foreground">{history.standing}</p>}
          {history.pieces > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {history.pieces} {history.pieces === 1 ? 'piece' : 'pieces'} brought in
              {history.lastVisit ? ` · last came ${shortDate(history.lastVisit)}` : ''}
            </p>
          )}
          {history.waitingCount > 0 && (
            <p className="text-[11px] text-amber-500 font-semibold">
              {history.waitingCount} {history.waitingCount === 1 ? 'bundle' : 'bundles'} still in the shop
              {history.waitingUnpaid > 0 ? ` · ${money(history.waitingUnpaid)} not paid yet` : ''}
            </p>
          )}
        </div>

        {signal && onFollowUp && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-[10px] font-black uppercase text-primary">{signal.label}</p>
            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{signal.message}</p>
            <button type="button" onClick={onFollowUp} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white">
              <MessageCircle className="h-3 w-3" /> Review & send on WhatsApp
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-[10px] uppercase font-black text-muted-foreground">Their bundles</p>
          {history.bundles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-5 text-center">
              <p className="text-xs text-muted-foreground">No bundles recorded for {customer.name} yet.</p>
            </div>
          ) : history.bundles.map(bundle => (
            <div key={bundle.clientRef} className="rounded-2xl bg-card border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono font-black text-sm">{bundle.tagCode}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {shortDate(bundle.createdAt)}{bundle.garmentSummary ? ` · ${bundle.garmentSummary}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-[11px] font-display font-bold ${bundle.collected ? 'text-muted-foreground' : 'text-primary'}`}>
                    {bundle.stageLabel}
                  </p>
                  <p className={`text-[11px] ${bundle.balance > 0 ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}`}>
                    {bundle.balance > 0 ? `owes ${money(bundle.balance)}` : 'paid'}
                    {canSeeMoney && bundle.total > 0 ? ` · ${money(bundle.total)}` : ''}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {(customer.purchaseHistory || []).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase font-black text-muted-foreground">What they bought</p>
            {customer.purchaseHistory.slice(0, 20).map((purchase, index) => (
              <div key={`${purchase.date}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-card border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs truncate">{purchase.items}</p>
                  <p className="text-[10px] text-muted-foreground">{shortDate(new Date(purchase.date).getTime())}</p>
                </div>
                {canSeeMoney && <p className="text-xs font-display font-bold shrink-0">{money(purchase.amount)}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 flex gap-2 border-t border-border p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button onClick={onEdit} className="flex-1 h-11 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold flex items-center justify-center gap-1.5">
          <Edit className="w-3.5 h-3.5" /> Edit
        </button>
        <button onClick={onDelete} aria-label={`Remove ${customer.name}`} className="h-11 px-4 rounded-xl bg-surface-2 border border-border text-muted-foreground">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
