-- Drop old recursive profiles select policy
DROP POLICY IF EXISTS "Users can read profiles they belong to or their own" ON public.profiles;

-- Create simple SELECT policy for own profile
CREATE POLICY "Allow users to read their own profile" ON public.profiles
  FOR SELECT USING (auth_user_id = auth.uid());

-- Create non-recursive SELECT policy for other store members
CREATE POLICY "Allow store members to read other members profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 
      FROM public.store_members sm1
      WHERE sm1.profile_id = public.profiles.id
      AND sm1.store_id IN (
        SELECT sm2.store_id 
        FROM public.store_members sm2
        WHERE sm2.profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
      )
    )
  );
