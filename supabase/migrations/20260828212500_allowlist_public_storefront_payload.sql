-- Return an explicit customer allowlist. The former stores_public payload only
-- removed cost fields and could still expose merchant settings and recovery data.

create or replace function public.get_public_storefront(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_key text := trim(coalesce(p_key, ''));
  v_upper text;
  v_no_sf text;
  v_products jsonb;
  v_offerings jsonb;
  v_profile jsonb;
  v_marketplace jsonb;
  v_template jsonb;
  v_public_data jsonb;
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
    select s.* into v_store from public.stores s where s.id = v_key::uuid limit 1;
  exception when invalid_text_representation then
    v_store.id := null;
  end;

  if v_store.id is null then
    select s.* into v_store
    from public.stores s
    where s.store_id in (v_key, v_upper, 'SF-' || v_no_sf)
       or s.access_code in (v_key, v_upper, v_no_sf)
    limit 1;
  end if;

  if v_store.id is null then
    select s.* into v_store
    from public.stores s
    where upper(coalesce(s.store_id, '')) in (v_upper, 'SF-' || v_no_sf)
       or upper(coalesce(s.access_code, '')) in (v_upper, v_no_sf)
       or upper(coalesce(s.data->>'storeId', '')) = v_upper
       or upper(coalesce(s.data->>'accessCode', '')) in (v_upper, v_no_sf)
       or upper(coalesce(s.data->'profile'->>'uniqueCode', '')) = v_upper
       or lower(coalesce(s.qr_code, '')) = lower(p_key)
    limit 1;
  end if;

  if v_store.id is null then return null; end if;

  select coalesce(jsonb_agg(
    item - 'costPrice' - 'cost_price' - 'wholesalePrice' - 'wholesale_price'
         - 'total_profit' - 'totalProfit' - 'priceHistory' - 'initialQuantity'
  ), '[]'::jsonb) into v_products
  from jsonb_array_elements(coalesce(v_store.data->'products', '[]'::jsonb)) item
  where coalesce((item->>'discontinued')::boolean, false) is false;

  select coalesce(jsonb_agg(offering order by ord), '[]'::jsonb) into v_offerings
  from jsonb_array_elements(coalesce(v_store.data->'businessTemplate'->'offerings', '[]'::jsonb))
       with ordinality x(offering, ord)
  where coalesce((offering->>'enabled')::boolean, true)
    and coalesce((offering->>'active')::boolean, true)
    and not coalesce((offering->>'discontinued')::boolean, false)
    and coalesce(lower(offering->>'status'), 'active') not in ('inactive','disabled','hidden','discontinued');

  v_profile := jsonb_build_object(
    'phone', coalesce(v_store.data->'profile'->>'phone', v_store.phone, ''),
    'email', coalesce(v_store.data->'profile'->>'email', v_store.email, ''),
    'location', coalesce(v_store.data->'profile'->>'location', v_store.address, ''),
    'photo', v_store.data->'profile'->>'photo',
    'logoStyle', v_store.data->'profile'->>'logoStyle'
  );

  v_marketplace := jsonb_build_object(
    'description', v_store.data->'marketplaceSettings'->>'description',
    'coverImage', v_store.data->'marketplaceSettings'->>'coverImage',
    'pricingMode', coalesce(v_store.data->'marketplaceSettings'->>'pricingMode', 'retail'),
    'onlineOrdersEnabled', coalesce((v_store.data->'marketplaceSettings'->>'onlineOrdersEnabled')::boolean, true),
    'temporarilyHidden', coalesce((v_store.data->'marketplaceSettings'->>'temporarilyHidden')::boolean, false),
    'storeOpen', coalesce((v_store.data->'marketplaceSettings'->>'storeOpen')::boolean, true),
    'pickupEnabled', coalesce((v_store.data->'marketplaceSettings'->>'pickupEnabled')::boolean, true),
    'deliveryEnabled', coalesce((v_store.data->'marketplaceSettings'->>'deliveryEnabled')::boolean, true),
    'deliveryFee', coalesce((v_store.data->'marketplaceSettings'->>'deliveryFee')::numeric, 0),
    'freeDeliveryThreshold', coalesce((v_store.data->'marketplaceSettings'->>'freeDeliveryThreshold')::numeric, 0),
    'deliveryMinOrder', coalesce((v_store.data->'marketplaceSettings'->>'deliveryMinOrder')::numeric, 0),
    'openingTime', v_store.data->'marketplaceSettings'->>'openingTime',
    'closingTime', v_store.data->'marketplaceSettings'->>'closingTime',
    'businessDays', coalesce(v_store.data->'marketplaceSettings'->'businessDays', '[]'::jsonb)
  );

  v_template := jsonb_build_object(
    'type', coalesce(v_store.data->'businessTemplate'->>'type', v_store.data->>'storeType', v_store.business_type, 'other'),
    'modes', coalesce(v_store.data->'businessTemplate'->'modes', '[]'::jsonb),
    'labels', coalesce(v_store.data->'businessTemplate'->'labels', '{}'::jsonb),
    'customerFeatures', coalesce(v_store.data->'businessTemplate'->'customerFeatures', '{}'::jsonb),
    'customerExperience', coalesce(v_store.data->'businessTemplate'->'customerExperience', '{}'::jsonb),
    'workflow', coalesce(v_store.data->'businessTemplate'->'workflow', '[]'::jsonb),
    'offerings', v_offerings
  );

  v_public_data := jsonb_build_object(
    'storeName', coalesce(v_store.data->>'storeName', v_store.business_name, 'Store'),
    'storeId', coalesce(v_store.data->>'storeId', v_store.store_id),
    'accessCode', coalesce(v_store.data->>'accessCode', v_store.access_code),
    'storeType', coalesce(v_store.data->>'storeType', v_store.data->>'businessType', v_store.business_type, 'other'),
    'businessType', coalesce(v_store.data->>'businessType', v_store.data->>'storeType', v_store.business_type, 'other'),
    'products', v_products,
    'profile', v_profile,
    'marketplaceSettings', v_marketplace,
    'businessTemplate', v_template,
    'laundryPricing', coalesce(v_store.data->'laundryPricing', v_store.data->'businessTemplate'->'laundryPricing', '{}'::jsonb)
  );

  return jsonb_build_object(
    'id', v_store.id,
    'store_id', v_store.store_id,
    'business_name', v_store.business_name,
    'currency', v_store.currency,
    'country', v_store.country,
    'state', v_store.state,
    'city', v_store.city,
    'address', v_store.address,
    'phone', v_store.phone,
    'email', v_store.email,
    'logo', v_store.logo,
    'subscription_status', v_store.subscription_status,
    'access_code', v_store.access_code,
    'qr_code', v_store.qr_code,
    'data', v_public_data
  );
end;
$$;

revoke all on function public.get_public_storefront(text) from public;
grant execute on function public.get_public_storefront(text) to anon, authenticated;

