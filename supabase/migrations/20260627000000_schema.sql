-- SUPABASE DATABASE SCHEMA MIGRATION
-- StoreFlow: Multi-Tenant Business & Store Management Suite
-- Migration Timestamp: 2026-06-27

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. CORE TABLES
-- ============================================================================

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  avatar text,
  role text DEFAULT 'staff', -- owner, manager, accountant, supervisor, staff
  status text DEFAULT 'active', -- active, suspended, inactive
  last_login timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- STORES
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  business_name text NOT NULL,
  business_type text DEFAULT 'retail', -- retail, restaurant, games, other
  currency text DEFAULT '₦',
  country text DEFAULT 'Nigeria',
  state text,
  city text,
  address text,
  phone text,
  email text,
  logo text,
  subscription_plan text DEFAULT 'free', -- free, premium, enterprise
  subscription_status text DEFAULT 'active',
  timezone text DEFAULT 'UTC',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- STAFF
CREATE TABLE IF NOT EXISTS public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  role text DEFAULT 'staff',
  salary numeric(12, 2) DEFAULT 0.00,
  permissions jsonb DEFAULT '{}'::jsonb, -- JSON mapping specific menu/tab flags
  status text DEFAULT 'active', -- active, inactive
  pin text, -- hashed PIN or text-based numeric checkout PIN
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  color text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_store_category UNIQUE (store_id, name)
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  barcode text,
  qr_code text,
  sku text,
  name text NOT NULL,
  description text,
  brand text,
  cost_price numeric(12, 2) DEFAULT 0.00,
  selling_price numeric(12, 2) DEFAULT 0.00,
  quantity numeric(12, 2) DEFAULT 0.00,
  minimum_stock numeric(12, 2) DEFAULT 0.00,
  maximum_stock numeric(12, 2) DEFAULT 0.00,
  unit text DEFAULT 'pcs',
  image text,
  expiry_date date,
  status text DEFAULT 'active', -- active, discontinued, low_stock
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- SUPPLIERS
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  loyalty_points integer DEFAULT 0,
  total_spent numeric(12, 2) DEFAULT 0.00,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_store_customer UNIQUE (store_id, phone)
);

-- ============================================================================
-- 2. INVENTORY LEDGER
-- ============================================================================

-- INVENTORY TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  type text NOT NULL, -- Sale, Restock, Adjustment, Return, Damage, Expired, Transfer
  quantity numeric(12, 2) NOT NULL,
  previous_stock numeric(12, 2) NOT NULL,
  new_stock numeric(12, 2) NOT NULL,
  reason text,
  reference_id uuid, -- links to sales, restocks, transfers, etc.
  created_at timestamptz DEFAULT now()
);

-- RESTOCKS
CREATE TABLE IF NOT EXISTS public.restocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  invoice_number text,
  total_cost numeric(12, 2) DEFAULT 0.00,
  payment_method text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RESTOCK ITEMS
CREATE TABLE IF NOT EXISTS public.restock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restock_id uuid REFERENCES public.restocks(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(12, 2) NOT NULL,
  cost_price numeric(12, 2) NOT NULL,
  selling_price numeric(12, 2),
  subtotal numeric(12, 2) NOT NULL
);

-- ============================================================================
-- 3. SALES
-- ============================================================================

-- SALES
CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  cashier_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  receipt_number text UNIQUE NOT NULL,
  subtotal numeric(12, 2) DEFAULT 0.00,
  discount numeric(12, 2) DEFAULT 0.00,
  tax numeric(12, 2) DEFAULT 0.00,
  total numeric(12, 2) DEFAULT 0.00,
  profit numeric(12, 2) DEFAULT 0.00,
  payment_method text NOT NULL, -- cash, transfer, pos, mixed, credit
  payment_status text DEFAULT 'paid', -- paid, pending, partial
  sale_status text DEFAULT 'completed', -- completed, refunded, cancelled
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- SALE ITEMS
CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(12, 2) NOT NULL,
  price numeric(12, 2) NOT NULL,
  cost_price numeric(12, 2) NOT NULL,
  profit numeric(12, 2) NOT NULL,
  subtotal numeric(12, 2) NOT NULL
);

-- RETURNS
CREATE TABLE IF NOT EXISTS public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  reason text,
  refund_amount numeric(12, 2) DEFAULT 0.00,
  status text DEFAULT 'completed', -- completed, pending
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 4. EXPENSES
-- ============================================================================

-- EXPENSES
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  category text NOT NULL, -- Restock, Rent, Utilities, Salaries, Transport, Other
  title text NOT NULL,
  amount numeric(12, 2) DEFAULT 0.00,
  payment_method text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 5. CASH DRAWER
-- ============================================================================

-- CASH DRAWERS
CREATE TABLE IF NOT EXISTS public.cash_drawers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  opening_balance numeric(12, 2) DEFAULT 0.00,
  closing_balance numeric(12, 2) DEFAULT 0.00,
  cash_in numeric(12, 2) DEFAULT 0.00,
  cash_out numeric(12, 2) DEFAULT 0.00,
  difference numeric(12, 2) DEFAULT 0.00,
  status text DEFAULT 'open', -- open, closed
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 6. QR ORDERING
-- ============================================================================

-- ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_phone text,
  order_number text NOT NULL,
  status text DEFAULT 'Pending', -- Pending, Preparing, Ready, Completed, Cancelled
  subtotal numeric(12, 2) DEFAULT 0.00,
  discount numeric(12, 2) DEFAULT 0.00,
  total numeric(12, 2) DEFAULT 0.00,
  pickup_time timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(12, 2) NOT NULL,
  price numeric(12, 2) NOT NULL,
  subtotal numeric(12, 2) NOT NULL
);

-- ============================================================================
-- 7. NOTIFICATIONS
-- ============================================================================

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info', -- info, success, warning, alert
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 8. ROI SYSTEM
-- ============================================================================

-- ROI HISTORY
CREATE TABLE IF NOT EXISTS public.roi_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  inventory_value numeric(12, 2) DEFAULT 0.00,
  cash_available numeric(12, 2) DEFAULT 0.00,
  business_value numeric(12, 2) DEFAULT 0.00,
  revenue numeric(12, 2) DEFAULT 0.00,
  expenses numeric(12, 2) DEFAULT 0.00,
  profit numeric(12, 2) DEFAULT 0.00,
  roi_percentage numeric(6, 2) DEFAULT 0.00,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 9. GOALS
-- ============================================================================

-- BUSINESS GOALS
CREATE TABLE IF NOT EXISTS public.business_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  title text NOT NULL,
  target_amount numeric(12, 2) DEFAULT 0.00,
  current_amount numeric(12, 2) DEFAULT 0.00,
  deadline date,
  status text DEFAULT 'active', -- active, reached, missed
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 10. DEBT MANAGEMENT
-- ============================================================================

-- DEBTS (Customer Receivables)
CREATE TABLE IF NOT EXISTS public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric(12, 2) DEFAULT 0.00,
  remaining numeric(12, 2) DEFAULT 0.00,
  status text DEFAULT 'unpaid', -- unpaid, partial, paid
  due_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- SUPPLIERS DEBT (Payables)
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  amount numeric(12, 2) DEFAULT 0.00,
  remaining numeric(12, 2) DEFAULT 0.00,
  due_date date,
  status text DEFAULT 'unpaid', -- unpaid, partial, paid
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 11. REPORTS
-- ============================================================================

-- DAILY REPORTS
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  sales numeric(12, 2) DEFAULT 0.00,
  profit numeric(12, 2) DEFAULT 0.00,
  expenses numeric(12, 2) DEFAULT 0.00,
  transactions integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 12. AUDITS & LOGS
-- ============================================================================

-- ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text,
  record_id uuid,
  description text,
  ip_address text,
  device text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 13. SETTINGS
-- ============================================================================

-- STORE SETTINGS
CREATE TABLE IF NOT EXISTS public.store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE UNIQUE,
  currency text DEFAULT '₦',
  language text DEFAULT 'en',
  theme text DEFAULT 'dark',
  receipt_footer text,
  tax_rate numeric(4, 2) DEFAULT 0.00,
  barcode_type text DEFAULT 'EAN-13',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 14. FILE STORAGE INDEX
-- ============================================================================

-- FILES INDEX
CREATE TABLE IF NOT EXISTS public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  type text NOT NULL, -- image, document, receipt, etc.
  url text NOT NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 15. MULTI-STORE & MEMBERSHIP
-- ============================================================================

-- STORE MEMBERS
CREATE TABLE IF NOT EXISTS public.store_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'staff', -- owner, manager, supervisor, accountant, staff
  permissions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_store_member UNIQUE (store_id, profile_id)
);

-- ============================================================================
-- 16. SUPABASE STORAGE BUCKETS
-- ============================================================================

-- Insert buckets if not exists into public storage buckets database
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('product-images', 'product-images', true),
  ('store-logos', 'store-logos', true),
  ('staff-avatars', 'staff-avatars', true),
  ('receipts', 'receipts', true),
  ('documents', 'documents', false),
  ('barcodes', 'barcodes', true),
  ('qr-codes', 'qr-codes', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 17. AUTOMATED UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_restocks_updated_at BEFORE UPDATE ON public.restocks FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_returns_updated_at BEFORE UPDATE ON public.returns FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_cash_drawers_updated_at BEFORE UPDATE ON public.cash_drawers FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_business_goals_updated_at BEFORE UPDATE ON public.business_goals FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_debts_updated_at BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_supplier_payments_updated_at BEFORE UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_store_settings_updated_at BEFORE UPDATE ON public.store_settings FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
CREATE TRIGGER update_store_members_updated_at BEFORE UPDATE ON public.store_members FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- ============================================================================
-- 18. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Helper function to check if the current user is a member of the given store
CREATE OR REPLACE FUNCTION public.is_store_member(check_store_id uuid)
RETURNS boolean AS $$
DECLARE
  user_profile_id uuid;
BEGIN
  SELECT id INTO user_profile_id FROM public.profiles WHERE auth_user_id = auth.uid();
  IF user_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.store_members
    WHERE store_id = check_store_id
    AND profile_id = user_profile_id
  ) OR EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = check_store_id
    AND owner_id = user_profile_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on all public business tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_drawers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roi_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policies
CREATE POLICY "Users can read profiles they belong to or their own" ON public.profiles
  FOR SELECT USING (auth_user_id = auth.uid() OR id IN (SELECT profile_id FROM public.store_members WHERE store_id IN (SELECT store_id FROM public.store_members WHERE profile_id = profiles.id)));
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth_user_id = auth.uid());
CREATE POLICY "Allow public profile inserts on signup" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- 2. Stores Policies
CREATE POLICY "Store members can view store profiles" ON public.stores
  FOR SELECT USING (is_store_member(id) OR owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY "Store owners can update store details" ON public.stores
  FOR UPDATE USING (owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY "Allow public store inserts" ON public.stores
  FOR INSERT WITH CHECK (true);

-- Generic store membership policies for SELECT/INSERT/UPDATE/DELETE on other tables
-- A macro is used here to define read/write privileges based on membership

-- Staff Table
CREATE POLICY "Staff SELECT" ON public.staff FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Staff INSERT" ON public.staff FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Staff UPDATE" ON public.staff FOR UPDATE USING (is_store_member(store_id));
CREATE POLICY "Staff DELETE" ON public.staff FOR DELETE USING (is_store_member(store_id));

-- Categories Table
CREATE POLICY "Categories SELECT" ON public.categories FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Categories INSERT" ON public.categories FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Categories UPDATE" ON public.categories FOR UPDATE USING (is_store_member(store_id));
CREATE POLICY "Categories DELETE" ON public.categories FOR DELETE USING (is_store_member(store_id));

-- Products Table
CREATE POLICY "Products SELECT" ON public.products FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Products INSERT" ON public.products FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Products UPDATE" ON public.products FOR UPDATE USING (is_store_member(store_id));
CREATE POLICY "Products DELETE" ON public.products FOR DELETE USING (is_store_member(store_id));

-- Suppliers Table
CREATE POLICY "Suppliers SELECT" ON public.suppliers FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Suppliers INSERT" ON public.suppliers FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Suppliers UPDATE" ON public.suppliers FOR UPDATE USING (is_store_member(store_id));
CREATE POLICY "Suppliers DELETE" ON public.suppliers FOR DELETE USING (is_store_member(store_id));

-- Customers Table
CREATE POLICY "Customers SELECT" ON public.customers FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Customers INSERT" ON public.customers FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Customers UPDATE" ON public.customers FOR UPDATE USING (is_store_member(store_id));
CREATE POLICY "Customers DELETE" ON public.customers FOR DELETE USING (is_store_member(store_id));

-- Inventory Transactions Table
CREATE POLICY "Inventory Transactions SELECT" ON public.inventory_transactions FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Inventory Transactions INSERT" ON public.inventory_transactions FOR INSERT WITH CHECK (is_store_member(store_id));

-- Restocks Table
CREATE POLICY "Restocks SELECT" ON public.restocks FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Restocks INSERT" ON public.restocks FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Restocks UPDATE" ON public.restocks FOR UPDATE USING (is_store_member(store_id));

-- Restock Items Table
CREATE POLICY "Restock Items SELECT" ON public.restock_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.restocks WHERE id = restock_id AND is_store_member(store_id)));
CREATE POLICY "Restock Items INSERT" ON public.restock_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.restocks WHERE id = restock_id AND is_store_member(store_id)));

-- Sales Table
CREATE POLICY "Sales SELECT" ON public.sales FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Sales INSERT" ON public.sales FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Sales UPDATE" ON public.sales FOR UPDATE USING (is_store_member(store_id));

-- Sale Items Table
CREATE POLICY "Sale Items SELECT" ON public.sale_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.sales WHERE id = sale_id AND is_store_member(store_id)));
CREATE POLICY "Sale Items INSERT" ON public.sale_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.sales WHERE id = sale_id AND is_store_member(store_id)));

-- Returns Table
CREATE POLICY "Returns SELECT" ON public.returns FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Returns INSERT" ON public.returns FOR INSERT WITH CHECK (is_store_member(store_id));

-- Expenses Table
CREATE POLICY "Expenses SELECT" ON public.expenses FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Expenses INSERT" ON public.expenses FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Expenses UPDATE" ON public.expenses FOR UPDATE USING (is_store_member(store_id));

-- Cash Drawers Table
CREATE POLICY "Cash Drawers SELECT" ON public.cash_drawers FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Cash Drawers INSERT" ON public.cash_drawers FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Cash Drawers UPDATE" ON public.cash_drawers FOR UPDATE USING (is_store_member(store_id));

-- Orders Table (QR Ordering - also allows public inserts for customers scanning the code)
CREATE POLICY "Orders SELECT" ON public.orders FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Orders INSERT" ON public.orders FOR INSERT WITH CHECK (true); -- Customers scanning code can submit orders
CREATE POLICY "Orders UPDATE" ON public.orders FOR UPDATE USING (is_store_member(store_id));

-- Order Items Table
CREATE POLICY "Order Items SELECT" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders WHERE id = order_id AND (is_store_member(store_id) OR true)));
CREATE POLICY "Order Items INSERT" ON public.order_items FOR INSERT WITH CHECK (true);

-- Notifications Table
CREATE POLICY "Notifications SELECT" ON public.notifications FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Notifications UPDATE" ON public.notifications FOR UPDATE USING (is_store_member(store_id));

-- ROI History Table
CREATE POLICY "ROI History SELECT" ON public.roi_history FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "ROI History INSERT" ON public.roi_history FOR INSERT WITH CHECK (is_store_member(store_id));

-- Business Goals Table
CREATE POLICY "Business Goals SELECT" ON public.business_goals FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Business Goals INSERT" ON public.business_goals FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Business Goals UPDATE" ON public.business_goals FOR UPDATE USING (is_store_member(store_id));
CREATE POLICY "Business Goals DELETE" ON public.business_goals FOR DELETE USING (is_store_member(store_id));

-- Debts Table
CREATE POLICY "Debts SELECT" ON public.debts FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Debts INSERT" ON public.debts FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Debts UPDATE" ON public.debts FOR UPDATE USING (is_store_member(store_id));

-- Supplier Payments Table
CREATE POLICY "Supplier Payments SELECT" ON public.supplier_payments FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Supplier Payments INSERT" ON public.supplier_payments FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Supplier Payments UPDATE" ON public.supplier_payments FOR UPDATE USING (is_store_member(store_id));

-- Daily Reports Table
CREATE POLICY "Daily Reports SELECT" ON public.daily_reports FOR SELECT USING (is_store_member(store_id));

-- Activity Logs Table
CREATE POLICY "Activity Logs SELECT" ON public.activity_logs FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Activity Logs INSERT" ON public.activity_logs FOR INSERT WITH CHECK (is_store_member(store_id));

-- Store Settings Table
CREATE POLICY "Store Settings SELECT" ON public.store_settings FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Store Settings INSERT" ON public.store_settings FOR INSERT WITH CHECK (is_store_member(store_id));
CREATE POLICY "Store Settings UPDATE" ON public.store_settings FOR UPDATE USING (is_store_member(store_id));

-- Files Table
CREATE POLICY "Files SELECT" ON public.files FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Files INSERT" ON public.files FOR INSERT WITH CHECK (is_store_member(store_id));

-- Store Members Table (Junction)
CREATE POLICY "Store Members SELECT" ON public.store_members FOR SELECT USING (is_store_member(store_id));
CREATE POLICY "Store Members INSERT" ON public.store_members FOR INSERT WITH CHECK (is_store_member(store_id) OR (SELECT owner_id FROM public.stores WHERE id = store_id) = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY "Store Members UPDATE" ON public.store_members FOR UPDATE USING (is_store_member(store_id));
CREATE POLICY "Store Members DELETE" ON public.store_members FOR DELETE USING (is_store_member(store_id));
