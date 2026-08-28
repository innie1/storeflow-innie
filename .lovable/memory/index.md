# Project Memory

## Core
React PWA, offline-first (localStorage), Lovable Edge Functions for AI.
Dark theme (#08080f), gold accents (#f5c842). Fonts: DM Mono, Syne.
Settings/Profile is always a circular icon button in top-right header.
Multi-store: registry in localStorage key `storeflow_index`, switch via Settings.
Restock funding: 'balance' = expense only; 'new_money' = expense + investment.
Initial inventory value auto-seeded as 'initial' investment on store creation.

## Memories
- [Access Control](mem://features/access-control) — 6-character access code and lock timer configuration
- [AI Receipt Scanning](mem://features/ai-receipt-scanning) — Image scanning extraction and inventory/sales integration
- [PWA Install UI](mem://features/pwa-install-ui) — Custom PWA install buttons and iOS guidance
- [Sales Management](mem://features/sales-management) — Product searching, quick-sell (1 unit), and text receipts
- [Store Profile](mem://features/store-profile) — Store metadata and receipt integration
- [Themes](mem://features/themes) — Theme presets and tokens
- [Trash Bin](mem://features/trash-bin) — 7-day soft delete for products/sales/expenses
- [Barcode Scanner](mem://features/barcode-scanner) — html5-qrcode based scan-to-save / scan-to-sell with green flash
- [Exports](mem://features/exports) — jsPDF + CSV exports for History and ROI
