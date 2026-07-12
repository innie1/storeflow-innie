-- Migration: relax_notifications_rls
-- Purpose: Allow public (anonymous/customer) INSERT access to notifications table so customer app can submit notifications to the store owner.

DROP POLICY IF EXISTS "Allow public INSERT on notifications" ON public.notifications;

CREATE POLICY "Allow public INSERT on notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- Drop old function signature if it exists
DROP FUNCTION IF EXISTS public.place_order_atomic(uuid, text, text, text, text, numeric, numeric, text, jsonb);

-- Atomic order submission helper function (p_store_id as text for JS type-matching compatibility)
CREATE OR REPLACE FUNCTION public.place_order_atomic(
  p_store_id text,
  p_customer_name text,
  p_customer_phone text,
  p_order_number text,
  p_status text,
  p_subtotal numeric,
  p_total numeric,
  p_notes text,
  p_items jsonb
) RETURNS uuid AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
BEGIN
  -- Insert into orders table
  INSERT INTO public.orders (
    store_id,
    customer_name,
    customer_phone,
    order_number,
    status,
    subtotal,
    total,
    notes
  ) VALUES (
    p_store_id::uuid,
    p_customer_name,
    p_customer_phone,
    p_order_number,
    p_status,
    p_subtotal,
    p_total,
    p_notes
  ) RETURNING id INTO v_order_id;

  -- Loop through items and insert into order_items table
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      quantity,
      price,
      subtotal
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::integer,
      (v_item->>'price')::numeric,
      (v_item->>'subtotal')::numeric
    );
  END LOOP;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.place_order_atomic(text, text, text, text, text, numeric, numeric, text, jsonb) TO anon, authenticated, service_role;
