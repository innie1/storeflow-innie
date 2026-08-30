create or replace function public.create_laundry_walkin_v2(
  p_access_code text,
  p_client_ref text,
  p_tag_code text,
  p_customer_name text,
  p_customer_phone text,
  p_service_id text,
  p_service_name text,
  p_pricing text,
  p_billing_quantity numeric,
  p_total numeric,
  p_notes text,
  p_garments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_store public.stores%rowtype;
  v_order_id uuid;
  v_existing_tag text;
  v_tag text := upper(trim(coalesce(p_tag_code,'')));
  v_piece_count integer := 0;
  v_garment jsonb;
  v_type text;
  v_qty integer;
  v_sequence integer := 1;
  v_summary text := '';
  v_meta jsonb;
  v_unit_price numeric := 0;
  v_line_subtotal numeric := 0;
  v_lines_total numeric := 0;
  v_adjustment numeric := 0;
  v_details jsonb := '{}'::jsonb;
  v_instructions text := '';
begin
  if nullif(trim(coalesce(p_access_code,'')),'') is null then raise exception 'Store access code is required'; end if;
  if nullif(trim(coalesce(p_client_ref,'')),'') is null then raise exception 'Client reference is required'; end if;
  if length(p_client_ref) > 120 then raise exception 'Client reference is too long'; end if;
  if v_tag !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception 'Laundry tag must be six handwritten-friendly characters'; end if;

  select * into v_store
  from public.stores s
  where upper(s.access_code) = upper(trim(p_access_code))
  limit 1;

  if not found then raise exception 'Store not found'; end if;
  if v_store.business_type <> 'laundry' then raise exception 'This store is not a laundry business'; end if;
  if coalesce(v_store.subscription_status,'active') <> 'active' then raise exception 'Store is not active'; end if;

  select o.id, o.order_number into v_order_id, v_existing_tag
  from public.orders o
  where o.store_id = v_store.id and o.client_ref = p_client_ref
  limit 1;
  if found then
    return jsonb_build_object(
      'order_id', v_order_id,
      'tag_code', v_existing_tag,
      'receipt_number', v_existing_tag,
      'already_synced', true
    );
  end if;

  if exists(
    select 1 from public.orders o
    where o.store_id = v_store.id and upper(coalesce(o.order_number,'')) = v_tag
  ) then
    raise exception 'Laundry tag already exists for this store';
  end if;

  if nullif(trim(coalesce(p_customer_name,'')),'') is null then raise exception 'Customer name is required'; end if;
  if nullif(trim(coalesce(p_customer_phone,'')),'') is null then raise exception 'Customer phone number is required'; end if;
  if length(regexp_replace(p_customer_phone, '[^0-9]', '', 'g')) < 7 then raise exception 'Customer phone number is invalid'; end if;
  if nullif(trim(coalesce(p_service_name,'')),'') is null then raise exception 'Service is required'; end if;
  if coalesce(p_total,-1) < 0 then raise exception 'Invalid total'; end if;
  if jsonb_typeof(p_garments) <> 'array' or jsonb_array_length(p_garments) = 0 then raise exception 'Record at least one clothing item'; end if;

  for v_garment in select value from jsonb_array_elements(p_garments)
  loop
    v_type := trim(coalesce(v_garment->>'garment_type',''));
    v_qty := greatest(0, floor(coalesce(nullif(v_garment->>'quantity','')::numeric,0))::integer);
    if v_type = '' or v_qty < 1 then raise exception 'Invalid clothing item'; end if;
    v_piece_count := v_piece_count + v_qty;
    v_summary := v_summary || case when v_summary='' then '' else ', ' end || v_qty || ' ' || v_type;
  end loop;

  begin
    v_details := coalesce(p_notes, '{}')::jsonb;
    if jsonb_typeof(v_details) <> 'object' then v_details := jsonb_build_object('instructions', coalesce(p_notes, '')); end if;
  exception when others then
    v_details := jsonb_build_object('instructions', coalesce(p_notes, ''));
  end;
  v_instructions := coalesce(nullif(trim(v_details->>'instructions'), ''), 'Walk-in laundry: ' || v_summary);

  v_meta := jsonb_build_object(
    'source','walk_in_laundry',
    'intake_type','physical_store',
    'client_ref',p_client_ref,
    'service_id',coalesce(p_service_id,''),
    'service_name',p_service_name,
    'pricing',coalesce(p_pricing,'fixed'),
    'billing_quantity',p_billing_quantity,
    'garment_count',v_piece_count,
    'garment_summary',v_summary,
    'garment_lines',p_garments,
    'receipt_number',v_tag,
    'tag_code',v_tag,
    'instructions',v_instructions,
    'customer_address',coalesce(v_details->>'customer_address',''),
    'promised_for',coalesce(v_details->>'promised_for',''),
    'wash_method_id',coalesce(v_details->>'wash_method_id',''),
    'wash_method_name',coalesce(v_details->>'wash_method_name',''),
    'dry_method_id',coalesce(v_details->>'dry_method_id',''),
    'dry_method_name',coalesce(v_details->>'dry_method_name','')
  );

  begin
    insert into public.orders(
      store_id, customer_name, customer_phone, order_number, status,
      subtotal, discount, total, notes, business_type, order_kind,
      workflow_stage, service_metadata, client_ref
    ) values (
      v_store.id, trim(p_customer_name), trim(p_customer_phone), v_tag, 'Accepted',
      p_total, 0, p_total, v_meta::text, 'laundry', 'service',
      'received', v_meta, p_client_ref
    ) returning id into v_order_id;
  exception when unique_violation then
    select o.id, o.order_number into v_order_id, v_existing_tag
    from public.orders o
    where o.store_id = v_store.id and o.client_ref = p_client_ref
    limit 1;
    if found then
      return jsonb_build_object('order_id',v_order_id,'tag_code',v_existing_tag,'receipt_number',v_existing_tag,'already_synced',true);
    end if;
    raise;
  end;

  if lower(coalesce(p_pricing,'')) <> 'per_piece' then
    insert into public.order_items(
      order_id, product_id, offering_id, item_kind, item_name, unit,
      quantity, price, subtotal, options, metadata
    ) values (
      v_order_id,'walkin:'||coalesce(p_service_id,'service')||':charge',coalesce(p_service_id,''),'service',
      p_service_name||' — Service charge','service',1,p_total,p_total,
      jsonb_build_object('service_name',p_service_name,'pricing',coalesce(p_pricing,'fixed'),'billing_quantity',p_billing_quantity),
      jsonb_build_object('source','walk_in_laundry','charge_line',true,'client_ref',p_client_ref)
    );
  end if;

  for v_garment in select value from jsonb_array_elements(p_garments)
  loop
    v_type := trim(v_garment->>'garment_type');
    v_qty := floor((v_garment->>'quantity')::numeric)::integer;
    v_unit_price := case
      when coalesce(v_garment->>'unit_price','') ~ '^[0-9]+([.][0-9]+)?$' then greatest(0,(v_garment->>'unit_price')::numeric)
      else 0
    end;
    v_line_subtotal := case
      when coalesce(v_garment->>'subtotal','') ~ '^[0-9]+([.][0-9]+)?$' then greatest(0,(v_garment->>'subtotal')::numeric)
      else v_unit_price * v_qty
    end;

    insert into public.order_items(
      order_id, product_id, offering_id, item_kind, item_name, unit,
      quantity, price, subtotal, options, metadata
    ) values (
      v_order_id,'walkin:'||coalesce(p_service_id,'service')||':'||lower(regexp_replace(v_type,'[^a-zA-Z0-9]+','-','g')),
      coalesce(p_service_id,''),'service',v_type,'pcs',v_qty,
      case when lower(coalesce(p_pricing,''))='per_piece' then v_unit_price else 0 end,
      case when lower(coalesce(p_pricing,''))='per_piece' then v_line_subtotal else 0 end,
      jsonb_build_object('service_name',p_service_name,'pricing',coalesce(p_pricing,'fixed'),'unit_price',v_unit_price),
      jsonb_build_object(
        'source','walk_in_laundry',
        'identification_only',lower(coalesce(p_pricing,''))<>'per_piece',
        'garment_price_snapshot',lower(coalesce(p_pricing,''))='per_piece',
        'client_ref',p_client_ref
      )
    );

    if lower(coalesce(p_pricing,''))='per_piece' then
      v_lines_total := v_lines_total + v_line_subtotal;
    end if;

    for i in 1..v_qty loop
      insert into public.laundry_order_items(
        order_id, store_id, garment_type, tag_code, quantity,
        special_instructions, workflow_stage, metadata
      ) values (
        v_order_id,v_store.id,v_type,v_tag,1,nullif(v_instructions,''),'received',
        jsonb_build_object(
          'source','walk_in_laundry',
          'sequence',v_sequence,
          'client_ref',p_client_ref,
          'service_id',coalesce(p_service_id,''),
          'service_name',p_service_name,
          'unit_price',v_unit_price
        )
      );
      v_sequence := v_sequence + 1;
    end loop;
  end loop;

  if lower(coalesce(p_pricing,''))='per_piece' then
    v_adjustment := p_total - v_lines_total;
    if abs(v_adjustment) >= 0.01 then
      insert into public.order_items(
        order_id, product_id, offering_id, item_kind, item_name, unit,
        quantity, price, subtotal, options, metadata
      ) values (
        v_order_id,'walkin:'||coalesce(p_service_id,'service')||':adjustment',coalesce(p_service_id,''),'service',
        'Price adjustment','service',1,v_adjustment,v_adjustment,
        jsonb_build_object('service_name',p_service_name,'pricing','per_piece'),
        jsonb_build_object('source','walk_in_laundry','charge_line',true,'price_adjustment',true,'client_ref',p_client_ref)
      );
    end if;
  end if;

  return jsonb_build_object(
    'order_id',v_order_id,
    'tag_code',v_tag,
    'receipt_number',v_tag,
    'piece_count',v_piece_count,
    'garment_summary',v_summary,
    'already_synced',false
  );
end;
$function$;
