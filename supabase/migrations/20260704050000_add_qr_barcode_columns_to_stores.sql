-- Migration: add_qr_barcode_columns_to_stores
-- Purpose: Add store_id, qr_code, and barcode columns to stores table and backfill.

ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS store_id text UNIQUE,
ADD COLUMN IF NOT EXISTS qr_code text,
ADD COLUMN IF NOT EXISTS barcode text;

-- Backfill any existing stores that have data but lack store_id, qr_code, or barcode
DO $$
DECLARE
  r RECORD;
  s_id text;
  s_qr text;
  s_barcode text;
BEGIN
  FOR r IN SELECT id, access_code, data FROM public.stores LOOP
    IF r.data IS NOT NULL AND r.data ? 'storeId' THEN
      s_id := r.data->>'storeId';
    ELSE
      s_id := 'SF-' || upper(substring(md5(random()::text) from 1 for 8)) || '-' || upper(substring(md5(random()::text) from 9 for 4));
    END IF;

    s_qr := 'https://storeflow-customer.vercel.app/store/' || s_id;
    s_barcode := s_id;

    UPDATE public.stores
    SET store_id = COALESCE(stores.store_id, s_id),
        qr_code = COALESCE(stores.qr_code, s_qr),
        barcode = COALESCE(stores.barcode, s_barcode),
        data = jsonb_set(COALESCE(r.data, '{}'::jsonb), '{storeId}', to_jsonb(s_id))
    WHERE id = r.id;
  END LOOP;
END $$;
