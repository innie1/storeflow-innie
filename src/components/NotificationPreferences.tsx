import { useEffect, useState } from 'react';
import ToggleRow from '@/components/Toggle';
import { getFlowNotificationPreferences, saveFlowNotificationPreferences, FlowNotificationPreferences } from '@/lib/notification-preferences';

const row = 'border-b border-border last:border-b-0';

export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState<FlowNotificationPreferences | null>(null);

  useEffect(() => {
    getFlowNotificationPreferences().then(setPrefs);
  }, []);

  if (!prefs) return <div className="px-4 py-4 text-xs text-muted-foreground">Loading notification controls…</div>;

  const patch = async (key: keyof FlowNotificationPreferences, value: boolean | string) => {
    const next = await saveFlowNotificationPreferences({ [key]: value } as Partial<FlowNotificationPreferences>);
    setPrefs(next);
  };

  const setEnabled = async (enabled: boolean) => {
    const next = await saveFlowNotificationPreferences({ enabled });
    setPrefs(next);
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-2xl bg-surface-2/50 border border-border overflow-hidden">
        <div className={row}>
          <ToggleRow label="All notifications" description="Master switch for StoreFlow background notifications." checked={prefs.enabled} onChange={setEnabled} />
        </div>
        <div className={row}>
          <ToggleRow label="Order notifications" description="New customer orders and important order updates." checked={prefs.orders} onChange={v => patch('orders', v)} />
        </div>
        <div className={row}>
          <ToggleRow label="Flow check-ins" description="Personalized questions and reminders from Flow." checked={prefs.flowCheckins} onChange={v => patch('flowCheckins', v)} />
        </div>
        <div className={row}>
          <ToggleRow label="Business insights" description="Low stock, sales trends and opportunities worth noticing." checked={prefs.businessInsights} onChange={v => patch('businessInsights', v)} />
        </div>
        <div className={row}>
          <ToggleRow label="Debt reminders" description="Useful reminders about outstanding customer balances." checked={prefs.debtReminders} onChange={v => patch('debtReminders', v)} />
        </div>
        <div className={row}>
          <ToggleRow label="Notification sounds" description="Allow sound and vibration where the device supports it." checked={prefs.sounds} onChange={v => patch('sounds', v)} />
        </div>
        <div className={row}>
          <ToggleRow label="Critical alerts" description="Allow important order alerts to bypass quiet hours." checked={prefs.criticalAlerts} onChange={v => patch('criticalAlerts', v)} />
        </div>
      </div>

      <div className="rounded-2xl bg-surface-2/50 border border-border px-4 py-1">
        <ToggleRow label="Quiet hours" description="Silence normal notifications during your chosen hours." checked={prefs.quietHoursEnabled} onChange={v => patch('quietHoursEnabled', v)} />
        {prefs.quietHoursEnabled && (
          <div className="grid grid-cols-2 gap-3 pb-4">
            <label className="text-xs text-muted-foreground">From
              <input type="time" value={prefs.quietStart} onChange={async e => { const next = await saveFlowNotificationPreferences({ quietStart: e.target.value }); setPrefs(next); }} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </label>
            <label className="text-xs text-muted-foreground">Until
              <input type="time" value={prefs.quietEnd} onChange={async e => { const next = await saveFlowNotificationPreferences({ quietEnd: e.target.value }); setPrefs(next); }} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </label>
          </div>
        )}
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">These preferences are stored on this device and shared with the StoreFlow Service Worker, so they continue to apply when the PWA is closed.</p>
    </div>
  );
}
