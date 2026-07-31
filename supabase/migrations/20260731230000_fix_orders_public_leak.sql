-- Migration: fix_orders_public_leak
-- Purpose: The relax_orders_rls migration (20260705010000) set
-- `USING (true)` on orders/order_items SELECT, making every order from
-- every store readable by anyone with the public anon key (customer
-- name, phone, items, totals). That was meant to let a customer track
-- their own order, but it opened the whole table instead of scoping
-- the read to that one order.
--
-- This migration:
--   1. Removes the public SELECT policies on orders and order_items.
--   2. Restores merchant-side SELECT scoped to is_store_member(store_id),
--      matching the original schema (needed for the store dashboard).
--   3. Adds two SECURITY DEFINER RPCs so anonymous customers can still
--      track orders, but only the ones matching what they actually
--      provide (order code, or their own phone number) — never the
--      full table.

-- 1 & 2: remove the wide-open policies, restore store-scoped SELECT
DROP POLICY IF EXISTS "Allow public SELECT on orders" ON public.orders;
DROP POLICY IF EXISTS "Orders SELECT" ON public.orders;
CREATE POLICY "Orders SELECT" ON public.orders
  FOR SELECT USING (is_store_member(store_id));

DROP POLICY IF EXISTS "Allow public SELECT on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Order Items SELECT" ON public.order_items;
CREATE POLICY "Order Items SELECT" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders WHERE id = order_id AND is_store_member(store_id))
  );

-- 3a: look up a single order by its order number, scoped to one store.
-- Returns only that order + its items, never the whole table.
CREATE OR REPLACE FUNCTION public.get_order_by_number(
  p_store_id uuid,
  p_order_number text
) RETURNS TABLE (
  id uuid,
  store_id uuid,
  customer_name text,
  order_number text,
  status text,
  subtotal numeric,
  discount numeric,
  total numeric,
  pickup_time timestamptz,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  items jsonb
) AS $$
  SELECT
    o.id, o.store_id, o.customer_name, o.order_number, o.status,
    o.subtotal, o.discount, o.total, o.pickup_time, o.notes,
    o.created_at, o.updated_at,
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(oi)) FROM public.order_items oi WHERE oi.order_id = o.id),
      '[]'::jsonb
    ) AS items
  FROM public.orders o
  WHERE o.store_id = p_store_id
    AND o.order_number = p_order_number
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_order_by_number(uuid, text) TO anon, authenticated, service_role;

-- 3b: look up a customer's own orders at one store by their phone
-- number. Scoped to that store + that phone number only — never
-- returns another customer's orders.
CREATE OR REPLACE FUNCTION public.get_customer_orders(
  p_store_id uuid,
  p_customer_phone text
) RETURNS TABLE (
  id uuid,
  store_id uuid,
  customer_name text,
  order_number text,
  status text,
  subtotal numeric,
  discount numeric,
  total numeric,
  pickup_time timestamptz,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  items jsonb
) AS $$
  SELECT
    o.id, o.store_id, o.customer_name, o.order_number, o.status,
    o.subtotal, o.discount, o.total, o.pickup_time, o.notes,
    o.created_at, o.updated_at,
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(oi)) FROM public.order_items oi WHERE oi.order_id = o.id),
      '[]'::jsonb
    ) AS items
  FROM public.orders o
  WHERE o.store_id = p_store_id
    AND o.customer_phone = p_customer_phone
  ORDER BY o.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_customer_orders(uuid, text) TO anon, authenticated, service_role;
