-- Complete the merchant credential migration after the Auth-only publisher has
-- been deployed by the merchant client.

create or replace function public.scrub_store_cloud_secrets()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_manager jsonb;
begin
  -- The local StoreFlow owner password/PIN must never be a cloud credential.
  new.owner_password := null;

  if new.data is not null then
    new.data := new.data
      - 'ownerPassword'
      - 'owner_password'
      - 'emergencyRecoveryKey'
      - 'recoveryAnswer';

    if jsonb_typeof(new.data->'managerSettings') = 'object' then
      v_manager := (new.data->'managerSettings')
        - 'ownerPassword'
        - 'owner_password'
        - 'emergencyRecoveryKey'
        - 'recoveryAnswer';
      new.data := jsonb_set(new.data, '{managerSettings}', v_manager, true);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_scrub_store_cloud_secrets on public.stores;
create trigger trg_scrub_store_cloud_secrets
before insert or update of owner_password, data on public.stores
for each row execute function public.scrub_store_cloud_secrets();

-- Purge existing plaintext owner/recovery credentials. The trigger performs the
-- same scrub on every future cloud write, including older cached clients.
update public.stores
set owner_password = null,
    data = coalesce(data, '{}'::jsonb);

-- Replace the legacy public base-table policies with authenticated ownership.
drop policy if exists "Allow public SELECT on stores" on public.stores;
drop policy if exists "Allow public INSERT on stores" on public.stores;
drop policy if exists "Allow UPDATE on stores by owner" on public.stores;
drop policy if exists "Allow DELETE on stores by owner" on public.stores;

create policy "Store owners and members SELECT stores"
on public.stores
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = stores.owner_id
      and p.auth_user_id = (select auth.uid())
  )
  or public.is_store_member(stores.id)
);

create policy "Authenticated owners INSERT stores"
on public.stores
for insert
to authenticated
with check (
  owner_id is not null
  and exists (
    select 1 from public.profiles p
    where p.id = stores.owner_id
      and p.auth_user_id = (select auth.uid())
  )
);

create policy "Store owners UPDATE stores"
on public.stores
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = stores.owner_id
      and p.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = stores.owner_id
      and p.auth_user_id = (select auth.uid())
  )
);

create policy "Store owners DELETE stores"
on public.stores
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = stores.owner_id
      and p.auth_user_id = (select auth.uid())
  )
);

revoke select, insert, update, delete on public.stores from anon;
grant select, insert, update, delete on public.stores to authenticated;

-- Cached merchant clients may still know the old function name. Keep its
-- historical jsonb return type and parameter defaults, but ignore the supplied
-- password completely and delegate ownership proof to Supabase Auth.
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
security invoker
set search_path = public
as $$
declare
  v_store_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_store_id := public.publish_storefront_authenticated(
    p_access_code,
    p_marketplace_settings,
    p_business_template,
    p_laundry_pricing,
    p_business_name,
    p_business_type
  );

  return jsonb_build_object('success', true, 'store_id', v_store_id);
end;
$$;

revoke all on function public.publish_storefront_from_owner(text,text,jsonb,jsonb,jsonb,text,text) from public, anon;
grant execute on function public.publish_storefront_from_owner(text,text,jsonb,jsonb,jsonb,text,text) to authenticated;

-- Default EXECUTE grants in this project include anon, so revoke it explicitly
-- from the Auth-only publisher as well.
revoke all on function public.publish_storefront_authenticated(text,jsonb,jsonb,jsonb,text,text) from public, anon;
grant execute on function public.publish_storefront_authenticated(text,jsonb,jsonb,jsonb,text,text) to authenticated;
