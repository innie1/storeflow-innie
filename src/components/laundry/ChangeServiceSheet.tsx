import { useMemo, useState } from 'react';
import type { StoreData } from '@/types/store';
import type { DecoratedRecord } from '@/lib/laundry-records';
import { changeLaundryService } from '@/lib/laundry-offline';
import { repriceLaundryDebt } from '@/lib/laundry-money';
import { BUNDLE_REPLACED_EVENT, laundryServices, quoteServiceChange, SERVICE_CHANGE_REASONS } from '@/lib/laundry-service-change';
import { saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';

interface Props {
  store: StoreData;
  record: DecoratedRecord;
  onUpdate: (store: StoreData) => void;
  onClose: () => void;
}

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

/**
 * Moves a bundle to the right service - "Full service" that was only ironing -
 * priced again from the price list, with the reason. The owner is told.
 */
export default function ChangeServiceSheet({ store, record, onUpdate, onClose }: Props) {
  const currentId = String(record.order?.service_metadata?.service_id || '');
  const options = useMemo(
    () => laundryServices(store).filter(service => String(service.id) !== currentId && service.name !== record.serviceName),
    [store, currentId, record.serviceName],
  );
  const [serviceId, setServiceId] = useState(options[0] ? String(options[0].id) : '');
  const service = options.find(item => String(item.id) === serviceId);
  const quote = useMemo(() => service ? quoteServiceChange(store, record.order, service) : null, [store, record.order, service]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const paid = Math.max(0, record.total - record.balance);
  const newTotal = quote?.total ?? 0;
  const over = paid - newTotal;

  const save = async () => {
    if (!quote || !reason.trim() || saving) return;
    setSaving(true);
    const result = await changeLaundryService(String(store.accessCode || ''), record.clientRef, {
      serviceId: String(quote.service.id),
      serviceName: quote.service.name,
      pricing: quote.pricing,
      billingQuantity: quote.billingQuantity,
      total: quote.total,
      garments: quote.garments,
      reason,
    });
    setSaving(false);
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    const next = repriceLaundryDebt(store, record.clientRef, quote.total, quote.service.name);
    if (next !== store) { saveStore(next); onUpdate(next); }
    if (result.order) window.dispatchEvent(new CustomEvent(BUNDLE_REPLACED_EVENT, { detail: { order: result.order } }));
    showToast(`${record.tagCode} is now ${quote.service.name}`, 'success');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-background/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-label="Change service"
    >
      <div className="w-full sm:max-w-sm rounded-3xl bg-card border border-border p-5 space-y-3 text-left" onClick={event => event.stopPropagation()}>
        <div>
          <p className="text-[10px] uppercase font-black tracking-wider text-primary">{record.tagCode} · {record.customerName}</p>
          <h3 className="font-display font-black text-lg leading-tight mt-0.5">Change service</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Now: {record.serviceName.split(' · ')[0]} · {money(record.total)}</p>
        </div>

        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground">There is no other service in your price list to move it to.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {options.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setServiceId(String(item.id))}
                  aria-pressed={String(item.id) === serviceId}
                  className={`px-3 py-2.5 rounded-xl border text-left text-xs font-black truncate ${String(item.id) === serviceId ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'}`}
                >
                  {item.name}
                </button>
              ))}
            </div>

            {quote && (
              <div className="rounded-xl bg-surface-2 border border-border px-3 py-2 text-xs space-y-0.5">
                <p className="flex justify-between"><span>New price</span><b className="font-display">{money(newTotal)}</b></p>
                {paid > 0 && <p className="flex justify-between text-muted-foreground"><span>Already paid</span><span>{money(paid)}</span></p>}
                {over > 0
                  ? <p className="text-amber-500 font-bold pt-0.5">Paid {money(over)} more than the new price - give it back to the customer.</p>
                  : paid > 0 && <p className="flex justify-between font-bold"><span>Still to pay</span><span>{money(newTotal - paid)}</span></p>}
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-[10px] uppercase font-black text-muted-foreground">Why?</p>
              <div className="flex flex-wrap gap-1.5">
                {SERVICE_CHANGE_REASONS.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setReason(item)}
                    aria-pressed={reason === item}
                    className={`h-8 px-2.5 rounded-lg border text-[11px] font-bold ${reason === item ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface-2'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <input
                value={reason}
                onChange={event => setReason(event.target.value.slice(0, 200))}
                placeholder="Or say why"
                aria-label="Why the service is changing"
                className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm"
              />
            </div>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!quote || !reason.trim() || saving}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Change'}
          </button>
        </div>
      </div>
    </div>
  );
}
