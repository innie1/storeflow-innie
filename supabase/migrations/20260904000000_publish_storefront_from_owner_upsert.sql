-- publish_storefront_from_owner was update-only: if a store's access code
-- had never been synced to Supabase (e.g. a store created via the local
-- Quick Setup / Access Code flow, without ever enabling Multi-device Cloud
-- Sync), the "for update" lookup found no row and the function always
-- raised 'Store not found', so the laundry auto-publish-on-open call that
-- depends on it failed silently, every time, forever, for those stores.
--
-- This adds an insert path so a first-time publish creates the row instead
-- of erroring, mirroring the working upsert already used by the
-- Multi-device Cloud Sync toggle in Settings.tsx (which also performs no
-- authorization check on first insert, since there is nothing yet to check
-- against). p_business_name/p_business_type are new optional params so the
-- insert can satisfy the NOT NULL business_name column and the
-- business_type check constraint.
drop function if exists public.publish_storefront_from_owner(text, text, jsonb, jsonb, jsonb);

create or replace function public.publish_storefront_from_owner(
  p_access_code text,
  p_owner_password text,
  p_marketplace_settings jsonb default '{}'::jsonb,
  p_business_template jsonb default '{}'::jsonb,
  p_laundry_pricing jsonb default '{}'::jsonb,
  p_business_name text default null,
  p_business_type text default null
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
  v_just_created boolean := false;
begin
  select * into v_store
  from public.stores
  where upper(access_code) = upper(trim(p_access_code))
  limit 1
  for update;

  if v_store.id is null then
    if p_business_name is null or length(trim(p_business_name)) = 0 then
      raise exception 'Business name is required to publish a new store' using errcode = '22004';
    end if;

    insert into public.stores (access_code, owner_password, business_name, business_type, data)
    values (
      trim(p_access_code),
      p_owner_password,
      p_business_name,
      coalesce(p_business_type, 'retail'),
      jsonb_build_object(
        'marketplaceSettings', coalesce(p_marketplace_settings, '{}'::jsonb),
        'businessTemplate', coalesce(p_business_template, '{}'::jsonb),
        'laundryPricing', coalesce(p_laundry_pricing, '{}'::jsonb)
      )
    )
    on conflict (access_code) do nothing
    returning * into v_store;

    if v_store.id is not null then
      v_just_created := true;
    else
      -- Lost a race to a concurrent first-publish of the same access code;
      -- fall through and update the row that just appeared.
      select * into v_store
      from public.stores
      where upper(access_code) = upper(trim(p_access_code))
      limit 1
      for update;
    end if;
  end if;

  if not v_just_created then
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
  end if;

  return jsonb_build_object(
    'id', v_store.id,
    'store_id', v_store.store_id,
    'access_code', v_store.access_code,
    'published', true
  );
end;
$$;

revoke all on function public.publish_storefront_from_owner(text,text,jsonb,jsonb,jsonb,text,text) from public;
grant execute on function public.publish_storefront_from_owner(text,text,jsonb,jsonb,jsonb,text,text) to anon, authenticated;
