import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X } from 'lucide-react';
import type { StoreData } from '@/types/store';

/**
 * The half-ticket the customer walks away with.
 *
 * Paper always gives them something. The app gave them nothing unless the shop
 * remembered to press WhatsApp - and a customer with no number, or a shop in a
 * hurry, ended up with a bundle and no proof of it. The first time somebody
 * comes back and cannot say what they dropped, the shop goes back to paper.
 *
 * So this is the customer's side of the counter, and everything about it is
 * built to be photographed: a light panel whatever the app's theme, the code
 * large enough to read across a counter, the shop's own name and number on it
 * so the picture means something in a week, and no merchant instructions -
 * "write this on every tag in the bundle" is not for them.
 *
 * The part paper cannot match is that it can be shown again. A lost paper
 * ticket is lost; this one is on the record for as long as the record exists.
 */

export interface ClaimTicketRecord {
  tagCode: string;
  customerName: string;
  serviceName: string;
  pieceCount: number;
  garmentSummary: string;
  total: number;
  amountPaid?: number;
  promisedFor?: string;
}

/**
 * What is left to pay, never negative.
 *
 * An overpayment is the shop's problem to sort out at the counter, not a
 * negative number printed on a customer's ticket.
 */
export function claimBalance(record: Pick<ClaimTicketRecord, 'total' | 'amountPaid'>): number {
  return Math.max(0, Number(record.total || 0) - Number(record.amountPaid || 0));
}

interface Props {
  store: StoreData;
  record: ClaimTicketRecord;
  onClose: () => void;
}

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

/** When to come back, or an honest shrug rather than an invented date. */
export function whenReady(promisedFor?: string): string {
  if (!promisedFor) return 'Ask the shop';
  const at = new Date(promisedFor);
  if (!Number.isFinite(at.getTime())) return 'Ask the shop';
  return at.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function ClaimTicket({ store, record, onClose }: Props) {
  const [qr, setQr] = useState('');

  useEffect(() => {
    QRCode.toDataURL(`STORE:${store.accessCode}|LAUNDRY:${record.tagCode}`, { width: 320, margin: 1 })
      .then(setQr)
      .catch(() => setQr(''));
  }, [store.accessCode, record.tagCode]);

  const balance = claimBalance(record);
  const shopPhone = store.profile?.phone || '';

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-label="Collection ticket">
      {/*
        White, not the app's theme.

        This gets held up across a counter and photographed, sometimes in
        daylight. A dark panel photographs badly and prints worse, and the
        customer's phone is not running our stylesheet.
      */}
      <div
        className="w-full max-w-xs rounded-2xl bg-white text-neutral-900 p-5 text-center relative"
        onClick={event => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-neutral-400"
        >
          <X className="w-4 h-4" />
        </button>

        <p className="font-display font-black text-base leading-tight">{store.storeName}</p>
        {shopPhone && <p className="text-[11px] text-neutral-500">{shopPhone}</p>}

        {qr && <img src={qr} alt="" className="w-32 h-32 mx-auto mt-3" />}

        {/* The code is the whole point of the ticket, so it is the biggest
            thing on it. */}
        <p className="font-mono font-black text-3xl tracking-[0.18em] mt-2">{record.tagCode}</p>
        <p className="text-[11px] text-neutral-500 mt-1">Show this when you collect</p>

        <div className="mt-4 border-t border-neutral-200 pt-3 text-left text-[12px] space-y-1.5">
          <div className="flex justify-between gap-3">
            <span className="text-neutral-500">Name</span>
            <span className="font-semibold text-right truncate">{record.customerName}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-neutral-500">Items</span>
            <span className="font-semibold text-right">{record.pieceCount} {record.pieceCount === 1 ? 'piece' : 'pieces'}</span>
          </div>
          {record.garmentSummary && (
            <p className="text-[11px] text-neutral-500 leading-snug">{record.garmentSummary}</p>
          )}
          <div className="flex justify-between gap-3">
            <span className="text-neutral-500">Ready</span>
            <span className="font-semibold text-right">{whenReady(record.promisedFor)}</span>
          </div>
        </div>

        <div className="mt-3 border-t border-neutral-200 pt-3 text-left text-[12px] space-y-1.5">
          <div className="flex justify-between gap-3">
            <span className="text-neutral-500">Total</span>
            <span className="font-semibold">{money(record.total)}</span>
          </div>
          {/*
            What is still owed, in plain sight on the customer's own copy.

            A balance only the shop knows about is a balance that gets argued
            about at the counter. Both sides having the same number written
            down is most of the argument gone.
          */}
          {balance > 0 ? (
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="text-neutral-500">To pay on collection</span>
              <span className="font-black">{money(balance)}</span>
            </div>
          ) : (
            <p className="text-[12px] font-bold text-emerald-700">Paid in full</p>
          )}
        </div>

        <p className="text-[10px] text-neutral-400 mt-4">Take a photo of this ticket</p>
      </div>
    </div>
  );
}
