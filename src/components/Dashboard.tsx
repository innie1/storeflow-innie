import { StoreData } from '@/types/store';
import OwnerDashboard from '@/components/dashboards/OwnerDashboard';
import ManagerDashboard from '@/components/dashboards/ManagerDashboard';
import CashierDashboard from '@/components/dashboards/CashierDashboard';
import InventoryDashboard from '@/components/dashboards/InventoryDashboard';
import AccountantDashboard from '@/components/dashboards/AccountantDashboard';
import SupervisorDashboard from '@/components/dashboards/SupervisorDashboard';

interface DashboardProps {
  store: StoreData;
  onNavigate: (tab: any, lowStock?: boolean) => void;
  currentUser?: any;
}

export default function Dashboard({ store, onNavigate, currentUser }: DashboardProps) {
  const role = currentUser?.role;

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
        return <OwnerDashboard store={store} onNavigate={onNavigate} />;
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
      return <OwnerDashboard store={store} onNavigate={onNavigate} />;
  }
}