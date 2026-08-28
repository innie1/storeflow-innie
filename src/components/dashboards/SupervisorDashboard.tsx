import { useMemo } from 'react';
import { StoreData } from '@/types/store';
import { healthScore } from '@/lib/manager-intel';
import { Users, Calendar, Sparkles, Shield, Heart } from 'lucide-react';
import Mascot from '@/components/Mascot';

interface SupervisorDashboardProps {
  store: StoreData;
  onNavigate: (tab: any, lowStock?: boolean) => void;
}

export default function SupervisorDashboard({ store, onNavigate }: SupervisorDashboardProps) {
  const health = healthScore(store);
  const activeShift = useMemo(() => {
    return (store.shifts || []).find(sh => !sh.endTime);
  }, [store.shifts]);

  const completedShifts = useMemo(() => {
    return (store.shifts || []).filter(sh => !!sh.endTime).slice(0, 5);
  }, [store.shifts]);

  const notifications = useMemo(() => {
    return (store.flowNotifications || []).slice(0, 5);
  }, [store.flowNotifications]);

  const healthTone =
    health.overall >= 80
      ? 'hsl(var(--success))'
      : health.overall >= 60
      ? 'hsl(var(--primary))'
      : health.overall >= 40
      ? 'hsl(var(--warning))'
      : 'hsl(var(--destructive))';
  const healthSize = 80;
  const healthR = (healthSize - 8) / 2;
  const healthC = 2 * Math.PI * healthR;
  const healthDash = (Math.min(100, health.overall) / 100) * healthC;

  return (
    <div className="animate-fade-in space-y-6 text-left">
      {/* Mascot Header */}
      <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-card border border-border/40 shadow-card">
        <Mascot size={48} mood="happy" store={store} />
        <div>
          <h2 className="font-display font-bold text-lg text-foreground">Supervisor Hub</h2>
          <p className="text-xs text-muted-foreground">Monitor cashier shifts, audit employee hours, and review operational alerts.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Store Health */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card flex flex-col justify-between items-center text-center">
          <div>
            <p className="text-xs text-muted-foreground font-display font-semibold uppercase tracking-wider">Store Health Index</p>
            <p className="font-display font-bold text-2xl text-foreground mt-1">
              {health.overall}
              <span className="text-sm text-muted-foreground">/100</span>
            </p>
          </div>
          <div className="my-3">
            <svg width={healthSize} height={healthSize} viewBox={`0 0 ${healthSize} ${healthSize}`} className="-rotate-90">
              <circle cx={healthSize / 2} cy={healthSize / 2} r={healthR} stroke="hsl(var(--surface-2))" strokeWidth={8} fill="none" />
              <circle
                cx={healthSize / 2}
                cy={healthSize / 2}
                r={healthR}
                stroke={healthTone}
                strokeWidth={8}
                fill="none"
                strokeDasharray={`${healthDash} ${healthC}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 800ms ease-out' }}
              />
            </svg>
          </div>
          <p className="text-[11px] text-muted-foreground">{health.label}</p>
        </div>

        {/* Current Active Shift */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card flex flex-col justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-display font-semibold uppercase tracking-wider mb-2">Active Shift Status</p>
            {activeShift ? (
              <div className="space-y-1.5 mt-2">
                <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
                  {activeShift.staffName}
                </p>
                <p className="text-xs text-muted-foreground font-mono">Started: {new Date(activeShift.startTime).toLocaleTimeString()}</p>
                <p className="text-xs text-muted-foreground font-mono">Opening Float: ₦{activeShift.openingCash.toLocaleString()}</p>
              </div>
            ) : (
              <div className="py-4 text-center text-muted-foreground text-xs">No active staff shift running.</div>
            )}
          </div>
          <button
            onClick={() => onNavigate('staff')}
            className="w-full mt-4 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-xs font-display font-semibold text-foreground cursor-pointer transition-colors"
          >
            Manage Shifts & Staff →
          </button>
        </div>

        {/* Supervisor Actions */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card flex flex-col justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-display font-semibold uppercase tracking-wider mb-3">Supervisor Shortcuts</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onNavigate('staff')}
                className="p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/60 text-center text-[11px] font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-1"
              >
                <Users className="w-4 h-4 text-primary" />
                <span>Shift Controller</span>
              </button>
              <button
                onClick={() => onNavigate('cash-drawer')}
                className="p-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border/60 text-center text-[11px] font-display font-bold text-foreground cursor-pointer flex flex-col items-center gap-1"
              >
                <span className="text-xs">💵</span>
                <span>Cash Register</span>
              </button>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-surface-2 border border-border/40 text-[10px] text-muted-foreground flex gap-1.5 mt-4">
            <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Authorized to tally drawer counts & audit shifts.</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completed Shift Log */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card flex flex-col h-80">
          <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-primary" /> Completed Shift Tally
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar pr-1">
            {completedShifts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <p className="text-xs text-muted-foreground">No shift history found.</p>
              </div>
            ) : (
              completedShifts.map(sh => (
                <div key={sh.id} className="p-3 rounded-xl bg-surface-2/50 border border-border/30 flex justify-between items-center text-xs">
                  <div>
                    <p className="font-bold text-foreground">{sh.staffName}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">Ended: {new Date(sh.endTime!).toLocaleTimeString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary font-mono">₦{sh.closingCash?.toLocaleString() ?? 0}</p>
                    <p className="text-[9px] text-muted-foreground font-mono">Float: ₦{sh.openingCash.toLocaleString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Manager AI Alerts */}
        <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-card flex flex-col h-80">
          <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-yellow-500" /> Flow Alerts & Notices
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar pr-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Heart className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">No alerts active at this moment.</p>
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className="p-3 rounded-xl bg-surface-2/50 border border-border/30 flex items-start gap-2.5 text-xs text-left">
                  <span className="text-base shrink-0">{n.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground leading-normal">{n.text}</p>
                    <p className="text-[9px] text-muted-foreground mt-1 font-mono">{new Date(n.date).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
