create or replace function public.publish_storefront_from_owner(
  p_access_code text,
  p_owner_password text,
  p_marketplace_settings jsonb default '{}'::jsonb,
  p_business_template jsonb default '{}'::jsonb,
  p_laundry_pricing jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_authorized boolean := false;
  v_data jsonb;
begin
  select * into v_store
  from public.stores
  where upper(access_code) = upper(trim(p_access_code))
  limit 1
  for update;

  if v_store.id is null then
    raise exception 'Store not found' using errcode = 'P0002';
  end if;

  if auth.uid() is not null then
    v_authorized := public.is_store_member(v_store.id);
  end if;

  if not v_authorized
     and v_store.owner_password is not null
     and length(v_store.owner_password) > 0
     and p_owner_password is not null
     and v_store.owner_password = p_owner_password then
    v_authorized := true;
  end if;

  if not v_authorized then
    raise exception 'Not authorized for this store' using errcode = '42501';
  end if;

  v_data := case when jsonb_typeof(v_store.data) = 'object' then v_store.data else '{}'::jsonb end;
  v_data := jsonb_set(v_data, '{marketplaceSettings}', coalesce(p_marketplace_settings, '{}'::jsonb), true);
  v_data := jsonb_set(v_data, '{businessTemplate}', coalesce(p_business_template, '{}'::jsonb), true);
  v_data := jsonb_set(v_data, '{laundryPricing}', coalesce(p_laundry_pricing, '{}'::jsonb), true);

  update public.stores
  set data = v_data,
      updated_at = now()
  where id = v_store.id;

  return jsonb_build_object(
    'id', v_store.id,
    'store_id', v_store.store_id,
    'access_code', v_store.access_code,
    'published', true
  );
end;
$$;

revoke all on function public.publish_storefront_from_owner(text,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.publish_storefront_from_owner(text,text,jsonb,jsonb,jsonb) to anon, authenticated;
