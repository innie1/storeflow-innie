-- Resolve the matching base row before running the expensive stores_public JSON
-- sanitization. The previous OR-heavy view query expanded every store payload
-- first and regularly exceeded the customer API statement timeout.

create or replace function public.get_public_storefront(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_store_uuid uuid;
  v_key text := trim(coalesce(p_key, ''));
  v_upper text;
  v_no_sf text;
begin
  if v_key = '' then return null; end if;

  v_key := regexp_replace(v_key, '[?#].*$', '');
  v_key := regexp_replace(v_key, '/+$', '');
  if v_key ~* '^https?://' then
    v_key := regexp_replace(v_key, '^https?://[^/]+/(?:s|store)/', '', 'i');
    v_key := split_part(v_key, '/', 1);
  end if;
  v_upper := upper(v_key);
  v_no_sf := regexp_replace(v_upper, '^SF-', '');

  perform public.check_rate_limit('get_public_storefront', lower(v_key), 180, 600);

  begin
    v_store_uuid := v_key::uuid;
    if not exists (select 1 from public.stores where id = v_store_uuid) then v_store_uuid := null; end if;
  exception when invalid_text_representation then
    v_store_uuid := null;
  end;

  if v_store_uuid is null then
    select s.id into v_store_uuid
    from public.stores s
    where s.store_id in (v_key, v_upper, 'SF-' || v_no_sf)
       or s.access_code in (v_key, v_upper, v_no_sf)
    limit 1;
  end if;

  if v_store_uuid is null then
    select s.id into v_store_uuid
    from public.stores s
    where upper(coalesce(s.store_id, '')) in (v_upper, 'SF-' || v_no_sf)
       or upper(coalesce(s.access_code, '')) in (v_upper, v_no_sf)
       or upper(coalesce(s.data->>'storeId', '')) = v_upper
       or upper(coalesce(s.data->>'accessCode', '')) in (v_upper, v_no_sf)
       or upper(coalesce(s.data->'profile'->>'uniqueCode', '')) = v_upper
       or lower(coalesce(s.qr_code, '')) = lower(p_key)
    limit 1;
  end if;

  if v_store_uuid is null then return null; end if;

  select to_jsonb(x) into v_result
  from (
    select sp.id, sp.store_id, sp.business_name, sp.currency, sp.country, sp.state, sp.city, sp.address,
           sp.phone, sp.email, sp.logo, sp.subscription_status, sp.access_code, sp.qr_code, sp.data
    from public.stores_public sp
    where sp.id = v_store_uuid
    limit 1
  ) x;

  return v_result;
end;
$$;

revoke all on function public.get_public_storefront(text) from public;
grant execute on function public.get_public_storefront(text) to anon, authenticated;

