import ToggleRow from '@/components/Toggle';
import Mascot from '@/components/Mascot';
import { speakAsFlow, type FlowVoiceGender } from '@/lib/flow-voice';
import { isServiceFirstBusiness } from '@/lib/business-runtime';
import { card, SubPage, SectionLabel } from '../ui';
import type { SettingsState } from '../useSettings';

export default function FlowView({ s }: { s: SettingsState }) {
  const {
    store, keepsStock, setView, targetMode, targetPeriod, targetAmountInput, saveTarget, mgr,
    persist, setPricingModes, updateMgr, toggleSavings,
  } = s;
  return (
    <SubPage title="Flow Settings" onBack={() => setView('home')}>
      {/* Master toggle */}
      <div className={`${card} px-4 divide-y divide-border`}>
        <ToggleRow label="Enable Flow" description="Master switch — turn on for insights, forecasts and advice." checked={mgr.enabled} onChange={v => updateMgr({ enabled: v })} />
      </div>

      {!mgr.enabled && (
        <div className="flex flex-col items-center justify-center py-16 px-4 space-y-5">
          <div className="flex justify-center items-center drop-shadow-[0_4px_12px_rgba(99,102,241,0.15)]">
            <Mascot size={140} mood="sleeping" animate={mgr.mascotAnimations} store={store} />
          </div>
          <div className="text-center space-y-1.5 max-w-xs">
            <p className="font-display font-bold text-base text-foreground">Flow is resting 💤</p>
            <p className="text-xs text-muted-foreground leading-normal">
              Flow is currently asleep. Toggle the switch above to wake him up and unlock forecasts, advice, and real-time business helpers.
            </p>
          </div>
        </div>
      )}

      {mgr.enabled && (
        <>
          {/* Forecasts */}
          <div className="px-1">
            <SectionLabel>Forecasts</SectionLabel>
          </div>
          <div className={`${card} px-4 divide-y divide-border`}>
            <ToggleRow label="Revenue Forecasts" checked={mgr.revenueForecasts} onChange={v => updateMgr({ revenueForecasts: v })} />
            <ToggleRow label="Profit Forecasts" checked={mgr.profitForecasts} onChange={v => updateMgr({ profitForecasts: v })} />
            {keepsStock && <ToggleRow label="Inventory Forecasts" checked={mgr.inventoryForecasts} onChange={v => updateMgr({ inventoryForecasts: v })} />}
            <ToggleRow label="Expense Analysis" checked={mgr.expenseAnalysis} onChange={v => updateMgr({ expenseAnalysis: v })} />
          </div>

          {/* Recommendations */}
          <div className="px-1">
            <SectionLabel>Recommendations</SectionLabel>
          </div>
          <div className={`${card} px-4 divide-y divide-border`}>
            <ToggleRow label="Smart Pricing" checked={mgr.smartPricing} onChange={v => updateMgr({ smartPricing: v })} />
            {/* What to stock next, which is not a question a laundry has. */}
            {keepsStock && <ToggleRow label="Product Suggestions" checked={mgr.productSuggestions} onChange={v => updateMgr({ productSuggestions: v })} />}
            <ToggleRow label="Business Advice" checked={mgr.businessAdvice} onChange={v => updateMgr({ businessAdvice: v })} />
            {/*
              A switch for a feature that does not exist is worse than no
              switch: it tells the shop the app can do something it cannot.
              There is no expansion advice to turn off, and answering questions
              about the business is what Flow chat is - switching that off
              would switch off the screen the merchant is standing on. Both
              come back if either becomes a real feature.
            */}
          </div>

          {/* Sales Target */}
          <div className="px-1">
            <SectionLabel>Sales Target</SectionLabel>
          </div>
          <div className={`${card} p-3.5 space-y-2.5`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-display font-semibold">Goal mode</p>
              <div className="flex gap-1 bg-surface-2 p-0.5 rounded-lg border border-border/60">
                <button
                  onClick={() => saveTarget({ mode: 'auto' })}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-display font-bold transition ${targetMode === 'auto' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  Auto
                </button>
                <button
                  onClick={() => saveTarget({ mode: 'manual' })}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-display font-bold transition ${targetMode === 'manual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  Manual
                </button>
              </div>
            </div>
            {targetMode === 'manual' && (
              <div className="flex gap-1.5">
                <div className="flex gap-1 bg-surface-2 p-0.5 rounded-lg border border-border/60 shrink-0">
                  {(['daily', 'weekly'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => saveTarget({ period: p })}
                      className={`px-2.5 py-1.5 rounded-md text-[10px] font-display font-bold capitalize transition ${targetPeriod === p ? 'bg-primary/15 text-primary' : 'text-muted-foreground'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={targetAmountInput}
                  onChange={e => saveTarget({ amount: e.target.value })}
                  placeholder={`₦ target per ${targetPeriod === 'daily' ? 'day' : 'week'}`}
                  className="flex-1 min-w-0 px-2.5 rounded-lg bg-surface-2 border border-border/60 text-xs focus:outline-none focus:border-primary"
                />
              </div>
            )}
          </div>

          {/* Tools */}
          <div className="px-1">
            <SectionLabel>Tools</SectionLabel>
          </div>
          <div className={`${card} px-4 divide-y divide-border`}>
            <ToggleRow label="Weekly Recaps" checked={mgr.weeklyRecap} onChange={v => updateMgr({ weeklyRecap: v })} />
            {/* Only where the card it switches exists - the same rule the Flow page uses. */}
            {!isServiceFirstBusiness(store) && <ToggleRow label="Customer Request Tracking" checked={mgr.customerRequests} onChange={v => updateMgr({ customerRequests: v })} />}
            <ToggleRow label="Savings Planner" checked={mgr.savingsPlanner} onChange={toggleSavings} />
            <ToggleRow
              label="Floating Flow Shortcut"
              description="Show the floating Flow message button. Tap to message Flow or hold for 3 seconds to speak."
              checked={(mgr as any).floatingFlowShortcutEnabled !== false}
              onChange={v => updateMgr({ floatingFlowShortcutEnabled: v } as any)}
            />
            <ToggleRow label="Voice Notes" checked={mgr.voiceFeatures} onChange={v => updateMgr({ voiceFeatures: v })} />
            <ToggleRow label="Auto-Listen on Sales" description="Mic starts automatically when you open the Sales page." checked={mgr.autoVoiceListen} onChange={v => updateMgr({ autoVoiceListen: v })} />
            <ToggleRow label="Auto Print Receipts" description="Automatically trigger receipt printing after recording a sale." checked={mgr.autoPrintReceipt} onChange={v => updateMgr({ autoPrintReceipt: v })} />
          </div>

          {/* Customer Pricing Mode */}
          <div className="px-1 mt-4">
            <SectionLabel>Customer Marketplace Settings</SectionLabel>
          </div>
          <div className={`${card} px-4 divide-y divide-border`}>
            {/* Two price tiers on the same item is a goods idea: a laundry has
                one price for a shirt, not a retail and a wholesale one. */}
            {keepsStock && <ToggleRow
              label="Enable Retail Pricing Mode"
              description="Allow customers to browse and purchase items at retail prices."
              checked={mgr.retailPricingEnabled !== false}
              onChange={v => setPricingModes(v, mgr.wholesalePricingEnabled !== false)}
            />}
            {keepsStock && <ToggleRow
              label="Enable Wholesale Pricing Mode"
              description="Allow customers to browse and purchase items at wholesale prices."
              checked={mgr.wholesalePricingEnabled !== false}
              onChange={v => setPricingModes(mgr.retailPricingEnabled !== false, v)}
            />}
            <ToggleRow
              label="Order Alert Sound Notifications"
              description="Play a synthesized alert chime whenever a customer order is received."
              checked={mgr.orderAlertSoundsEnabled !== false && store.marketplaceSettings?.alertSound !== false}
              onChange={v => {
                // Marketplace Settings has its own switch for the same chime
                // and writes both keys. This one wrote only its own, so the
                // two screens could disagree about whether sound was on.
                updateMgr({ orderAlertSoundsEnabled: v });
                persist({ marketplaceSettings: { ...(store.marketplaceSettings || {}), alertSound: v } as any });
              }}
            />
          </div>

          {/* Flow Speech Voice Selection */}
          <div className="px-1 mt-4">
            <SectionLabel>Flow Speech Voice</SectionLabel>
          </div>
          <div className={`${card} p-4 space-y-3`}>
            <div>
              <p className="text-sm font-display font-semibold text-foreground">Voice Preference</p>
              <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">
                Choose the preferred voice style for Flow's spoken advice.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { id: 'young-male' as const, label: 'Younger Male Voice 👦 (Default)', desc: 'Bright, energetic, and highly engaging' },
                { id: 'male' as const, label: 'Male Voice 👨', desc: 'Deconstructive, deep, and professional' },
                { id: 'female' as const, label: 'Female Voice 👩', desc: 'Warm, natural, and welcoming' }
              ].map(voiceOpt => {
                const isSelected = (mgr.voiceGender || 'young-male') === voiceOpt.id;
                return (
                  <button
                    key={voiceOpt.id}
                    onClick={() => {
                      updateMgr({ voiceGender: voiceOpt.id });

                      // Speak a small preview using standard SpeechSynthesis with selected voice characteristics
                      // Previews through the same picker the app speaks
                      // with, so what is demoed here is what is heard.
                      const previewText = voiceOpt.id === 'young-male' ? "Hi, I am Flow! Ready to scale your store?" :
                                          voiceOpt.id === 'male' ? "Hello. I am Flow, your business manager companion." :
                                          "Hi there, I am Flow! Let's make some sales today.";
                      // Forced: choosing a voice has to let you hear it, even with voice off.
                      speakAsFlow(previewText, { gender: voiceOpt.id as FlowVoiceGender, force: true });
                    }}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/30'
                        : 'bg-surface-2 border-border hover:border-border-hover'
                    }`}
                  >
                    <div>
                      <p className="font-display font-bold text-xs text-foreground">{voiceOpt.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{voiceOpt.desc}</p>
                    </div>
                    <span className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center shrink-0 ml-3 ${
                      isSelected
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/35'
                    }`}>
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Graph Settings */}
          <div className="px-1 mt-4">
            <SectionLabel>Active Periods Graph</SectionLabel>
          </div>
          <div className={`${card} p-4 space-y-3`}>
            <div>
              <p className="text-sm font-display font-semibold">Graph Interval</p>
              <p className="text-[11px] text-muted-foreground">Select the bucket time interval for the active periods chart.</p>
            </div>
            <div className="flex gap-2">
              {([10, 30, 60] as const).map(interval => (
                <button key={interval} onClick={() => updateMgr({ graphInterval: interval })}
                  className={`flex-1 py-2 rounded-lg text-xs font-display font-bold border transition-colors ${mgr.graphInterval === interval ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 border-border text-muted-foreground'}`}>
                  {interval === 60 ? '1 Hour' : `${interval} Mins`}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </SubPage>
  );
}
