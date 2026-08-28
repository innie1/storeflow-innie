-- Migration: alter_order_items_product_id
-- Purpose: Drop foreign key constraint on order_items.product_id and alter its type to text to support custom text product IDs.

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
ALTER TABLE public.order_items ALTER COLUMN product_id TYPE text;
