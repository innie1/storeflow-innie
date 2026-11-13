import { useState, useMemo, useEffect, useRef } from 'react';
import { allowedNotifications } from '@/lib/notification-gate';
import { SPOTLIGHT_SIGNAL } from '@/lib/spotlight';
import { BREAK_EVEN_SPOTLIGHT } from '@/components/BreakEvenCard';
import { CustomerRequest, DEFAULT_MANAGER_SETTINGS, AutoPriceEvent } from '@/types/store';
import { saveStore, updateProduct, generateId } from '@/lib/store-data';
import {
  healthScore,
  forecastHorizon,
  generateRecommendations,
  generateInsights,
  generateAdvice,
  topCustomerRequests,
  pricingAlerts,
  flowGreeting,
  generateNotifications,
  buildFlowReport,
  type FlowReport,
  filterDismissedAdvice,
  dismissAdvice,
  markAdviceHelpful,
} from '@/lib/manager-intel';
import { recordStreak, addFlowReward, hydrateFlowMemoryFromCloud } from '@/lib/flow-memory';
import { showToast } from '@/components/Toast';
import { executeAutoFix, AutoFixSpec } from '@/lib/auto-fix';
import { logPrediction, submitPredictionFeedback } from '@/lib/prediction-log';
import { ManagerProps, ManagerTab } from './model';
import type { MascotMood } from '@/components/Mascot';

/**
 * Everything the Flow screen works out about the shop - health, forecasts,
 * advice, analysis - and the state of its tabs and sheets.
 *
 * Manager lays the screen out; each tab is its own part in this folder,
 * reading what it needs from the object this returns.
 */
export function useManager(props: ManagerProps) {
  const { store, orders = [], onUpdate, onEnable, onNavigate } = props;
  const [tab, setTab] = useState<ManagerTab>('overview');
  const [requestText, setRequestText] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showPerformanceCalendar, setShowPerformanceCalendar] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => {
    const openMessages = (event?: Event) => {
      let startVoice = Boolean((event as CustomEvent<{ startVoice?: boolean }>)?.detail?.startVoice);
      try { const pending = sessionStorage.getItem('storeflow_open_flow_messages'); if (pending) { startVoice = startVoice || pending === 'voice'; sessionStorage.removeItem('storeflow_open_flow_messages'); } } catch {}
      setChatOpen(true);
      if (startVoice) window.setTimeout(() => window.dispatchEvent(new CustomEvent('storeflow:start-flow-voice')), 250);
    };
    window.addEventListener('storeflow:open-flow-messages', openMessages);
    let pending = false; try { pending = Boolean(sessionStorage.getItem('storeflow_open_flow_messages')); } catch {}
    if (pending) openMessages();
    return () => window.removeEventListener('storeflow:open-flow-messages', openMessages);
  }, []);
  const [poListOpen, setPoListOpen] = useState(false);
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [predictionHistoryOpen, setPredictionHistoryOpen] = useState(false);
  const [forecastFeedback, setForecastFeedback] = useState<Record<number, 'correct' | 'incorrect'>>({});
  const handleForecastFeedback = (horizonDays: number, feedback: 'correct' | 'incorrect') => {
    setForecastFeedback(prev => ({ ...prev, [horizonDays]: feedback }));
    submitPredictionFeedback(store, horizonDays, feedback).then(ok => {
      if (ok) showToast(feedback === 'correct' ? 'Thanks — noted as correct 👍' : 'Thanks — noted as incorrect, Flow will learn from this', 'success');
    });
  };
  const [autoFixTarget, setAutoFixTarget] = useState<AutoFixSpec | null>(null);
  const [autoFixBusy, setAutoFixBusy] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [greeting] = useState(() => flowGreeting(store));
  const [seenAdviceIds, setSeenAdviceIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('storeflow_seen_advice_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    const storeId = (store as any)?.id;
    if (storeId) {
      hydrateFlowMemoryFromCloud(storeId);
    }
  }, [(store as any)?.id]);
  useEffect(() => {
    if (tab === 'advice') {
      const currentIds = generateAdvice(store, orders).map(a => a.id);
      const updatedSet = new Set(currentIds);
      setSeenAdviceIds(updatedSet);
      localStorage.setItem('storeflow_seen_advice_ids', JSON.stringify(Array.from(updatedSet)));
    }
  }, [tab, store]);
  /*
   * Keep the tabs under the finger when they are tapped.
   *
   * This used to be window.scrollTo(0, 0) on every tab change, which yanks the
   * page to the very top - so the row of tabs the merchant had just tapped
   * shot away upwards and the screen appeared to jump for no reason. Tapping
   * "Forecasts" should change what is under the tabs, not move the tabs.
   *
   * So: if the tab bar has scrolled off the top, bring it back to the top and
   * leave it there. If it is already in view, do nothing at all - there is
   * nothing to correct, and scrolling anyway is the jump being complained
   * about.
   */
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const top = bar.getBoundingClientRect().top;
    if (top >= 0) return;
    window.scrollBy({ top, behavior: 'auto' });
  }, [tab]);
  /*
   * The month ring on the home screen sends people to the break-even figures,
   * which live on Overview. This screen stays mounted with whatever tab was
   * last open, so somebody who had been reading Forecasts arrived there
   * instead and saw nothing of what they tapped.
   */
  useEffect(() => {
    const onSpotlight = (event: Event) => {
      if ((event as CustomEvent<string>).detail === BREAK_EVEN_SPOTLIGHT) setTab('overview');
    };
    window.addEventListener(SPOTLIGHT_SIGNAL, onSpotlight);
    return () => window.removeEventListener(SPOTLIGHT_SIGNAL, onSpotlight);
  }, []);
  const settings = store.managerSettings || DEFAULT_MANAGER_SETTINGS;
  // Record streak + FLOW on mount (once per day, rate-limited by recordStreak itself)
  useEffect(() => {
    if (!settings.enabled) return;
    const { isNew } = recordStreak();
    if (isNew) {
      try {
        addFlowReward(1.0, 'streak', 'Daily streak bonus');
        if (store.sales.some(s => s.date.startsWith(new Date().toISOString().split('T')[0]))) {
          addFlowReward(0.5, 'daily', 'First sale of the day bonus');
        }
      } catch (e) {
        // Cooldown or anti-cheat triggered
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled]);
  // Auto-generate and save notifications. This previously shared an effect
  // with the streak logic above, gated only on [settings.enabled] — meaning
  // new critical issues (stock selling out, expenses spiking) only got
  // checked once when Manager first mounted, not while the merchant was
  // actively using the app during that session. This now reacts to the
  // data that actually drives notifications. The dedup-by-id check below
  // means this safely settles after one extra pass rather than looping.
  useEffect(() => {
    if (!settings.enabled) return;
    const newNotes = generateNotifications(store);
    const existing = store.flowNotifications || [];
    const existingIds = new Set(existing.map(n => n.id));
    const liveIds = new Set(newNotes.map(n => n.id));
    const fresh = newNotes.filter(n => !existingIds.has(n.id));

    // A notification the merchant has dealt with, whose condition has since
    // cleared, is finished with. Dropping it frees its id: alerts are
    // deduplicated by id, and ids are stable per product, so keeping a read one
    // forever meant the same product running low again months later could never
    // raise an alert. Unread ones are always kept — they are still waiting.
    const kept = existing.filter(n => !n.read || liveIds.has(n.id));

    if (fresh.length > 0 || kept.length !== existing.length) {
      // Gated as they arrive rather than hidden afterwards: a notification
      // that exists but is not shown still buzzes a phone.
      const updated = { ...store, flowNotifications: [...allowedNotifications(store, fresh), ...kept].slice(0, 50) };
      saveStore(updated); onUpdate(updated);
    }
  }, [settings.enabled, store.sales.length, store.products, store.expenses?.length, store.customerRequests?.length]);
  const insights = generateInsights(store, '7d');
  const recs = generateRecommendations(store).filter(r => r.action !== 'restock' || settings.restockSuggestions);
  const requests = topCustomerRequests(store, 6);
  const savings = store.savingsGoal;
  const unreadCount = (store.flowNotifications || []).filter(n => !n.read).length;
  const flowMood = useMemo((): MascotMood => {
    const health = healthScore(store);

    // Auto-sleep past 9 PM or before 6 AM
    const currentHour = new Date().getHours();
    const isSleepTime = currentHour >= 21 || currentHour < 6;
    if (isSleepTime) return 'sleeping';

    const activeProducts = store.products.filter(p => !p.discontinued);
    const hasLowStock = activeProducts.some(p => p.quantity <= 3);
    const hasDebt = (store.pendingPayments || []).some(p => p.status === 'pending');
    const isGoalAchieved = savings && savings.saved >= savings.amount && savings.amount > 0;

    if (isGoalAchieved) return 'celebrating';

    // Performance checks
    if (health.overall >= 80) return 'confident';
    if (health.overall >= 65) return 'happy';

    // Open but not performing well: resting
    if (health.overall >= 45 && health.overall < 65) return 'resting';

    if (hasLowStock || hasDebt) return 'concerned';
    if (health.overall < 45 && health.overall >= 25) return 'worried';
    if (health.overall < 25) return 'angry';

    return 'neutral';
  }, [store, savings]);
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  // Forecasts for Predictions tab
  const horizons = [1, 7, 14, 30, 90, 180, 365];
  const [forecastHorizonDays, setForecastHorizonDays] = useState(7);
  useEffect(() => {
    if (tab !== 'predictions') return;
    if (!settings.revenueForecasts && !settings.profitForecasts) return;
    horizons.forEach(h => {
      logPrediction(store, forecastHorizon(store, h));
    });
    // Deliberately store/settings omitted — this should log once per tab
    // visit, not re-fire on every store update while the tab stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const addRequest = () => {
    const text = requestText.trim();
    if (!text) return;
    const req: CustomerRequest = { id: Math.random().toString(36).slice(2), text, date: new Date().toISOString() };
    const updated = { ...store, customerRequests: [req, ...(store.customerRequests || [])] };
    saveStore(updated); onUpdate(updated);
    setRequestText('');
    showToast('Request recorded');
    try {
      addFlowReward(0.2, 'event', 'Recorded customer request');
    } catch {}
  };
  const [adviceReport, setAdviceReport] = useState<FlowReport | null>(null);
  const [adviceReportVisible, setAdviceReportVisible] = useState(false);
  const [showMoreInsights, setShowMoreInsights] = useState(false);
  const handleGetAdvice = () => {
    try {
      addFlowReward(0.5, 'event', 'Requested business advice report');
    } catch {}
    // buildFlowReport reads the store that is already in memory, so there is
    // nothing to wait for and nothing to defer to.
    //
    // This briefly went through requestAnimationFrame, to let the button paint
    // a loading state first. rAF does not fire while the page is hidden — a
    // backgrounded tab, the PWA behind the launcher, the screen off — so the
    // callback could simply never run and the button did nothing at all.
    // Deferring work that is already synchronous only ever added ways to fail.
    setAdviceLoading(false);
    setAdviceReport(buildFlowReport(store));
    setAdviceReportVisible(true);
  };
  const handleAutoFixConfirmed = async () => {
    if (!autoFixTarget) return;
    setAutoFixBusy(true);
    const minVisible = new Promise(resolve => setTimeout(resolve, 850));
    const [result] = await Promise.all([
      executeAutoFix(store, autoFixTarget, onUpdate),
      minVisible,
    ]);
    setAutoFixBusy(false);
    setAutoFixTarget(null);
    showToast(result.message, result.ok ? 'success' : 'error');
  };
  const tabs: { id: ManagerTab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'predictions', label: 'Forecasts' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'advice', label: 'Advice', badge: settings.businessAdvice ? (generateAdvice(store, orders).filter(a => (a.priority === 'critical' || a.priority === 'high') && !seenAdviceIds.has(a.id)).length || undefined) : undefined },
  ];
  const advice = settings.businessAdvice ? filterDismissedAdvice(generateAdvice(store, orders)) : [];
  const [justDismissed, setJustDismissed] = useState<Set<string>>(new Set());
  const visibleAdvice = advice.filter(a => !justDismissed.has(a.id));
  const handleDismissAdvice = (id: string) => {
    dismissAdvice(id);
    setJustDismissed(prev => new Set(prev).add(id));
  };
  const handleHelpfulAdvice = (id: string) => {
    markAdviceHelpful(id);
    showToast('Thanks — good to know 👍', 'success');
  };
  const [pendingPriceAccept, setPendingPriceAccept] = useState<string | null>(null);
  // Auto-Apply Prices — only runs when the toggle is on, and only touches
  // suggestions within the owner's configured ₦ safety cap. Anything bigger
  // always falls through to the manual Accept flow below instead.
  useEffect(() => {
    if (!settings.autoApplyPrices) return;
    const targetMarginPct = (settings.defaultMargin || 25) / 100;
    const maxChange = settings.autoApplyMaxChangeAmount ?? 200;
    const alerts = pricingAlerts(store, targetMarginPct);
    const toApply = alerts.filter(a => Math.abs(a.suggestedPrice - a.product.sellingPrice) <= maxChange);
    if (toApply.length === 0) return;

    let updated = store;
    const events: AutoPriceEvent[] = [];
    toApply.forEach(a => {
      events.push({
        id: generateId(),
        productId: a.product.id,
        productName: a.product.name,
        oldPrice: a.product.sellingPrice,
        newPrice: a.suggestedPrice,
        costPrice: a.product.costPrice,
        date: new Date().toISOString(),
      });
      updated = updateProduct(updated, a.product.id, { sellingPrice: a.suggestedPrice });
    });
    updated = { ...updated, autoPriceLog: [...events, ...(updated.autoPriceLog || [])].slice(0, 50) };
    saveStore(updated);
    onUpdate(updated);
    showToast(`Auto-applied ${toApply.length} price update${toApply.length > 1 ? 's' : ''} (within your ₦${maxChange} limit)`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoApplyPrices, settings.defaultMargin, settings.autoApplyMaxChangeAmount, store.products]);
  /** Horizon names, shared by the picker and the forecast itself. */
const FORECAST_LABELS: Record<number, string> = {
  1: 'Tomorrow', 7: '7 days', 14: '14 days', 30: '1 month',
  90: '3 months', 180: '6 months', 365: '1 year',
};
const advicePriorityColor: Record<string, string> = { critical: 'border-destructive/40 bg-destructive/5', high: 'border-warning/40 bg-warning/5', medium: 'border-primary/20 bg-surface-2', low: 'border-border bg-surface-2' };
  const adviceIconBg: Record<string, string> = { critical: 'bg-destructive/10', high: 'bg-warning/10', medium: 'bg-primary/10', low: 'bg-surface-3' };

  return {
    store,
    orders,
    onUpdate,
    onEnable,
    onNavigate,
    tab,
    setTab,
    requestText,
    setRequestText,
    showBreakdown,
    setShowBreakdown,
    showPerformanceCalendar,
    setShowPerformanceCalendar,
    showNotifications,
    setShowNotifications,
    adviceLoading,
    setAdviceLoading,
    chatOpen,
    setChatOpen,
    poListOpen,
    setPoListOpen,
    ratingsOpen,
    setRatingsOpen,
    predictionHistoryOpen,
    setPredictionHistoryOpen,
    forecastFeedback,
    setForecastFeedback,
    handleForecastFeedback,
    autoFixTarget,
    setAutoFixTarget,
    autoFixBusy,
    setAutoFixBusy,
    showArchive,
    setShowArchive,
    greeting,
    seenAdviceIds,
    setSeenAdviceIds,
    tabBarRef,
    settings,
    insights,
    recs,
    requests,
    savings,
    unreadCount,
    flowMood,
    today,
    horizons,
    forecastHorizonDays,
    setForecastHorizonDays,
    addRequest,
    adviceReport,
    setAdviceReport,
    adviceReportVisible,
    setAdviceReportVisible,
    showMoreInsights,
    setShowMoreInsights,
    handleGetAdvice,
    handleAutoFixConfirmed,
    tabs,
    advice,
    justDismissed,
    setJustDismissed,
    visibleAdvice,
    handleDismissAdvice,
    handleHelpfulAdvice,
    pendingPriceAccept,
    setPendingPriceAccept,
    FORECAST_LABELS,
    advicePriorityColor,
    adviceIconBg,
  };
}

export type ManagerState = ReturnType<typeof useManager>;
