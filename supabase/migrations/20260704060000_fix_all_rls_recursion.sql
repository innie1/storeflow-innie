-- Migration: fix_all_rls_recursion
-- Purpose: Remove all potential infinite recursion from profiles, stores, and store_members policies.

-- 1. profiles policies
DROP POLICY IF EXISTS "Allow users to read their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow store members to read other members profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read profiles they belong to or their own" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow public profile inserts on signup" ON public.profiles;

CREATE POLICY "Allow users to read their own profile" ON public.profiles
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "Allow users to update their own profile" ON public.profiles
  FOR UPDATE USING (auth_user_id = auth.uid());

CREATE POLICY "Allow public profile inserts on signup" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- 2. stores policies
DROP POLICY IF EXISTS "Store members can view store profiles" ON public.stores;
DROP POLICY IF EXISTS "Store owners can update store details" ON public.stores;
DROP POLICY IF EXISTS "Allow public store inserts" ON public.stores;
DROP POLICY IF EXISTS "Allow public SELECT on stores" ON public.stores;
DROP POLICY IF EXISTS "Allow update by owner or if owner is null" ON public.stores;
DROP POLICY IF EXISTS "Allow UPDATE on stores by owner" ON public.stores;
DROP POLICY IF EXISTS "Allow DELETE on stores by owner" ON public.stores;

CREATE POLICY "Allow public SELECT on stores" ON public.stores
  FOR SELECT USING (true);

CREATE POLICY "Allow public INSERT on stores" ON public.stores
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow UPDATE on stores by owner" ON public.stores
  FOR UPDATE USING (
    owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) 
    OR owner_id IS NULL
  );

CREATE POLICY "Allow DELETE on stores by owner" ON public.stores
  FOR DELETE USING (
    owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- 3. store_members policies
DROP POLICY IF EXISTS "Store Members SELECT" ON public.store_members;
DROP POLICY IF EXISTS "Store Members INSERT" ON public.store_members;
DROP POLICY IF EXISTS "Store Members UPDATE" ON public.store_members;
DROP POLICY IF EXISTS "Store Members DELETE" ON public.store_members;
DROP POLICY IF EXISTS "Allow SELECT on store_members" ON public.store_members;
DROP POLICY IF EXISTS "Allow INSERT on store_members" ON public.store_members;
DROP POLICY IF EXISTS "Allow UPDATE on store_members" ON public.store_members;
DROP POLICY IF EXISTS "Allow DELETE on store_members" ON public.store_members;

CREATE POLICY "Allow SELECT on store_members" ON public.store_members
  FOR SELECT USING (
    profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) 
    OR EXISTS (SELECT 1 FROM public.stores WHERE public.stores.id = public.store_members.store_id AND public.stores.owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
  );

CREATE POLICY "Allow INSERT on store_members" ON public.store_members
  FOR INSERT WITH CHECK (
    profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) 
    OR EXISTS (SELECT 1 FROM public.stores WHERE public.stores.id = public.store_members.store_id AND public.stores.owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
  );

CREATE POLICY "Allow UPDATE on store_members" ON public.store_members
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.stores WHERE public.stores.id = public.store_members.store_id AND public.stores.owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
  );

CREATE POLICY "Allow DELETE on store_members" ON public.store_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.stores WHERE public.stores.id = public.store_members.store_id AND public.stores.owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
  );
