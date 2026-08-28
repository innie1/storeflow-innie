---
name: Data Exports
description: PDF and CSV exports for history and ROI summary
type: feature
---

- `src/lib/export-data.ts` exposes `exportHistoryCSV/PDF` and `exportROICSV/PDF`
- Uses `jspdf` for PDFs (text-only, no autotable)
- Buttons live in History page header and at top of ROI Tracker
- Filenames: `<storeName>-history-YYYY-MM-DD.{csv,pdf}` and `<storeName>-roi-YYYY-MM-DD.{csv,pdf}`
