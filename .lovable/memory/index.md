# Project Memory

## Core
React PWA, offline-first (localStorage), Lovable Edge Functions for AI.
3 themes: Graphite (default dark, gold accent), Blue Sky (light, blue), Green Forest (dark green). Switch via Settings.
Cards use `bg-card shadow-card` (sleek floating, no heavy borders). Recharts must use `hsl(var(--chart-*))` tokens.
Settings/Profile is always a circular icon button in top-right header.

## Memories
- [Themes](mem://features/themes) — Three-theme system, CSS-variable tokens, picker in Settings
- [Access Control](mem://features/access-control) — 6-character access code and lock timer configuration
- [AI Receipt Scanning](mem://features/ai-receipt-scanning) — Image scanning extraction and inventory/sales integration
- [PWA Install UI](mem://features/pwa-install-ui) — Custom PWA install buttons and iOS guidance
- [Sales Management](mem://features/sales-management) — Product searching, quick-sell (1 unit), and text receipts
- [Store Profile](mem://features/store-profile) — Store metadata and receipt integration
