import { createPortal } from 'react-dom';
import { saveStore } from '@/lib/store-data';
import PerformanceCalendar from '@/components/PerformanceCalendar';
import { showToast } from '@/components/Toast';
import Mascot, { MascotBadge } from '@/components/Mascot';
import NotificationDrawer from '@/components/NotificationDrawer';
import AutoFixConfirmDialog from '@/components/AutoFixConfirmDialog';
import PurchaseOrdersList from '@/components/PurchaseOrdersList';
import MerchantRatings from '@/components/MerchantRatings';
import FlowChat from '@/components/FlowChat';
import PredictionHistory from '@/components/PredictionHistory';
import HealthBreakdownModal from './manager/HealthBreakdownModal';
import { Typewriter } from './manager/Typewriter';
import { ManagerProps } from './manager/model';
import { useManager } from './manager/useManager';
import OverviewTab from './manager/OverviewTab';
import PredictionsTab from './manager/PredictionsTab';
import AnalysisTab from './manager/AnalysisTab';
import AdviceTab from './manager/AdviceTab';

// ─── Main Manager ─────────────────────────────────────────────────────────────
export default function Manager(props: ManagerProps) {
  const s = useManager(props);
  const {
    store, orders, onUpdate, onEnable, onNavigate, tab, setTab, showBreakdown, setShowBreakdown,
    showPerformanceCalendar, setShowPerformanceCalendar, showNotifications, setShowNotifications,
    chatOpen, setChatOpen, poListOpen, setPoListOpen, ratingsOpen, setRatingsOpen,
    predictionHistoryOpen, setPredictionHistoryOpen, autoFixTarget, setAutoFixTarget, autoFixBusy,
    greeting, tabBarRef, settings, flowMood, today, handleAutoFixConfirmed, tabs,
  } = s;

  if (!settings.enabled) {
    const enable = () => {
      const updated = { ...store, managerSettings: { ...settings, enabled: true } };
      saveStore(updated); onUpdate(updated);
      showToast('Flow activated');
      onEnable?.();
    };
    return (
      <div className="animate-fade-in space-y-4">
        <div className="p-6 rounded-2xl bg-card shadow-card text-center space-y-4">
          <div className="flex justify-center"><Mascot size={120} mood="sleeping" store={store} /></div>
          <MascotBadge on={false} />
          <h2 className="font-display font-bold text-xl text-foreground">Flow is sleeping</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">Wake Flow for insights, forecasts and savings plans.</p>
          <ul className="text-left text-sm text-muted-foreground max-w-xs mx-auto space-y-1.5">
            {['Business Insights', 'Revenue Forecasts', 'Expense Analysis', 'Product Suggestions', 'Savings Plans', 'FLOW Rewards'].map(x => (
              <li key={x} className="flex items-center gap-2"><span className="text-success">✓</span>{x}</li>
            ))}
          </ul>
          <button onClick={enable} className="w-full max-w-xs mx-auto p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity">Activate Flow</button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flow-card-enter-anim space-y-4">
      <style>{`
        @keyframes flow-card-enter {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes bar-grow-wave {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        @keyframes bar-breathe {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 2px rgba(232, 195, 78, 0.2)); }
          50% { transform: scale(1.04); filter: drop-shadow(0 0 8px rgba(232, 195, 78, 0.5)); }
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
        @keyframes pulse-once {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes bar-glow-twice {
          0%, 100% { filter: drop-shadow(0 0 0px transparent); }
          50% { filter: drop-shadow(0 0 8px rgba(232, 195, 78, 0.6)); }
        }
        @keyframes pulse-opacity-twice {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .flow-card-enter-anim {
          animation: flow-card-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .bar-grow-wave-item {
          transform-origin: bottom;
          animation: bar-grow-wave 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .bar-breathe-anim {
          transform-origin: bottom;
          animation: bar-grow-wave 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards, bar-glow-twice 2s ease-in-out 2 forwards;
          border: 1px solid rgba(232, 195, 78, 0.4);
        }
        .pulse-twice-anim {
          animation: pulse-opacity-twice 1s ease-in-out 2;
        }
        .pulse-once-anim {
          animation: pulse-once 0.35s ease-out;
        }
      `}</style>
      {/* Hero */}
      <div className="relative pt-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-bold text-2xl truncate">{store.storeName}</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/15 text-success text-[10px] font-display font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />Active
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Today, {today}</p>
            {/* Flow greeting */}
            <div className="mt-1.5 inline-flex items-center px-2.5 py-1 rounded-lg bg-primary/5 border border-primary/15 max-w-full">
              <p className="text-[11px] font-medium text-foreground/90 leading-snug">
                <Typewriter text={greeting} />
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            <Mascot size={72} mood={flowMood} animate={settings.mascotAnimations !== false} store={store} />
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div ref={tabBarRef} className="flex gap-1 p-1 rounded-full bg-card border border-border">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative flex-1 px-2 py-2 rounded-full text-[11px] font-display font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
            {t.label}
            {t.badge ? <span className="ml-1 inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full bg-destructive text-white text-[8px] font-bold">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && <OverviewTab s={s} />}

      {/* ─── PREDICTIONS ──────────────────────────────────────────────────── */}
      {tab === 'predictions' && <PredictionsTab s={s} />}

      {/* ─── ANALYSIS ─────────────────────────────────────────────────────── */}
      {tab === 'analysis' && <AnalysisTab s={s} />}

      {/* ─── ADVICE ───────────────────────────────────────────────────────── */}
      {tab === 'advice' && <AdviceTab s={s} />}

      {/* Modals */}
      {showBreakdown && createPortal(
        <HealthBreakdownModal store={store} onClose={() => setShowBreakdown(false)} />,
        document.body
      )}
      {showPerformanceCalendar && createPortal(
        <PerformanceCalendar store={store} onClose={() => setShowPerformanceCalendar(false)} />,
        document.body
      )}
      {showNotifications && createPortal(
        <NotificationDrawer
          store={store}
          onClose={() => setShowNotifications(false)}
          onUpdate={onUpdate}
          onNavigate={onNavigate}
        />,
        document.body
      )}
      {chatOpen && createPortal(
        <FlowChat
          store={store}
          orders={orders}
          onClose={() => setChatOpen(false)}
          onNavigate={onNavigate}
          onUpdate={onUpdate}
        />,
        document.body
      )}
      {poListOpen && createPortal(
        <PurchaseOrdersList store={store} onClose={() => setPoListOpen(false)} onUpdate={onUpdate} />,
        document.body
      )}
      {ratingsOpen && createPortal(
        <MerchantRatings store={store} onClose={() => setRatingsOpen(false)} />,
        document.body
      )}
      {predictionHistoryOpen && createPortal(
        <PredictionHistory store={store} onClose={() => setPredictionHistoryOpen(false)} />,
        document.body
      )}
      {autoFixTarget && createPortal(
        <AutoFixConfirmDialog
          spec={autoFixTarget}
          busy={autoFixBusy}
          onCancel={() => (autoFixBusy ? null : setAutoFixTarget(null))}
          onConfirm={handleAutoFixConfirmed}
        />,
        document.body
      )}
    </div>
  );
}
