-- Restore guest/customer checkout without reopening direct reads on public.stores.
-- Prices, item names and store identity are resolved from the merchant's own
-- published store payload so clients cannot submit a different catalogue.

create or replace function public.customer_place_storefront_order(
  p_store_key text,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb,
  p_notes text default '',
  p_fulfillment text default 'pickup'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_key text := trim(coalesce(p_store_key, ''));
  v_upper text;
  v_no_sf text;
  v_item jsonb;
  v_catalog_item jsonb;
  v_order_id uuid;
  v_order_number text;
  v_quantity numeric;
  v_price numeric;
  v_subtotal numeric := 0;
  v_is_service boolean;
  v_item_kind text;
  v_item_count integer;
begin
  if v_key = '' then raise exception 'Store is required'; end if;
  if nullif(trim(coalesce(p_customer_name, '')), '') is null then raise exception 'Customer name is required'; end if;
  if nullif(trim(coalesce(p_customer_phone, '')), '') is null then raise exception 'Customer phone is required'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Order items must be an array'; end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 50 then raise exception 'Choose between 1 and 50 items'; end if;
  if p_fulfillment not in ('pickup', 'delivery') then raise exception 'Invalid fulfillment option'; end if;

  v_key := regexp_replace(v_key, '[?#].*$', '');
  v_key := regexp_replace(v_key, '/+$', '');
  if v_key ~* '^https?://' then
    v_key := regexp_replace(v_key, '^https?://[^/]+/(?:s|store)/', '', 'i');
    v_key := split_part(v_key, '/', 1);
  end if;
  v_upper := upper(v_key);
  v_no_sf := regexp_replace(v_upper, '^SF-', '');

  perform public.check_rate_limit('customer_place_storefront_order', lower(trim(p_customer_phone)), 12, 600);

  select s.* into v_store
  from public.stores s
  where s.id::text = v_key
     or upper(coalesce(s.store_id, '')) = v_upper
     or upper(coalesce(s.store_id, '')) = 'SF-' || v_no_sf
     or upper(coalesce(s.access_code, '')) in (v_upper, v_no_sf)
     or upper(coalesce(s.data->>'storeId', '')) = v_upper
     or upper(coalesce(s.data->>'accessCode', '')) in (v_upper, v_no_sf)
     or upper(coalesce(s.data->'profile'->>'uniqueCode', '')) = v_upper
  order by case when s.id::text = v_key then 1 when upper(coalesce(s.store_id, '')) = v_upper then 2 else 3 end
  limit 1;

  if v_store.id is null then raise exception 'Store not found'; end if;
  if coalesce(v_store.subscription_status, 'active') <> 'active' then raise exception 'This store is unavailable'; end if;
  if coalesce((v_store.data->'marketplaceSettings'->>'onlineOrdersEnabled')::boolean, true) is false
     or coalesce((v_store.data->'marketplaceSettings'->>'temporarilyHidden')::boolean, false) is true then
    raise exception 'This store is not accepting online orders';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    if v_quantity <= 0 or v_quantity > 10000 then raise exception 'Invalid item quantity'; end if;

    select product into v_catalog_item
    from jsonb_array_elements(coalesce(v_store.data->'products', '[]'::jsonb)) product
    where product->>'id' = v_item->>'offering_id'
      and coalesce((product->>'discontinued')::boolean, false) is false
    limit 1;

    if v_catalog_item is null then raise exception 'An item is no longer offered by this store'; end if;

    v_is_service := coalesce((v_catalog_item->>'isService')::boolean, false);
    if not v_is_service and coalesce((v_catalog_item->>'quantity')::numeric, 0) < v_quantity then
      raise exception '% does not have enough stock', coalesce(v_catalog_item->>'name', 'Item');
    end if;

    v_price := greatest(0, coalesce(
      case when nullif(v_catalog_item->>'promoPrice', '') is not null
             and (nullif(v_catalog_item->>'promoUntil', '') is null or (v_catalog_item->>'promoUntil')::date >= current_date)
           then (v_catalog_item->>'promoPrice')::numeric end,
      (v_catalog_item->>'sellingPrice')::numeric,
      0
    ));
    v_subtotal := v_subtotal + (v_quantity * v_price);
  end loop;

  v_order_number := 'SF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.orders (
    store_id, customer_name, customer_phone, order_number, status,
    subtotal, discount, total, notes, business_type, order_kind,
    workflow_stage, service_metadata
  ) values (
    v_store.id, trim(p_customer_name), trim(p_customer_phone), v_order_number, 'Pending',
    v_subtotal, 0, v_subtotal, nullif(trim(coalesce(p_notes, '')), ''),
    public.normalize_business_type(coalesce(v_store.data->>'storeType', v_store.business_type, 'other')),
    case when coalesce(v_store.data->>'storeType', v_store.business_type) = 'games' then 'session'
         when exists (select 1 from jsonb_array_elements(p_items) i where coalesce((i->>'is_service')::boolean, false)) then 'service'
         else 'product' end,
    'pending', jsonb_build_object('fulfillment', p_fulfillment, 'source', 'customer_storefront')
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::numeric;
    select product into v_catalog_item
    from jsonb_array_elements(coalesce(v_store.data->'products', '[]'::jsonb)) product
    where product->>'id' = v_item->>'offering_id' limit 1;
    v_is_service := coalesce((v_catalog_item->>'isService')::boolean, false);
    v_item_kind := case
      when not v_is_service then 'product'
      when v_catalog_item->'serviceWorkflow'->>'mode' = 'appointment' then 'appointment'
      when v_catalog_item->'serviceWorkflow'->>'mode' = 'session' then 'session'
      else 'service' end;
    v_price := greatest(0, coalesce(
      case when nullif(v_catalog_item->>'promoPrice', '') is not null
             and (nullif(v_catalog_item->>'promoUntil', '') is null or (v_catalog_item->>'promoUntil')::date >= current_date)
           then (v_catalog_item->>'promoPrice')::numeric end,
      (v_catalog_item->>'sellingPrice')::numeric,
      0
    ));
    insert into public.order_items (
      order_id, product_id, offering_id, item_kind, item_name, quantity,
      price, subtotal, unit, options, metadata
    ) values (
      v_order_id, null, v_catalog_item->>'id', v_item_kind,
      coalesce(v_catalog_item->>'name', 'Item'), v_quantity, v_price,
      v_quantity * v_price, nullif(v_catalog_item->>'unit', ''), '{}'::jsonb,
      jsonb_build_object('source', 'published_store_catalogue')
    );
  end loop;

  return jsonb_build_object(
    'id', v_order_id, 'order_number', v_order_number, 'status', 'Pending',
    'total', v_subtotal, 'store_name', v_store.business_name
  );
end;
$$;

revoke all on function public.customer_place_storefront_order(text,text,text,jsonb,text,text) from public;
grant execute on function public.customer_place_storefront_order(text,text,text,jsonb,text,text) to anon, authenticated;

