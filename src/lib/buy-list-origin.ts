import { PurchaseOrderRecord } from '@/types/store';

/**
 * How a buy list came to exist, in words the merchant recognises.
 *
 * Two lists sitting next to each other — one where Flow chose the quantities
 * from sales history, one where the shopkeeper ticked items and typed the
 * numbers themselves — looked identical. Both were stored as `manual` too: the
 * restock engine wrote that regardless of which mode built the list, so the
 * record did not even know which it was.
 *
 * `smart_budget` is written by Smart Budget mode, `auto_fix` by Flow acting on
 * its own, and `manual` by hand-picking. Older records only ever carry the
 * first two values, and both still read correctly here.
 */

export type BuyListOrigin = 'smart' | 'hand-picked';

export interface BuyListOriginBadge {
  origin: BuyListOrigin;
  label: string;
  /** One line saying what that actually meant for the quantities. */
  hint: string;
  className: string;
}

export function buyListOrigin(po: Pick<PurchaseOrderRecord, 'source'>): BuyListOriginBadge {
  const chosenByFlow = po.source === 'auto_fix' || po.source === 'smart_budget';

  if (chosenByFlow) {
    return {
      origin: 'smart',
      label: 'Smart',
      hint: 'Quantities worked out from your sales, stock and budget.',
      className: 'bg-primary/15 text-primary border-primary/25',
    };
  }

  return {
    origin: 'hand-picked',
    label: 'Hand-picked',
    hint: 'You chose these items and set the quantities yourself.',
    className: 'bg-surface-3 text-muted-foreground border-border',
  };
}
