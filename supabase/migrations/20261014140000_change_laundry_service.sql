-- Change the service on a bundle already taken in - "Full service" tagged on
-- clothes that only came for ironing - with the reason, and who did it.
--
-- A bundle was fixed once it reached the cloud: create_laundry_walkin_v2
-- ignores a second send, and only the stage could move after that. This
-- changes the service, its price and the clothes' prices, and keeps the last
-- ten changes on the bundle (`service_changes`) so the owner's phone - which
-- already downloads every bundle - can tell the owner and correct what the
-- customer owes. Refused once a bundle has been collected.
--
-- One small update per change; nothing runs unless somebody changes a
-- service. The same door as the stage (the shop's access code), and a
-- worker's version that names the signed-in worker.

create or replace function public.change_laundry_service(
  p_access_code text, p_client_ref text, p_service_id text, p_service_name text, p_pricing text,
  p_billing_quantity numeric, p_total numeric, p_garments jsonb, p_reason text,
  p_by_name text default null, p_by_role text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_store public.stores%rowtype;
  v_order public.orders%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 200);
  v_pricing text := lower(coalesce(nullif(trim(p_pricing), ''), 'fixed'));
  v_garment jsonb;
  v_type text;
  v_qty integer;
  v_unit_price numeric;
  v_line_subtotal numeric;
  v_lines_total numeric := 0;
  v_change jsonb;
begin
  if nullif(trim(coalesce(p_access_code,'')),'') is null then raise exception 'Store access code is required'; end if;
  if nullif(trim(coalesce(p_client_ref,'')),'') is null then raise exception 'Client reference is required'; end if;
  if nullif(trim(coalesce(p_service_name,'')),'') is null then raise exception 'Service is required'; end if;
  if v_reason = '' then raise exception 'Say why the service is changing'; end if;
  if coalesce(p_total, -1) < 0 then raise exception 'Invalid total'; end if;
  if jsonb_typeof(p_garments) <> 'array' or jsonb_array_length(p_garments) = 0 then raise exception 'Record at least one clothing item'; end if;

  select * into v_store from public.stores s where upper(s.access_code) = upper(trim(p_access_code)) limit 1;
  if not found then raise exception 'Store not found'; end if;
  if v_store.business_type <> 'laundry' then raise exception 'This store is not a laundry business'; end if;

  select * into v_order from public.orders o
    where o.store_id = v_store.id and o.client_ref = p_client_ref and o.business_type = 'laundry' and o.order_kind = 'service'
    limit 1
    for update;
  if not found then raise exception 'Laundry record not found'; end if;
  if v_order.workflow_stage = 'collected' then raise exception 'This bundle has already been collected'; end if;

  v_change := jsonb_strip_nulls(jsonb_build_object(
    'at', now(),
    'from_id', v_order.service_metadata->>'service_id', 'from', v_order.service_metadata->>'service_name',
    'to_id', coalesce(p_service_id, ''), 'to', trim(p_service_name),
    'from_total', v_order.total, 'to_total', round(p_total, 2),
    'reason', v_reason,
    'by', nullif(left(trim(coalesce(p_by_name, '')), 60), ''),
    'role', nullif(left(trim(coalesce(p_by_role, '')), 30), '')));

  update public.orders o set
    subtotal = round(p_total, 2),
    total = round(p_total, 2),
    updated_at = now(),
    -- The list price was for the old service; the change itself is what the owner is told about now.
    service_metadata = (coalesce(o.service_metadata, '{}'::jsonb) - 'list_price')
      || jsonb_build_object(
        'service_id', coalesce(p_service_id, ''),
        'service_name', trim(p_service_name),
        'pricing', v_pricing,
        'billing_quantity', p_billing_quantity,
        'garment_lines', p_garments,
        'service_changes', (
          select coalesce(jsonb_agg(step order by n), '[]'::jsonb) from (
            select step, n from jsonb_array_elements(
              case when jsonb_typeof(o.service_metadata->'service_changes') = 'array' then o.service_metadata->'service_changes' else '[]'::jsonb end
              || jsonb_build_array(v_change)
            ) with ordinality as h(step, n)
            order by n desc limit 10
          ) kept))
  where o.id = v_order.id;

  -- The order's lines, priced for the new service, as a new bundle's are.
  delete from public.order_items where order_id = v_order.id;
  if v_pricing <> 'per_piece' then
    insert into public.order_items(order_id, product_id, offering_id, item_kind, item_name, unit, quantity, price, subtotal, options, metadata)
    values (
      v_order.id, 'walkin:'||coalesce(p_service_id,'service')||':charge', coalesce(p_service_id,''), 'service',
      trim(p_service_name)||' — Service charge', 'service', 1, round(p_total, 2), round(p_total, 2),
      jsonb_build_object('service_name', trim(p_service_name), 'pricing', v_pricing, 'billing_quantity', p_billing_quantity),
      jsonb_build_object('source','walk_in_laundry','charge_line',true,'client_ref',p_client_ref));
  end if;

  for v_garment in select value from jsonb_array_elements(p_garments) loop
    v_type := trim(coalesce(v_garment->>'garment_type', ''));
    v_qty := greatest(0, floor(coalesce(nullif(v_garment->>'quantity','')::numeric, 0))::integer);
    if v_type = '' or v_qty < 1 then raise exception 'Invalid clothing item'; end if;
    v_unit_price := case when coalesce(v_garment->>'unit_price','') ~ '^[0-9]+([.][0-9]+)?$' then (v_garment->>'unit_price')::numeric else 0 end;
    v_line_subtotal := case when coalesce(v_garment->>'subtotal','') ~ '^[0-9]+([.][0-9]+)?$' then (v_garment->>'subtotal')::numeric else v_unit_price * v_qty end;
    insert into public.order_items(order_id, product_id, offering_id, item_kind, item_name, unit, quantity, price, subtotal, options, metadata)
    values (
      v_order.id, 'walkin:'||coalesce(p_service_id,'service')||':'||lower(regexp_replace(v_type,'[^a-zA-Z0-9]+','-','g')),
      coalesce(p_service_id,''), 'service', v_type, 'pcs', v_qty,
      case when v_pricing = 'per_piece' then v_unit_price else 0 end,
      case when v_pricing = 'per_piece' then v_line_subtotal else 0 end,
      jsonb_build_object('service_name', trim(p_service_name), 'pricing', v_pricing, 'unit_price', v_unit_price),
      jsonb_build_object('source','walk_in_laundry','identification_only', v_pricing <> 'per_piece','garment_price_snapshot', v_pricing = 'per_piece','client_ref',p_client_ref));
    if v_pricing = 'per_piece' then v_lines_total := v_lines_total + v_line_subtotal; end if;
  end loop;

  if v_pricing = 'per_piece' and abs(p_total - v_lines_total) >= 0.01 then
    insert into public.order_items(order_id, product_id, offering_id, item_kind, item_name, unit, quantity, price, subtotal, options, metadata)
    values (
      v_order.id, 'walkin:'||coalesce(p_service_id,'service')||':adjustment', coalesce(p_service_id,''), 'service',
      'Price adjustment', 'service', 1, p_total - v_lines_total, p_total - v_lines_total,
      jsonb_build_object('service_name', trim(p_service_name), 'pricing', 'per_piece'),
      jsonb_build_object('source','walk_in_laundry','charge_line',true,'price_adjustment',true,'client_ref',p_client_ref));
  end if;

  update public.laundry_order_items
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('service_id', coalesce(p_service_id,''), 'service_name', trim(p_service_name)),
        updated_at = now()
    where order_id = v_order.id;

  -- The bundle as it now stands, so the phone that changed it shows it at once.
  return (
    select (to_jsonb(o) - 'access_token' - 'customer_uuid')
      || jsonb_build_object('order_items', coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id = o.id), '[]'::jsonb))
    from public.orders o where o.id = v_order.id);
end;
$function$;

revoke all on function public.change_laundry_service(text, text, text, text, text, numeric, numeric, jsonb, text, text, text) from public;
grant execute on function public.change_laundry_service(text, text, text, text, text, numeric, numeric, jsonb, text, text, text) to anon, authenticated;

create or replace function public.staff_change_laundry_service(
  p_token text, p_device_key text, p_client_ref text, p_service_id text, p_service_name text, p_pricing text,
  p_billing_quantity numeric, p_total numeric, p_garments jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
  v_order jsonb;
begin
  select * into v from public.staff_session_check(p_token, p_device_key);
  if v.o_error is not null then return jsonb_build_object('ok', false, 'error', v.o_error); end if;
  if not public.staff_works_laundry(v.o_worker) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  v_order := public.change_laundry_service((v.o_store).access_code, p_client_ref, p_service_id, p_service_name, p_pricing,
    p_billing_quantity, p_total, p_garments, p_reason, v.o_worker->>'name', v.o_worker->>'role');
  update public.staff_devices set last_seen_at = now() where id = v.o_device_id;
  return jsonb_build_object('ok', true, 'order', v_order);
end;
$function$;

revoke all on function public.staff_change_laundry_service(text, text, text, text, text, text, numeric, numeric, jsonb, text) from public;
grant execute on function public.staff_change_laundry_service(text, text, text, text, text, text, numeric, numeric, jsonb, text) to anon, authenticated;
