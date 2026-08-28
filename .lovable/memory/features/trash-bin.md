---
name: Recently Deleted (Trash Bin)
description: Soft-delete with 7-day retention for products, sales and expenses
type: feature
---
- Deleting a product, sale, or expense moves it to `store.trash[]` instead of removing it permanently.
- Retention: 7 days. Auto-purged on every `saveStore()` call.
- `clearSales()` moves every sale into trash (not just empties the array).
- Trash UI lives in `src/components/RecentlyDeleted.tsx` — opened from a 🗑 button in Sales History header AND from the Settings tab.
- Restoring re-inserts the original payload (with same id) into its source list.
- Permanent delete and "Empty trash" both require the store access code.
- Sales History also has a per-row ✕ delete button (also access-code gated).
