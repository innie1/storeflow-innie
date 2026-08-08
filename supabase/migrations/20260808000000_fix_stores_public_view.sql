-- Migration: fix_stores_public_view
-- Purpose: The previous stores_public view stripped the entire `products` array
-- from the JSON `data` column in order to hide `costPrice`. This broke the customer
-- app because it relies on `store.data.products` to display products and services.
-- This migration recreates the `stores_public` view to INCLUDE the `products` array,
-- but safely redacts the `costPrice` (and `cost_price`) from each product object
-- inside the array using a jsonb transformation.

CREATE OR REPLACE VIEW public.stores_public WITH (security_invoker=true) AS
SELECT 
  id, 
  store_id, 
  business_name, 
  currency, 
  country, 
  state, 
  city, 
  address, 
  phone, 
  email, 
  logo, 
  subscription_status, 
  access_code, 
  qr_code,
  created_at,
  updated_at,
  CASE 
    -- Only attempt to transform if data contains a 'products' array
    WHEN data ? 'products' AND jsonb_typeof(data->'products') = 'array' THEN
      data || jsonb_build_object(
        'products', 
        COALESCE(
          (
            SELECT jsonb_agg(elem - 'costPrice' - 'cost_price' - 'totalProfit' - 'total_profit') 
            FROM jsonb_array_elements(data->'products') elem
          ),
          '[]'::jsonb
        )
      ) - 'costPrice' - 'totalProfit'
    ELSE
      data - 'costPrice' - 'totalProfit'
  END as data
FROM public.stores;

-- Ensure public access to the view is granted
GRANT SELECT ON public.stores_public TO anon, authenticated, service_role;
