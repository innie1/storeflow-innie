# StoreFlow

StoreFlow is a mobile-first Progressive Web App (PWA) for small business owners — inventory, sales, expenses, restocking, staff, and a customer-facing order storefront, all in one app. It's built to work offline-first on a phone, with cloud sync and backup via Supabase for stores that want multi-device access.

## Core features

- **Point of Sale** — cart-based checkout, barcode scanning, split/mixed payments, receipt printing (system print dialog or direct Bluetooth thermal printers)
- **Inventory** — stock tracking, low-stock alerts, planned restocks, stock transfers, bulk import
- **Smart Restock Engine** — AI-assisted restock recommendations that weigh sales velocity, stock urgency, profit margin, and available cash (net income), with a budget allocator that still gives useful priority guidance even when there's little or no cash available
- **Orders** — a customer-facing storefront where shoppers place orders, which the merchant accepts/prepares/fulfills; completed orders are recorded as sales and rolled into the store's customer history
- **Expenses & Recurring Bills** — one-off expenses plus recurring bills (rent, subscriptions) with due-date reminders
- **ROI Tracker** — invested capital, business value, loans (with due-date reminders), investments, withdrawals, and a Restock Score showing how much restock spending goes toward products that actually sell
- **Savings Plan** — scheduled automatic savings deductions (daily/weekly/monthly)
- **Manager / Flow AI** — a lightweight business-intelligence layer that generates insights, notifications, and a weekly auto restock draft from the store's own data (no external AI API — it's rule-based analysis over the store's real numbers)
- **Push notifications** — real OS-level notifications for new orders via a service worker + Web Push (VAPID), backed by a Supabase Edge Function and database trigger
- **QR & Barcode tools** — generate store/product QR codes, scan barcodes for lookup and checkout
- **Marketplace Settings** — storefront visibility, pricing modes (retail/wholesale), delivery, rewards
- **Multi-store / multi-staff** — role-based access (Owner, Manager, Cashier, Inventory), store switching

## Tech stack

- **Frontend**: React + TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix primitives)
- **State/data**: local-first via `localStorage`, synced to **Supabase** (Postgres) for cloud backup and multi-device access
- **Realtime**: Supabase Realtime for live order updates
- **PWA**: `vite-plugin-pwa` with a custom service worker (`src/sw.ts`, `injectManifest` strategy) for offline support and Web Push
- **Backend**: Supabase (Postgres, Auth-less access-code model, Edge Functions, Realtime, Storage)
- **Testing**: Vitest

## Project structure

```
src/
  components/       UI components (one per feature area: Inventory, Sales,
                     Orders, Expenses, ROITracker, SmartRestockEngine, etc.)
  components/qr/     QR code generation and barcode/QR scanning
  components/dashboards/  Role-specific dashboards (Owner, Manager, Cashier, Inventory)
  lib/               Core business logic — store-data.ts (the main data layer:
                     CRUD for products, sales, expenses, restocks, loans, etc.),
                     manager-intel.ts (insights/notifications/AI-ish analysis),
                     reports.ts (share summary + full raw exports),
                     print-engine.ts (receipt printing — system + Bluetooth),
                     push-notifications.ts (Web Push subscribe/unsubscribe)
  pages/             Top-level routed pages (Index.tsx is the main app shell)
  sw.ts              Custom service worker (push notifications, offline caching)
  types/store.ts     Central type definitions for all store data
supabase/
  functions/         Edge Functions (e.g. send-order-push, scan-receipt)
  migrations/        Database schema migrations
```

## Getting started

Requires Node.js and npm.

```sh
git clone <this-repo-url>
cd storeflow-innie
npm install
npm run dev
```

Other useful commands:

```sh
npm run build      # production build
npm run preview    # preview a production build locally
npm test           # run tests once
npm run test:watch # run tests in watch mode
npm run lint        # lint the codebase
```

## Environment / Supabase setup

This app expects a connected Supabase project (see `src/integrations/supabase/client.ts` for the client config). For push notifications to actually send, the `send-order-push` Edge Function needs `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` set as Supabase secrets — see the comments in `src/lib/push-notifications.ts` for details.

## Notes for contributors

- Business logic lives in `src/lib/store-data.ts` and `src/lib/manager-intel.ts` — most features read/write a single `StoreData` object (see `src/types/store.ts`) that gets persisted locally and synced to Supabase.
- The service worker (`src/sw.ts`) is hand-written (not auto-generated) because it needs custom `push` and `notificationclick` handlers — don't switch the PWA build strategy back to `generateSW` without accounting for this.
- Some parts of the codebase have known type-safety gaps (a handful of fields used at runtime but not yet declared on their TypeScript interfaces). These don't affect the build (Vite doesn't type-check on build) but are worth tightening up over time — run `npx tsc --noEmit -p tsconfig.app.json` to see the current count.
