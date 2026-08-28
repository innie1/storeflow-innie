-- Drop old recursive store_members policies
DROP POLICY IF EXISTS "Store Members SELECT" ON public.store_members;
DROP POLICY IF EXISTS "Store Members INSERT" ON public.store_members;
DROP POLICY IF EXISTS "Store Members UPDATE" ON public.store_members;
DROP POLICY IF EXISTS "Store Members DELETE" ON public.store_members;

-- Create secure, non-recursive SELECT policy
CREATE POLICY "Store Members SELECT" ON public.store_members
  FOR SELECT USING (
    profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) 
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
  );

-- Create secure, non-recursive INSERT policy
CREATE POLICY "Store Members INSERT" ON public.store_members
  FOR INSERT WITH CHECK (
    profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) 
    OR EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
  );

-- Create secure, non-recursive UPDATE policy (only owners can update members)
CREATE POLICY "Store Members UPDATE" ON public.store_members
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
  );

-- Create secure, non-recursive DELETE policy (only owners can remove members)
CREATE POLICY "Store Members DELETE" ON public.store_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.stores WHERE id = store_id AND owner_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()))
  );
