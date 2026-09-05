/**
 * Where a piece of advice sends you, precisely.
 *
 * "Open" on an advice card used to hand the Inventory tab a tab id and stop
 * there. The merchant was told "Raise price on Mineral", tapped Open, and
 * landed on a list of every product they own — left to scroll or search for
 * the one thing Flow had just named, then find the edit control, then find the
 * price field. Every step of that was already known at the point the advice
 * was written.
 *
 * Carrying the product and the reason means the destination can open the exact
 * thing the merchant was sent to do.
 */

export type ProductFocusIntent =
  /** Open the product's edit form — a price or reorder level is being changed. */
  | 'edit'
  /** Open the product so its stock can be topped up. */
  | 'restock'
  /** Just show the product's details. */
  | 'view';

export interface ProductFocus {
  productId: string;
  intent: ProductFocusIntent;
  /** Kept only so a screen can say which product it could not find. */
  productName?: string;
}
