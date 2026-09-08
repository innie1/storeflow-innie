import { Store } from 'lucide-react';
import type { StoreData } from '@/types/store';
import StoreLogo from '@/components/StoreLogo';

/**
 * The shop's picture, drawn the same way everywhere.
 *
 * There were two copies of this choice - photo, else chosen logo, else a
 * fallback - and they disagreed on the last step. The tile on the settings
 * menu fell back to a shop emoji; the profile screen you reached by tapping it
 * fell back to a line-art store icon. So a shop with neither a photo nor a
 * logo saw one picture, tapped it, and found a different picture, which reads
 * as the app having lost track of which shop you are in.
 *
 * One component, so the three-way choice exists once and the two screens
 * cannot drift apart again.
 */

interface Props {
  store: StoreData;
  /** Sizing and shape come from the caller; the contents are the same. */
  className?: string;
  /** Fallback icon size, since the callers differ in scale. */
  iconClassName?: string;
}

export default function StoreAvatar({ store, className = '', iconClassName = 'w-8 h-8' }: Props) {
  const photo = store.profile?.photo;
  const logoStyle = store.profile?.logoStyle;

  return (
    <div className={`overflow-hidden bg-primary/15 border border-primary/30 flex items-center justify-center ${className}`}>
      {photo ? (
        <img src={photo} alt="" className="w-full h-full object-cover" />
      ) : logoStyle ? (
        <StoreLogo
          storeName={store.storeName}
          selectedStyle={logoStyle}
          businessType={store.storeType}
          className="w-full h-full"
        />
      ) : (
        /* The drawn icon, not an emoji: emoji render differently on every
           phone, and this sits beside a set of drawn icons everywhere it
           appears. */
        <Store className={`${iconClassName} text-primary`} />
      )}
    </div>
  );
}
