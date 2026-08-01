# Changelog

[2026-07-26] v0.1.0 — Simple Mode: shop-type onboarding, animated processing screen, offline queue banner, cost price prompt, new-user default flipped to Simple Mode — no severity (feature build)
[2026-07-26] v0.1.1 — Fixed onboarding wrongly triggering for existing stores + added progress bar to onboarding — 🟠 High fixed
[2026-07-26] v0.1.2 — Added 3x3 quick-sell tile grid to Simple Mode Home (onboarding top products + best-sellers) — feature
[2026-07-26] v0.1.3 — Voice matching: phonetic fuzzy matching (gary/garri, maggie/maggi), typed correction + new-product creation when nothing matches, learned voice aliases remembered per product — feature/improvement
[2026-07-26] v0.1.4 — Retry now re-opens the mic directly instead of going idle; unmatched voice sales auto-prompt an Add Product popup (name/selling price/cost price/quantity); fixed longer phrases (e.g. "light bulb") not matching shorter product names (e.g. "Bulb") — improvement
[2026-07-26] v0.1.5 — Added today's profit next to sale count under the revenue figure on Simple Mode Home — feature
[2026-07-26] v0.1.6 — Account entry flow: merged 3 top-level options down to 2 (Create / Access), each now offers Access Code or Email as a nested choice; added 3-step progress bar to Create New Store flow — improvement (Google sign-in intentionally deferred, needs OAuth credentials first)
[2026-07-26] v0.1.7 — Added "Skip for now" on step 2 of Create Store, random default logo instead of always Minimalist, removed all auto-imported starter products (new stores now start empty) — feature/improvement
[2026-07-26] v0.1.8 — Added voice input to Top 5 Products Setup in Simple Mode onboarding — feature
[2026-07-26] v0.1.9 — Merge Similar Products: fixed a false-positive bug (short generic names like "Milk" auto-matching long unrelated names), fixed a false-negative bug (plural mismatches like Eggs/Egg not matching), added category-awareness to the confidence score — improvement
[2026-07-26] v0.2.0 — 🟠 High fixed: Owner Password reset in Settings now requires re-entering the current password first (previously anyone with the store open could silently change it). Added a view-only Recovery Question display in Settings; the answer stays private and non-editable.
[2026-07-26] v0.2.1 — Service-type stores (laundry, gas filling): added editable Store Type picker in Settings, unit field (pcs/kg/liter/load) on products with a Sold By selector in the Add Product form for non-provision stores — feature (spans both merchant and customer repos, see storeflow-customer-service-stores.zip for the customer-side half)
[2026-07-26] v0.2.2 — 🟠 High fixed: Savings screen in Settings showed a frozen/stale saved amount — local state snapshotted store.savingsGoal once at mount and never re-synced when the scheduled auto-save deduction updated it in the background. Now syncs live.
[2026-07-26] v0.2.3 — 🟡 Medium fixed: same stale-state bug as savings applied to general Settings toggles/preferences (mgr) — now syncs live too. Payment/bank details left as-is since those hold uncommitted typed edits until Save is pressed; syncing those the same way risked wiping mid-typing input.
[2026-07-26] v0.2.4 — Added Back buttons to steps 2 and 3 of Create New Store (previously dead ends). Fixed a data-integrity gap this exposed: going back to edit and resubmitting now updates the same store in place instead of silently creating a second orphaned store with a different access code — 🟠 High fixed
[2026-07-26] v0.2.5 — Deployed send-account-recovery-email Supabase Edge Function; wired to fire after account security setup. Sends store name, access code, emergency recovery key, and recovery question — never the password. Currently no-ops (skipped) until RESEND_API_KEY secret is set in Supabase.
[2026-07-26] v0.2.6 — 🟠 High fixed: "What kind of store" was being asked 3 separate times (account creation, Simple Mode onboarding, Settings) with 3 overlapping option sets. Consolidated into one storeType field. Simple Mode onboarding now skips straight to Top 5 Products Setup instead of re-asking shop type.
[2026-07-26] v0.2.7 — 🟡 Medium fixed: Linking a store to a cloud account (CloudAuthModal) pre-filled the new cloud account's password with the local store password in plain text, silently coupling two separate credential systems. Password fields now always start empty for cloud sign up/sign in.
[2026-07-26] v0.2.8 — 🟠 High fixed: Laundry/Gas Filling/Clothing/Food/Electronics could only be set in Settings after creation — new stores always got created as "provision" regardless of what was picked. Added Laundry/Clothing/Food to the existing retail-type dropdown in the create-store flow and wired it to set storeType correctly at creation, for both local and cloud account paths.
[2026-07-26] v0.3.0 — Stage 1 of Service-Based Store Expansion: Services (laundry) now a real concept — merchant gets a dedicated Services tab (name/price/turnaround, no stock tracking), customer app shows a service card with turnaround badge instead of a plain product tile. Services are Products under the hood (isService flag) so they flow through the exact same cart/checkout/order-history pipeline as retail products — no separate order system.
[2026-07-26] v0.3.1 — Laundry processing sub-stages added on top of the existing order lifecycle (Received/Counting Clothes/Washing/Drying/Ironing/Folding/Quality Check), stored via the existing order metadata mechanism (no schema migration on the merchant side). Supabase: updated get_customer_order_status to also return notes (small additive fix, get_customer_orders already returned it).
[2026-07-26] v0.3.2 — Stage 3 (partial, customer app): Added "Track an Order" guest lookup — no local history or login needed. Phone lookup reuses existing get_customer_orders RPC scoped to the current store; order-code lookup uses a new store-scoped Supabase function (get_order_by_number). This is the missing piece that made "scan QR -> track without the app" not actually reachable before.
[2026-07-26] v0.3.3 — Stage 4: Customer app now has an order-aware "Message Store on WhatsApp" button on the tracking screen (pre-fills order number + current status). Merchant Orders screen got a quick-message menu (delayed / need clarification / please contact us) alongside the existing per-status WhatsApp button.
[2026-07-26] v0.4.0 — Stage 5 (loyalty program): Points-per-order system, merchant-configurable (points per ₦100 spent, redemption threshold, discount value) in Settings. Supabase: new loyalty_redemptions table (RLS locked to SECURITY DEFINER RPCs only) + get_customer_loyalty_balance/redeem_customer_loyalty functions. Points computed live from actual Completed orders — no separate point ledger to drift out of sync. Referral rewards deferred per your call.
[2026-07-26] v0.4.1 — Simple Mode voice: added Sell/Add Item toggle. Add Item mode parses two spoken prices (smaller = cost, larger = selling, order-independent) or one price (selling only), then shows the same editable confirm form as before for the merchant to check/adjust before saving — feature
[2026-07-30] v1.1.0 — Zero-Setup Smart Inventory: backorder-selling toggle (password-gated), voice match length-ratio fix, qty/price parsing for spoken amounts, auto-alias learning, Pending Inventory badge — severity fixed: Medium
[2026-07-30] v1.2.0 — Sales Target counter: auto daily/weekly detection + manual override, shown in Simple Mode and Owner Dashboard — severity: Low (new feature)
[2026-07-30] v1.3.0 — Wired 10 dead Flow settings toggles to real features, built Weekly Recap, added tiered sales-milestone celebrations (Simple Mode + POS), fixed backorder stock-guard bug in Simple Mode — severity: Medium
[2026-07-30] v1.4.0 — New Performance Calendar (daily/weekly/monthly target consistency, streaks, achievements, drill-down insights) + proper click-to-accept flow for suggested prices (never auto-applies) — severity: Low (new features)
[2026-07-30] v1.5.0 — Auto-Apply Prices now functional: applies within owner-set margin % and ₦ change cap, else falls back to manual Accept. Fixed pricingAlerts ignoring the Default Profit Margin setting — severity: Medium
[2026-07-30] v1.6.0 — Auto-Applied Prices now logged and reversible: Undo button, before/after profit comparison, Auto-Priced badge on affected products — severity: Low
[2026-07-30] v1.7.0 — Flow now speaks contextually through Create/Access Store flow (welcome, guidance, wrong-password reactions, celebration), subtle button entrance/hover polish, mascot size varies slightly by step — severity: Low (UX polish)
[2026-07-30] v1.8.0 — Fixed Settings back-navigation bug (jumped to Dashboard instead of Settings menu) and sticky sub-page state on tab re-entry; added Dark/Light/System toggle, Savings Active badge, and a store-code confirmation gate on Store Type changes — severity: High (navigation) / Low (rest)
[2026-07-30] v1.9.0 — Multiple concurrent savings plans (was limited to one); Wholesale/Retail mode switch now requires store-code confirmation. Note: auto-save deduction formula changed for multi-goal support — affects future deduction amounts on stores with an active percentage-based goal — severity: Medium
[2026-07-30] v1.10.0 — True light mode: every accent theme (Graphite/Blue Sky/Green Forest) now has a real light AND dark variant, independently toggleable. Previously Dark/Light just swapped between two different dark-ish accents — severity: Medium
[2026-07-30] v1.11.0 — Fixed Flow's speech bubble overlapping the wordmark/tagline text, added 5 rotating taglines on Create/Access Store screen, fixed sleeping mascot's tap message to distinguish closed-hours rest from Flow being disabled — severity: Low
[2026-07-31] v1.12.0 — Pulled mascot back closer to wordmark (previous fix over-reserved space), polished the product-match suggestions into a labeled "Similar Products" section with match-quality badges and Sell button — severity: Low
[2026-07-31] v1.10.1 — Fixed orders/order_items RLS publicly exposing every store's customer data (name, phone, order contents) to anyone with the anon key; restored store-scoped SELECT, added get_order_by_number/get_customer_orders RPCs for customer tracking — 🔴 Critical fixed
[2026-07-31] v1.10.2 — Fixed Flow mascot losing his angry expression on wrong password/store code since v1.7.0 — the "isTalking"/"isMouthTalking" generic speaking face was overriding the angry eyes and mouth whenever he had a line to say — 🟢 Low fixed
[2026-07-31] v1.10.3 — Fixed Flow's speech bubble overlapping page headings (vertical placement now checks real space above/below and the next element on the page, instead of a blind "close to top of screen" flip) — 🟢 Low fixed
[2026-07-31] v1.10.4 — Fixed walking-off animation using a fixed 200px distance (stranded him mid-screen on some layouts); now viewport-relative and rendered behind page content instead of on top while walking — 🟢 Low fixed
[2026-07-31] v1.10.5 — Added a 4th-wrong-password reaction: Flow now calls you out ("who ARE you??") instead of repeating the usual wrong-password line — feature
[2026-07-31] v1.13.0 — Multi-item voice sales: saying several products in one breath ("Indomitable, Garri and onions") now builds a review cart with a Sell All button, instead of one garbled search — severity: Low (new feature)
[2026-08-01] v1.14.0 — Savings target cap fix: all savings goals now cap saved amount at target, auto-save stops once target is reached, and Fixed Cash deduction type can be selected independently of automated schedule — severity: High
[2026-08-01] v1.15.0 — Daily Streaks & Surprise Rewards: consecutive store activity tracking, animated header streak flame, milestone reward unlocks (days 3, 7, 14, 30...), and reward reveal celebration modal — severity: Low (new feature)
[2026-08-01] v1.16.0 — Simple Mode universal search: top-right search icon overlay searching across Inventory (name/ID/barcode), Customers (name/phone), and Receipts (item/transaction ID) with tab navigation — severity: Low (new feature)
[2026-08-01] v1.17.0 — Simple Mode voice sell: multi-item sales now share one transactionId; catalog-based auto-segmentation detects multi-item lists without needing "and"/comma — 🔴 High + 🟠 High
[2026-08-01] v1.18.0 — Simple Mode voice sell: low-confidence cart matches flagged with "Not sure?" badge and inline tap-to-swap selection — 🔴 High + 🟠 High + 🟡 Medium
[2026-08-01] v1.19.0 — Simple Mode voice sell: added token word matching and window token validation (isValidWindowForProduct) to prevent multi-product voice speech from being swallowed into a single item — 🔴 High (multi-item parsing fix)














