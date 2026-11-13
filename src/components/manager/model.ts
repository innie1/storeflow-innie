import { StoreData, TabId } from '@/types/store';
import type { ProductFocus } from '@/lib/product-focus';

export interface ManagerProps {
  store: StoreData;
  orders?: any[];
  onUpdate: (s: StoreData) => void;
  onEnable?: () => void;
  onNavigate?: (tab: TabId, focus?: ProductFocus | string) => void;
}

export type ManagerTab = 'overview' | 'predictions' | 'analysis' | 'advice';
