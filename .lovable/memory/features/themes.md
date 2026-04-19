---
name: Themes
description: Three-theme system (Graphite/Blue Sky/Green Forest), CSS-variable-driven, picker in Settings
type: feature
---
Theme system lives in `src/lib/theme.ts` (`THEMES`, `getTheme`, `applyTheme`, `initTheme`).
- Bootstrapped in `src/main.tsx` via `initTheme()` before render.
- Switched in Settings ("Appearance" section) — applied by toggling `theme-blue` / `theme-forest` classes on `<html>`. Default = Graphite (no class).
- All three themes redefine the same token set in `src/index.css` (background, card, primary, success, destructive, surface-1/2/3, plus chart-* tokens for recharts: `--chart-revenue`, `--chart-profit`, `--chart-grid`, `--chart-axis`, `--chart-tooltip-bg`, `--chart-tooltip-border`, plus `--shadow-card` and font vars `--font-body`/`--font-display`).
- Cards use `bg-card shadow-card` (sleek floating look) instead of `border border-border`.
- Recharts colors must reference CSS vars (e.g. `hsl(var(--chart-revenue))`) so they re-theme.

Persistence: `localStorage['storeflow_theme']`.
