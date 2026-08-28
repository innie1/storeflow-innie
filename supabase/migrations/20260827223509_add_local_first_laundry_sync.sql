-- Idempotent background sync endpoint for locally-recorded laundry jobs.
-- The device creates the 6-character tag first, saves locally, then calls this
-- function whenever connectivity is available.

alter table public.orders add column if not exists client_ref text;
create unique index if not exists uq_orders_store_client_ref
  on public.orders(store_id, client_ref)
  where client_ref is not null;
create index if not exists idx_orders_store_order_number_upper
  on public.orders(store_id, upper(order_number))
  where order_number is not null;

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
set search_path = ''
as $$
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
    return jsonb_build_object('order_id',v_order_id,'tag_code',v_existing_tag,'receipt_number',v_existing_tag,'already_synced',true);
  end if;

  if exists(select 1 from public.orders o where o.store_id = v_store.id and upper(coalesce(o.order_number,'')) = v_tag) then
    raise exception 'Laundry tag already exists for this store';
  end if;

  if nullif(trim(coalesce(p_customer_name,'')),'') is null then raise exception 'Customer name is required'; end if;
  if nullif(trim(coalesce(p_service_name,'')),'') is null then raise exception 'Service is required'; end if;
  if coalesce(p_total,-1) < 0 then raise exception 'Invalid total'; end if;
  if jsonb_typeof(p_garments) <> 'array' or jsonb_array_length(p_garments) = 0 then raise exception 'Record at least one clothing item'; end if;

  for v_garment in select value from jsonb_array_elements(p_garments)
  loop
    v_type := trim(coalesce(v_garment->>'garment_type',''));
    v_qty := greatest(0, floor(coalesce((v_garment->>'quantity')::numeric,0))::integer);
    if v_type = '' or v_qty < 1 then raise exception 'Invalid clothing item'; end if;
    v_piece_count := v_piece_count + v_qty;
    v_summary := v_summary || case when v_summary='' then '' else ', ' end || v_qty || ' ' || v_type;
  end loop;

  v_meta := jsonb_build_object(
    'source','walk_in_laundry','intake_type','physical_store','client_ref',p_client_ref,
    'service_id',coalesce(p_service_id,''),'service_name',p_service_name,
    'pricing',coalesce(p_pricing,'fixed'),'billing_quantity',p_billing_quantity,
    'garment_count',v_piece_count,'garment_summary',v_summary,
    'receipt_number',v_tag,'tag_code',v_tag,
    'instructions',coalesce(nullif(trim(coalesce(p_notes,'')),''),'Walk-in laundry: '||v_summary)
  );

  begin
    insert into public.orders(
      store_id, customer_name, customer_phone, order_number, status,
      subtotal, discount, total, notes, business_type, order_kind,
      workflow_stage, service_metadata, client_ref
    ) values (
      v_store.id, trim(p_customer_name), nullif(trim(coalesce(p_customer_phone,'')),''), v_tag, 'Accepted',
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

  insert into public.order_items(
    order_id, product_id, offering_id, item_kind, item_name, unit,
    quantity, price, subtotal, options, metadata
  ) values (
    v_order_id,'walkin:'||coalesce(p_service_id,'service')||':charge',coalesce(p_service_id,''),'service',
    p_service_name||' — Service charge','service',1,p_total,p_total,
    jsonb_build_object('service_name',p_service_name,'pricing',coalesce(p_pricing,'fixed'),'billing_quantity',p_billing_quantity),
    jsonb_build_object('source','walk_in_laundry','charge_line',true,'client_ref',p_client_ref)
  );

  for v_garment in select value from jsonb_array_elements(p_garments)
  loop
    v_type := trim(v_garment->>'garment_type');
    v_qty := floor((v_garment->>'quantity')::numeric)::integer;

    insert into public.order_items(
      order_id, product_id, offering_id, item_kind, item_name, unit,
      quantity, price, subtotal, options, metadata
    ) values (
      v_order_id,'walkin:'||coalesce(p_service_id,'service')||':'||lower(regexp_replace(v_type,'[^a-zA-Z0-9]+','-','g')),
      coalesce(p_service_id,''),'service',v_type,'pcs',v_qty,0,0,
      jsonb_build_object('service_name',p_service_name,'pricing',coalesce(p_pricing,'fixed')),
      jsonb_build_object('source','walk_in_laundry','identification_only',true,'client_ref',p_client_ref)
    );

    for i in 1..v_qty loop
      insert into public.laundry_order_items(
        order_id, store_id, garment_type, tag_code, quantity,
        special_instructions, workflow_stage, metadata
      ) values (
        v_order_id,v_store.id,v_type,v_tag,1,nullif(trim(coalesce(p_notes,'')),''),'received',
        jsonb_build_object('source','walk_in_laundry','sequence',v_sequence,'client_ref',p_client_ref,'service_id',coalesce(p_service_id,''),'service_name',p_service_name)
      );
      v_sequence := v_sequence + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'order_id',v_order_id,'tag_code',v_tag,'receipt_number',v_tag,
    'piece_count',v_piece_count,'garment_summary',v_summary,'already_synced',false
  );
end;
$$;

revoke all on function public.create_laundry_walkin_v2(text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb) from public;
grant execute on function public.create_laundry_walkin_v2(text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb) to anon, authenticated;