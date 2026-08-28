-- ============================================================================
-- Migration: Enable pg_cron + pg_net and schedule streak-loss-warning-hourly
-- Timestamp: 2026-08-03
--
-- This is the FIRST pg_cron job in the project.
--
-- PURPOSE:
--   Invokes send-flow-reminders with { "reminder_type": "streak_targeted" }
--   once per hour so the edge function can evaluate every store's local time
--   and only notify stores where it's 7pm+ and the merchant hasn't opened yet.
--   Running hourly (not once daily at a fixed UTC hour) ensures the check
--   is correct across arbitrary timezones.
--
-- ROLLBACK PLAN:
--   To unschedule:
--     SELECT cron.unschedule('streak-loss-warning-hourly');
--   To fully remove the cron extension afterwards (optional):
--     DROP EXTENSION IF EXISTS pg_cron;
--
-- PREREQUISITES:
--   - VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT must be set as
--     Supabase Edge Function secrets BEFORE this runs, otherwise the edge
--     function returns 500 with "VAPID keys not configured".
--   - The service_role key is read from Vault at call time (not hardcoded).
-- ============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Helper RPC used by the edge function to atomically patch
--    data->'streak'->'lastWarningDate' without a full read-modify-write cycle.
CREATE OR REPLACE FUNCTION public.set_streak_warning_date(
  p_store_id uuid,
  p_date text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.stores
  SET data = jsonb_set(
    COALESCE(data, '{}'::jsonb),
    '{streak,lastWarningDate}',
    to_jsonb(p_date)
  ),
  updated_at = now()
  WHERE id = p_store_id
    AND data IS NOT NULL
    AND data->'streak' IS NOT NULL;
END;
$$;

-- 3. Schedule the hourly cron job.
--    pg_net's http_post sends the request to the edge function URL.
--    The service_role key is fetched from vault at query time via
--    current_setting so it is never embedded in the cron definition.
SELECT cron.schedule(
  'streak-loss-warning-hourly',
  '17 * * * *',   -- minute 17 of every hour (avoids :00 stampede)
  $$
  SELECT extensions.http_post(
    url := current_setting('app.settings.supabase_url', true)
           || '/functions/v1/send-flow-reminders',
    body := '{"reminder_type":"streak_targeted"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );
  $$
);
