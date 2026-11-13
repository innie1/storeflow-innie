import { card, SubPage } from '../ui';
import type { SettingsState } from '../useSettings';

export default function ActivityLogView({ s }: { s: SettingsState }) {
  const { store, setView } = s;
  const logs = store.activityLogs || [];
  return (
    <SubPage title="Audit Activity Logs" subtitle="Secure tracking logs of actions performed in this store" onBack={() => setView('home')}>
      <div className={`${card} p-5 space-y-4`}>
        <h3 className="font-display font-bold text-base text-foreground">Action History</h3>
        {logs.length === 0 ? (
          <div className="text-center py-10 bg-card/30 rounded-2xl border border-dashed border-border/80">
            <p className="text-muted-foreground text-xs">No activity logs recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1 no-scrollbar text-left">
            {logs.map((log) => (
              <div key={log.id} className="p-4 rounded-xl bg-background border border-border flex flex-col gap-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h4 className="font-display font-bold text-sm text-foreground">{log.user}</h4>
                    <span className="inline-block px-1.5 py-0.5 rounded bg-surface-2 border border-border/85 text-[8px] font-bold text-yellow-500 uppercase mt-1">
                      {log.role}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-normal font-sans bg-surface-2/40 p-2.5 rounded-lg border border-border/30">
                  {log.action}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </SubPage>
  );
}
