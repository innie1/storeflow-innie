# StoreFlow — v2.0.0: Streak Retention System (4 Retention Fixes)

## Overview & What This Does
This release addresses 4 retention leaks in the daily streak feature without touching existing reward pool logic (`pickRandomReward`), the reveal modal animations, or any existing mascot moods/activities.

### 1. Streak Freeze
- Added `freezesAvailable: number` and `freezesUsedDates: string[]` (YYYY-MM-DD format) to the `StreakData` interface (`src/types/store.ts`).
- Automatically grants **1 streak freeze** on the 1st of each calendar month if `freezesAvailable` is `0` (capped at 1, no stacking).
- When a gap > 1 day occurs and `freezesAvailable > 0`: consumes one freeze token, preserves `prev.count` instead of resetting to 1, logs the date to `freezesUsedDates`, and returns `freezeConsumedToday: true`.
- Added `getFreezeUsedLine(count: number)` to display a contextual line from Flow when a freeze saves a streak.

### 2. Filler Milestones
- Expanded `STREAK_MILESTONES` in `src/lib/streaks.ts` to include 5-day intervals between days 30 and 90 (`35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90`). This eliminates any gap longer than 10 days without a reward.
- Exported `nextMilestoneAfter(count)` for shared UI calculation.

### 3. Pre-Loss Warning (Targeted & Hourly pg_cron Job)
- Added `lastWarningDate?: string` to `StreakData` to prevent redundant warning pushes within the same day.
- **Edge Function (`send-flow-reminders`)**: Added a new `"streak_targeted"` mode. It joins `push_subscriptions` with `stores` JSONB data, filtering exclusively for stores where `streak.count > 0`, `lastOpenDate` is not today, the store's local time is **7:00 PM (19:00) or later**, and `lastWarningDate` is not today.
- Sends a customized alert: *"Don't forget to open the shop today — your {count}-day streak is waiting."* and atomically updates `lastWarningDate`.
- **Database Migration (`20260803000000_streak_loss_warning_cron.sql`)**: Enables `pg_cron` and `pg_net`, and schedules an hourly job named `streak-loss-warning-hourly` at minute 17 (`17 * * * *`) that invokes `send-flow-reminders` with body `{"reminder_type": "streak_targeted"}` using the project's service role key from Vault.

### 4. Progress Ring on StreakFlame
- Updated `src/components/streaks/StreakFlame.tsx` to render an SVG progress ring around the flame when lit (`count > 0`).
- Displays the fraction `count / nextMilestone`, colored dynamically by tier (orange for <7 days, amber/gold for ≥7 super streak).

---

## ⚠️ CRITICAL PRE-MERGE CHECK & ENVIRONMENT CONFIRMATION

1. **VAPID Keys Confirmation (Verified ✅):**
   - The targeted push alerts require `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` to already be set as Supabase Edge Function secrets. 
   - **We have explicitly checked and confirmed via Supabase CLI that all three VAPID secrets exist in project `jawfalghkftldvkopuaw`.** Do not modify or clear these secrets, or push delivery will fail with a `500 VAPID keys not configured` error.
   - The `send-flow-reminders` edge function has already been compiled and deployed live to Supabase.

2. **Database Migration:**
   - Apply the migration in `supabase/migrations/20260803000000_streak_loss_warning_cron.sql` directly against your PostgreSQL database or via the Supabase SQL editor/CLI.

---

## 🚨 ROLLBACK PLAN FOR PG_CRON

**NOTE:** This is the first `pg_cron` job scheduled in the entire StoreFlow project. If the scheduled job misfires, generates excessive HTTP requests, or causes any db load issues, immediately unschedule it by running this exact query in the Supabase SQL Editor:

```sql
SELECT cron.unschedule('streak-loss-warning-hourly');
```

To fully clean up the helper RPC and extension (optional after unscheduling):
```sql
DROP FUNCTION IF EXISTS public.set_streak_warning_date(uuid, text);
```
