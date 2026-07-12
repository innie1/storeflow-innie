-- Add product performance columns to public.products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS restock_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS units_sold numeric(12, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_revenue numeric(12, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_profit numeric(12, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS first_sale_at timestamptz,
ADD COLUMN IF NOT EXISTS last_sold_at timestamptz;

-- Create inventory_movements table
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type text NOT NULL, -- Restock, Sale, Transfer, Return, Adjustment
  quantity numeric(12, 2) NOT NULL,
  date timestamptz DEFAULT now(),
  user_name text,
  source text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Add RLS policies matching store member access
CREATE POLICY "Inventory Movements SELECT" ON public.inventory_movements 
  FOR SELECT USING (is_store_member(store_id));

CREATE POLICY "Inventory Movements INSERT" ON public.inventory_movements 
  FOR INSERT WITH CHECK (is_store_member(store_id));
