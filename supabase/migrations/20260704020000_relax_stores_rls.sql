-- Drop old restrictive policies
DROP POLICY IF EXISTS "Store members can view store profiles" ON public.stores;
DROP POLICY IF EXISTS "Store owners can update store details" ON public.stores;

-- Create public read policy (so customers can view the store when scanning QR)
CREATE POLICY "Allow public SELECT on stores" ON public.stores
  FOR SELECT USING (true);

-- Create flexible update policy (so owner can update, or anyone can claim if owner is null)
CREATE POLICY "Allow update by owner or if owner is null" ON public.stores
  FOR UPDATE USING (
    owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) 
    OR owner_id IS NULL
  );
