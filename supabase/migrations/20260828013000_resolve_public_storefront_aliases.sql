create or replace function public.get_public_storefront(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_key text;
  v_upper text;
  v_no_sf text;
begin
  v_key := trim(coalesce(p_key, ''));
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

  select to_jsonb(x) into v_result
  from (
    select sp.id, sp.store_id, sp.business_name, sp.currency, sp.country, sp.state, sp.city, sp.address,
           sp.phone, sp.email, sp.logo, sp.subscription_status, sp.access_code, sp.qr_code, sp.data
    from public.stores_public sp
    where
      sp.id::text = v_key
      or upper(coalesce(sp.store_id, '')) = v_upper
      or upper(coalesce(sp.store_id, '')) = 'SF-' || v_no_sf
      or upper(coalesce(sp.access_code, '')) = v_upper
      or upper(coalesce(sp.access_code, '')) = v_no_sf
      or upper(coalesce(sp.data->>'storeId', '')) = v_upper
      or upper(coalesce(sp.data->>'accessCode', '')) = v_upper
      or upper(coalesce(sp.data->>'accessCode', '')) = v_no_sf
      or upper(coalesce(sp.data->'profile'->>'uniqueCode', '')) = v_upper
      or lower(coalesce(sp.qr_code, '')) = lower(p_key)
      or lower(coalesce(sp.qr_code, '')) = lower('https://storeflow-customer.vercel.app/s/' || v_key)
    order by
      case
        when sp.id::text = v_key then 1
        when upper(coalesce(sp.store_id, '')) = v_upper then 2
        when upper(coalesce(sp.access_code, '')) = v_upper then 3
        when upper(coalesce(sp.data->>'storeId', '')) = v_upper then 4
        when upper(coalesce(sp.data->>'accessCode', '')) = v_upper then 5
        when upper(coalesce(sp.data->'profile'->>'uniqueCode', '')) = v_upper then 6
        else 7
      end
    limit 1
  ) x;

  return v_result;
end;
$$;

revoke all on function public.get_public_storefront(text) from public;
grant execute on function public.get_public_storefront(text) to anon, authenticated;
