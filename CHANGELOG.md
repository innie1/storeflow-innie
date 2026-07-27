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
