import { StoreData } from '@/types/store';
import type { ProductFocus } from '@/lib/product-focus';

export const CODE39_MAP: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100',
  'A': '100001001', 'B': '001001001', 'C': '101001000', 'D': '000011001',
  'E': '100011000', 'F': '001011000', 'G': '000001101', 'H': '100001100',
  'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110',
  'U': '110000001', 'V': '011000001', 'W': '111000000', 'X': '010010001',
  'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
  '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
};

export interface InventoryProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  filterLowStock?: boolean;
  onClearFilter?: () => void;
  currentUser?: any;
  autoOpenRestock?: boolean;
  onAutoOpenRestockHandled?: () => void;
  /**
   * A single product to open on arrival, sent by whatever advice named it.
   * Without this, "Open" on advice about one product dropped the merchant onto
   * a list of everything they sell.
   */
  focusProduct?: ProductFocus | null;
  onFocusProductHandled?: () => void;
}

export interface ShoppingListItem {
  productId: string;
  name: string;
  quantity: number;
  category: string;
}

export interface MassEditItem {
  id: string;
  name: string;
  category: string;
  purchaseUnit: string;
  sellingUnit: string;
  unitsPerPurchase: number;
  purchasePrice: number;
  unitCostPrice: number;
  sellingPrice: number;
  purchaseSellingPrice: number;
  pricingMode: 'auto' | 'manual';
  selected?: boolean;
  showMore?: boolean;
}
