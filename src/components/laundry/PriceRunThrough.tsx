import { useMemo } from 'react';
import type { Product, StoreData } from '@/types/store';
import { getLaundryGarmentPrice, getLaundryPricingConfig, setLaundryGarmentPrice, renameLaundryGarmentType } from '@/lib/laundry-pricing';
import PriceRun, { type PriceRunItem } from '@/components/PriceRun';

/**
 * The laundry's run through its garment prices.
 *
 * The dealing-cards part of this is in PriceRun now, because a barber with
 * fourteen cuts and a printing shop with a page-size list have exactly the
 * same problem and were left without it. What stays here is the only part that
 * was ever the laundry's: a laundry prices the same garment differently under
 * each service, so the run is per service and a garment can be renamed as it
 * goes.
 */

interface Props {
  store: StoreData;
  service: Product;
  onUpdate: (store: StoreData) => void;
  onClose: () => void;
}

export default function PriceRunThrough({ store, service, onUpdate, onClose }: Props) {
  const items: PriceRunItem[] = useMemo(
    () => getLaundryPricingConfig(store).garmentTypes.map(garment => ({
      key: garment,
      name: garment,
      price: getLaundryGarmentPrice(store, service, garment) || 0,
    })),
    [store, service],
  );

  const save = (item: PriceRunItem, name: string, price: number) => {
    let next = store;
    if (name !== item.key) next = renameLaundryGarmentType(next, item.key, name);
    next = setLaundryGarmentPrice(next, String(service.id), name, price);
    onUpdate(next);
  };

  return (
    <PriceRun
      heading={service.name}
      items={items}
      itemNoun="Item"
      onSave={save}
      onClose={onClose}
    />
  );
}
