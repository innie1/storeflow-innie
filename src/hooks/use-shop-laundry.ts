import { useEffect, useState } from 'react';
import { SHOP_LAUNDRY_CHANGED_EVENT } from '@/lib/shop-laundry';

/**
 * A number that changes whenever the shop's cloud bundles arrive or change.
 *
 * Figures worked out once and remembered - `useMemo(..., [store])` - would
 * otherwise keep the count from before the cloud's bundles had loaded, since
 * those arrive without the shop itself changing. Add this to the memo's list.
 */
export function useShopLaundryVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(current => current + 1);
    window.addEventListener(SHOP_LAUNDRY_CHANGED_EVENT, bump);
    return () => window.removeEventListener(SHOP_LAUNDRY_CHANGED_EVENT, bump);
  }, []);
  return version;
}
