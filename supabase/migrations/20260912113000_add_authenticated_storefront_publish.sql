-- Add the secure publishing endpoint first so the merchant client can deploy
-- before legacy password-based publishing is disabled.

create or replace function public.publish_storefront_authenticated(
  p_access_code text,
  p_marketplace_settings jsonb,
  p_business_template jsonb,
  p_laundry_pricing jsonb,
  p_business_name text default null,
  p_business_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores%rowtype;
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select s.* into v_store
  from public.stores s
  where upper(trim(coalesce(s.access_code, ''))) = upper(trim(coalesce(p_access_code, '')))
  limit 1;

  if not found then
    raise exception 'Store not found';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_store.owner_id
      and p.auth_user_id = v_uid
  ) then
    raise exception 'Only the authenticated store owner can publish this storefront' using errcode = '42501';
  end if;

  update public.stores
  set business_name = coalesce(nullif(trim(p_business_name), ''), business_name),
      business_type = coalesce(nullif(trim(p_business_type), ''), business_type),
      data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
        'marketplaceSettings', coalesce(p_marketplace_settings, '{}'::jsonb),
        'businessTemplate', coalesce(p_business_template, '{}'::jsonb),
        'laundryPricing', coalesce(p_laundry_pricing, '{}'::jsonb)
      ),
      updated_at = now()
  where id = v_store.id;

  return v_store.id;
end;
$$;

revoke all on function public.publish_storefront_authenticated(text,jsonb,jsonb,jsonb,text,text) from public;
grant execute on function public.publish_storefront_authenticated(text,jsonb,jsonb,jsonb,text,text) to authenticated;
