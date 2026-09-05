import { StoreData } from '@/types/store';
import OwnerDashboard from '@/components/dashboards/OwnerDashboard';
import ManagerDashboard from '@/components/dashboards/ManagerDashboard';
import CashierDashboard from '@/components/dashboards/CashierDashboard';
import InventoryDashboard from '@/components/dashboards/InventoryDashboard';
import AccountantDashboard from '@/components/dashboards/AccountantDashboard';
import SupervisorDashboard from '@/components/dashboards/SupervisorDashboard';
import BusinessOwnerDashboard from '@/components/dashboards/BusinessOwnerDashboard';

interface DashboardProps {
  store: StoreData;
  orders?: any[];
  onNavigate: (tab: any, lowStock?: boolean) => void;
  currentUser?: any;
}

export default function Dashboard({ store, orders = [], onNavigate, currentUser }: DashboardProps) {
  const role = currentUser?.role;
  const isBusinessTemplateStore = [
    'laundry',
    'gas_filling',
    'restaurant',
    'food',
    'clothing',
    'electronics',
    'games',
    'other',
  ].includes(store.storeType || '');

  // Owners of configured business types get the lightweight business workspace.
  // Gaming is included here deliberately: the generic OwnerDashboard assumes a
  // normal product/inventory store and can fail on a freshly-created games store.
  // Staff roles keep their existing permission-focused dashboards.
  if ((role === 'owner' || !role) && isBusinessTemplateStore) {
    return <BusinessOwnerDashboard store={store} orders={orders} onNavigate={onNavigate} />;
  }

  switch (role) {
    case 'manager':
      return <ManagerDashboard store={store} onNavigate={onNavigate} />;
    case 'cashier':
      return <CashierDashboard store={store} onNavigate={onNavigate} />;
    case 'inventory':
      return <InventoryDashboard store={store} onNavigate={onNavigate} />;
    case 'accountant':
      return <AccountantDashboard store={store} onNavigate={onNavigate} />;
    case 'supervisor':
      return <SupervisorDashboard store={store} onNavigate={onNavigate} />;
    case 'custom':
      if (currentUser?.permissions?.reports) {
        return <OwnerDashboard store={store} orders={orders} onNavigate={onNavigate} />;
      }
      if (currentUser?.permissions?.sales) {
        return <CashierDashboard store={store} onNavigate={onNavigate} />;
      }
      if (currentUser?.permissions?.inventory) {
        return <InventoryDashboard store={store} onNavigate={onNavigate} />;
      }
      return <CashierDashboard store={store} onNavigate={onNavigate} />;
    case 'owner':
    default:
      return <OwnerDashboard store={store} orders={orders} onNavigate={onNavigate} />;
  }
}
