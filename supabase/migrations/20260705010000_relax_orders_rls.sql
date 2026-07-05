-- Migration: relax_orders_rls
-- Purpose: Allow public (anonymous/customer) SELECT access to orders and order_items tables so customers can view and track their orders.

DROP POLICY IF EXISTS "Allow public SELECT on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public SELECT on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Orders SELECT" ON public.orders;
DROP POLICY IF EXISTS "Order Items SELECT" ON public.order_items;

-- Create permissive public read policies
CREATE POLICY "Allow public SELECT on orders" ON public.orders
  FOR SELECT USING (true);

CREATE POLICY "Allow public SELECT on order_items" ON public.order_items
  FOR SELECT USING (true);
