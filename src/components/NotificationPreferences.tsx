import { useEffect, useState } from 'react';
import { getFlowNotificationPreferences, saveFlowNotificationPreferences, FlowNotificationPreferences } from '@/lib/notification-preferences';

const row = 'border-b border-border last:border-b-0';

function SettingToggle({ label, description, checked, onChange }: { label:string; description?:string; checked:boolean; onChange:(value:boolean)=>void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="w-full flex items-center justify-between gap-4 py-3 px-1 text-left">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-display font-semibold text-foreground leading-tight">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 pr-2">{description}</p>}
      </div>
      <div className={`shrink-0 relative w-12 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-success' : 'bg-border'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? 'translate-x-[26px]' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}

export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState<FlowNotificationPreferences | null>(null);
  useEffect(() => { getFlowNotificationPreferences().then(setPrefs); }, []);
  if (!prefs) return <div className="px-4 py-4 text-xs text-muted-foreground">Loading notification controls…</div>;

  const patch = async (key: keyof FlowNotificationPreferences, value: boolean | string) => {
    const next = await saveFlowNotificationPreferences({ [key]: value } as Partial<FlowNotificationPreferences>);
    setPrefs(next);
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-2xl bg-surface-2/50 border border-border overflow-hidden">
        <div className={row}><SettingToggle label="All notifications" description="Master switch for StoreFlow background notifications." checked={prefs.enabled} onChange={v => patch('enabled', v)} /></div>
        <div className={row}><SettingToggle label="Order notifications" description="New customer orders and important order updates." checked={prefs.orders} onChange={v => patch('orders', v)} /></div>
        <div className={row}><SettingToggle label="Flow check-ins" description="Personalized questions and reminders from Flow." checked={prefs.flowCheckins} onChange={v => patch('flowCheckins', v)} /></div>
        <div className={row}><SettingToggle label="Business insights" description="Low stock, sales trends and opportunities worth noticing." checked={prefs.businessInsights} onChange={v => patch('businessInsights', v)} /></div>
        <div className={row}><SettingToggle label="Debt reminders" description="Useful reminders about outstanding customer balances." checked={prefs.debtReminders} onChange={v => patch('debtReminders', v)} /></div>
        <div className={row}><SettingToggle label="Notification sounds" description="Allow sound and vibration where the device supports it." checked={prefs.sounds} onChange={v => patch('sounds', v)} /></div>
        <div className={row}><SettingToggle label="Critical alerts" description="Allow important order alerts to bypass quiet hours." checked={prefs.criticalAlerts} onChange={v => patch('criticalAlerts', v)} /></div>
      </div>
      <div className="rounded-2xl bg-surface-2/50 border border-border px-4 py-1">
        <SettingToggle label="Quiet hours" description="Silence normal notifications during your chosen hours." checked={prefs.quietHoursEnabled} onChange={v => patch('quietHoursEnabled', v)} />
        {prefs.quietHoursEnabled && <div className="grid grid-cols-2 gap-3 pb-4">
          <label className="text-xs text-muted-foreground">From<input type="time" value={prefs.quietStart} onChange={e => patch('quietStart', e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>
          <label className="text-xs text-muted-foreground">Until<input type="time" value={prefs.quietEnd} onChange={e => patch('quietEnd', e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>
        </div>}
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">Saved on this device, so alerts keep working when the app is closed.</p>
    </div>
  );
}
