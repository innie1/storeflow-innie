-- Migration: relax_products_categories_rls
-- Purpose: Allow public (anonymous/customer) SELECT access to products and categories tables.

-- Drop conflicting policies if they exist (to keep it clean)
DROP POLICY IF EXISTS "Allow public SELECT on products" ON public.products;
DROP POLICY IF EXISTS "Allow public SELECT on categories" ON public.categories;

-- Create permissive public read policies
CREATE POLICY "Allow public SELECT on products" ON public.products
  FOR SELECT USING (true);

CREATE POLICY "Allow public SELECT on categories" ON public.categories
  FOR SELECT USING (true);
