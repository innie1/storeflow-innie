import ToggleRow from '@/components/Toggle';
import { card, SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function NotificationsView({ s }: { s: SettingsState }) {
  const { keepsStock, setView, mgr, updateMgr } = s;
  return (
    <SubPage title="Notifications" onBack={() => setView('home')}>
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Insights" checked={mgr.notifyInsights} onChange={v => updateMgr({ notifyInsights: v })} />
        <ToggleRow label="Recommendations" checked={mgr.notifyRecommendations} onChange={v => updateMgr({ notifyRecommendations: v })} />
        <ToggleRow label="Alerts" checked={mgr.notifyAlerts} onChange={v => updateMgr({ notifyAlerts: v })} />
        <ToggleRow label="Weekly Recaps" checked={mgr.notifyWeeklyRecap} onChange={v => updateMgr({ notifyWeeklyRecap: v })} />
        <ToggleRow label="Monthly Reports" checked={mgr.notifyMonthlyReports} onChange={v => updateMgr({ notifyMonthlyReports: v })} />
        <ToggleRow label="Savings Reminders" checked={mgr.notifySavingsReminders} onChange={v => updateMgr({ notifySavingsReminders: v })} />
        <ToggleRow label="Customer Request Alerts" checked={mgr.notifyCustomerRequests} onChange={v => updateMgr({ notifyCustomerRequests: v })} />
        {keepsStock && <ToggleRow label="Low Stock Alerts" checked={mgr.notifyLowStock} onChange={v => updateMgr({ notifyLowStock: v })} />}
      </div>
    </SubPage>
  );
}
