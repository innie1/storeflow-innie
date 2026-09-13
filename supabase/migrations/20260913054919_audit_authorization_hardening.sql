-- Reconcile verified production customer protections and secure merchant laundry.
-- No customer records are modified by this migration.


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
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_access_code,'')),'') is null then raise exception 'Store access code is required'; end if;
  if nullif(trim(coalesce(p_client_ref,'')),'') is null then raise exception 'Client reference is required'; end if;
  if length(p_client_ref) > 120 then raise exception 'Client reference is too long'; end if;
  if v_tag !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception 'Laundry tag must be six handwritten-friendly characters'; end if;

  select * into v_store
  from public.stores s
  where upper(s.access_code) = upper(trim(p_access_code))
  limit 1;

  if not found then raise exception 'Store not found'; end if;
  if not public.is_store_member(v_store.id) then
    raise exception 'Not authorized for this store' using errcode = '42501';
  end if;
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
  -- Merchant walk-ins can omit a phone; validate it when supplied.
  if nullif(trim(coalesce(p_customer_phone,'')), '') is not null
     and length(regexp_replace(p_customer_phone, '[^0-9]', '', 'g')) < 7 then
    raise exception 'Customer phone number is invalid';
  end if;
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
      v_store.id, trim(p_customer_name), trim(coalesce(p_customer_phone,'')), v_tag, 'Accepted',
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

create or replace function public.update_laundry_walkin_stage(
  p_access_code text,
  p_client_ref text,
  p_stage text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_store public.stores%rowtype;
  v_order_id uuid;
  v_stage text := lower(trim(coalesce(p_stage,'')));
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_access_code,'')),'') is null then raise exception 'Store access code is required'; end if;
  if nullif(trim(coalesce(p_client_ref,'')),'') is null then raise exception 'Client reference is required'; end if;
  if v_stage not in ('received','washing','drying','ironing','folding','ready','collected') then
    raise exception 'Invalid laundry stage';
  end if;

  select * into v_store
  from public.stores s
  where upper(s.access_code)=upper(trim(p_access_code))
  limit 1;

  if not found then raise exception 'Store not found'; end if;
  if not public.is_store_member(v_store.id) then
    raise exception 'Not authorized for this store' using errcode = '42501';
  end if;
  if v_store.business_type <> 'laundry' then raise exception 'This store is not a laundry business'; end if;
  if coalesce(v_store.subscription_status,'active') <> 'active' then raise exception 'Store is not active'; end if;

  select o.id into v_order_id
  from public.orders o
  where o.store_id=v_store.id
    and o.client_ref=p_client_ref
    and o.business_type='laundry'
    and o.order_kind='service'
  limit 1;

  if not found then raise exception 'Laundry record not found'; end if;

  v_status := case
    when v_stage='received' then 'Accepted'
    when v_stage='ready' then 'Ready'
    when v_stage='collected' then 'Completed'
    else 'Preparing'
  end;

  update public.orders
  set workflow_stage=v_stage,
      status=v_status,
      updated_at=now(),
      service_metadata=coalesce(service_metadata,'{}'::jsonb) || jsonb_build_object('workflow_stage',v_stage,'stage_updated_at',now())
  where id=v_order_id;

  update public.laundry_order_items
  set workflow_stage=v_stage,
      updated_at=now()
  where order_id=v_order_id;

  return jsonb_build_object('order_id',v_order_id,'workflow_stage',v_stage,'status',v_status,'updated_at',now());
end;
$function$;


revoke all on function public.create_laundry_walkin_v2(text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb) from public, anon;
grant execute on function public.create_laundry_walkin_v2(text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb) to authenticated;
revoke all on function public.update_laundry_walkin_stage(text,text,text) from public, anon;
grant execute on function public.update_laundry_walkin_stage(text,text,text) to authenticated;


CREATE OR REPLACE FUNCTION public.customer_approve_order_changes(p_order_id uuid, p_customer_phone text, p_access_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order record;
  v_notes jsonb;
begin
  perform public.check_rate_limit('customer_approve_order_changes', p_order_id::text, 10, 600);
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if nullif(trim(coalesce(p_access_token, '')), '') is null
     or v_order.access_token::text is distinct from p_access_token then
    raise exception 'Not authorized to modify this order' using errcode = '42501';
  end if;
  begin
    v_notes := coalesce(v_order.notes::jsonb, '{}'::jsonb);
  exception when others then
    v_notes := jsonb_build_object('instructions', v_order.notes);
  end;
  v_notes := v_notes || jsonb_build_object('customer_approved_changes', true);
  update public.orders set notes = v_notes::text, updated_at = now() where id = p_order_id;
  return jsonb_build_object('success', true, 'change_request_message', v_notes->>'change_request_message');
end;
$function$;

CREATE OR REPLACE FUNCTION public.customer_cancel_order(p_order_id uuid, p_customer_phone text, p_reason text DEFAULT NULL::text, p_access_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order record;
  v_notes jsonb;
begin
  perform public.check_rate_limit('customer_cancel_order', p_order_id::text, 10, 600);
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if nullif(trim(coalesce(p_access_token, '')), '') is null
     or v_order.access_token::text is distinct from p_access_token then
    raise exception 'Not authorized to cancel this order' using errcode = '42501';
  end if;
  if v_order.status not in ('Pending', 'Accepted') then
    raise exception 'Order can no longer be cancelled (current status: %)', v_order.status;
  end if;
  begin
    v_notes := coalesce(v_order.notes::jsonb, '{}'::jsonb);
  exception when others then
    v_notes := jsonb_build_object('instructions', v_order.notes);
  end;
  v_notes := v_notes || jsonb_build_object('customer_cancelled', true);
  if p_reason is not null and length(trim(p_reason)) > 0 then
    v_notes := v_notes || jsonb_build_object('customer_cancel_reason', p_reason);
  end if;
  update public.orders set status = 'Cancelled', notes = v_notes::text, updated_at = now() where id = p_order_id;
  return jsonb_build_object('success', true, 'status', 'Cancelled');
end;
$function$;




revoke all on function public.customer_cancel_order(uuid,text,text,text) from public;
revoke all on function public.customer_approve_order_changes(uuid,text,text) from public;
grant execute on function public.customer_cancel_order(uuid,text,text,text) to anon, authenticated;
grant execute on function public.customer_approve_order_changes(uuid,text,text) to anon, authenticated;
-- Some installations predate these legacy functions. Revoke only existing signatures.
do $$
declare legacy text;
begin
  foreach legacy in array array['public.get_customer_orders(text)', 'public.get_order_access_token(uuid,text)', 'public.get_customer_order_status(uuid,text)'] loop
    if to_regprocedure(legacy) is not null then
      execute 'revoke all on function ' || legacy || ' from public, anon, authenticated';
    end if;
  end loop;
end;
$$;

revoke insert on public.orders, public.order_items from anon;
drop policy if exists "Orders INSERT" on public.orders;
drop policy if exists "Order Items INSERT" on public.order_items;
drop policy if exists "Customer orders INSERT" on public.orders;
drop policy if exists "Customer order items INSERT" on public.order_items;
-- Retain the existing member-scoped INSERT policies.

