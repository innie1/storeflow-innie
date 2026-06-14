
# StoreFlow V2 – Store Manager Update

This is a large multi-feature update. To keep quality high and avoid breaking existing flows (inventory, sales, expenses, ROI, games), I'll ship it in **phases** rather than one giant change. The existing dark/gold theme, navigation, and data model stay intact.

## Phase 1 — Navigation + Dashboard shell
- Bottom nav: `Dashboard | Inventory | Sales | Manager | More` (rename "AI" → "Manager", move Expenses/ROI/Settings under More).
- Dashboard header: "Good Evening, [Name]" + store name subtitle, notification bell.
- New top row: **Store Health (87/100 with progress ring)** + **Store Manager Active** card with rotating insights.
- Keep existing Revenue/Profit/Expenses mini-cards; add `+%` vs last 7 days.
- Add "Today Overview" strip (Sales / Orders / Low Stock / Customers) and "Top Selling Product" + "Today's Profit" cards.
- Count-up animations on money values.

## Phase 2 — Advanced graph
- Tabs: `7 Days | 1 Month | Lifetime` (default 7d, persisted in localStorage).
- Lines: Revenue, Profit, Expenses (+ optional dotted Forecast).
- Tap point → popup with date / revenue / profit / expenses / sales count.
- Lifetime view: horizontal scroll + pinch/drag zoom.

## Phase 3 — Manager page (replaces current AI tab)
Tabs: `Overview | Insights | Recommendations | Alerts`.
- **Store Health**: overall + sub-scores (Sales, Inventory, Expense, Profit).
- **Predictions**: 7d / 30d / 3mo / 6mo cards with expected revenue/profit/expenses + confidence.
- **Top Recommendations**: restock alerts, expense alerts, price opportunities.
- **Savings Plan**: goal, progress ring, weekly/monthly target, ETA.
- **Business Opportunities**: frequently requested products, fast movers.

## Phase 4 — Smart Pricing in Add Item
- After Cost Price, show 4 margin chips (20/30/40/50%) with computed selling price + profit.
- Default margin pulled from settings; tap to apply; auto-apply toggle.

## Phase 5 — Inventory card enhancements
- Each card shows: stock, cost price, selling price, profit/unit, forecast days remaining, status pill (Healthy/Low/Critical).
- Inline Manager recommendation line ("Restock 20 units").

## Phase 6 — Expense Intelligence
- On each expense entry, compare to historical average for that item.
- Show delta badge (+19%) and recommendation.
- New "Trends" view on Expenses page.

## Phase 7 — Customer Request Tracker
- Quick "Record Request" button on Manager page (text input; voice optional).
- Tally per product; surface top requested items as recommendations.

## Phase 8 — Voice Notes (optional, gated by browser support)
- Mic button on Manager page using Web Speech API.
- Auto-categorize notes (inventory / supplier / general).

## Phase 9 — Weekly Recap
- Swipeable 5-slide story (Revenue, Best Seller, Biggest Expense, Recommendations, Health Score).
- Share/export as image.

## Phase 10 — Settings: Store Manager section
- Master toggle + per-feature toggles (forecasts, smart pricing, voice, recap, request tracking).
- Pricing settings (default margin, auto-suggest, auto-apply).
- Savings settings (goal, save-from revenue/profit, percentage).

## Technical notes
- All data stays in localStorage via existing `store-data.ts` helpers; extend `StoreData` with `customerRequests`, `voiceNotes`, `managerSettings`, `savingsGoal`, `expenseHistory` references.
- New files: `src/components/Manager.tsx`, `src/components/manager/{Health,Predictions,Recommendations,SavingsPlan,Opportunities,WeeklyRecap,RequestTracker}.tsx`, `src/lib/manager-intel.ts` (health-score + forecast math), `src/lib/customer-requests.ts`.
- Forecasting: simple linear regression on last 30d daily totals; confidence = R² bucketed (High/Med/Low).
- No backend changes. No new dependencies beyond what's already installed (recharts, framer-motion already present? — will verify; add if missing).
- Games-category stores keep their specialized UI; Manager tab adapts to show game-relevant metrics.

## Suggested order of approval
I recommend I ship **Phases 1–3 first** (nav, dashboard, Manager page) in one pass since they're tightly coupled and give the biggest visible change. Then 4–5, then 6–10. Confirm and I'll start with Phase 1–3.
