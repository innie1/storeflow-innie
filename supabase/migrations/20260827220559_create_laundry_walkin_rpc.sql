-- Atomic physical-store laundry intake. The six-character order number is also
-- the single handwritten tag used on every cloth in the customer bundle.

create or replace function public.create_laundry_walkin(
  p_store_id uuid,
  p_access_code text,
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
  v_tag text;
  v_letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_digits constant text := '23456789';
  v_attempt integer;
  v_piece_count integer;
  v_garment jsonb;
  v_type text;
  v_qty integer;
  v_sequence integer := 1;
  v_summary text := '';
  v_meta jsonb;
begin
  select * into v_store from public.stores s where s.id = p_store_id;
  if not found then raise exception 'Store not found'; end if;
  if v_store.business_type <> 'laundry' then raise exception 'This store is not a laundry business'; end if;
  if coalesce(v_store.subscription_status,'active') <> 'active' then raise exception 'Store is not active'; end if;
  if not public.is_store_member(p_store_id) and coalesce(v_store.access_code,'') <> coalesce(p_access_code,'') then
    raise exception 'Not authorized for this store' using errcode='42501';
  end if;
  if nullif(trim(coalesce(p_customer_name,'')),'') is null then raise exception 'Customer name is required'; end if;
  if nullif(trim(coalesce(p_service_name,'')),'') is null then raise exception 'Service is required'; end if;
  if coalesce(p_total,-1) < 0 then raise exception 'Invalid total'; end if;
  if jsonb_typeof(p_garments) <> 'array' or jsonb_array_length(p_garments) = 0 then raise exception 'Record at least one clothing item'; end if;

  v_piece_count := 0;
  for v_garment in select value from jsonb_array_elements(p_garments)
  loop
    v_type := trim(coalesce(v_garment->>'garment_type',''));
    v_qty := greatest(0, floor(coalesce((v_garment->>'quantity')::numeric,0))::integer);
    if v_type = '' or v_qty < 1 then raise exception 'Invalid clothing item'; end if;
    v_piece_count := v_piece_count + v_qty;
    v_summary := v_summary || case when v_summary='' then '' else ', ' end || v_qty || ' ' || v_type;
  end loop;

  for v_attempt in 1..30 loop
    v_tag := '';
    for i in 1..3 loop
      v_tag := v_tag
        || substr(v_letters, floor(random()*length(v_letters))::integer + 1, 1)
        || substr(v_digits, floor(random()*length(v_digits))::integer + 1, 1);
    end loop;
    exit when not exists(select 1 from public.orders o where o.store_id=p_store_id and upper(o.order_number)=v_tag);
  end loop;
  if exists(select 1 from public.orders o where o.store_id=p_store_id and upper(o.order_number)=v_tag) then raise exception 'Could not generate a unique laundry tag'; end if;

  v_meta := jsonb_build_object(
    'source','walk_in_laundry', 'intake_type','physical_store',
    'service_id',coalesce(p_service_id,''), 'service_name',p_service_name,
    'pricing',coalesce(p_pricing,'fixed'), 'billing_quantity',p_billing_quantity,
    'garment_count',v_piece_count, 'garment_summary',v_summary,
    'receipt_number',v_tag, 'tag_code',v_tag,
    'instructions',coalesce(nullif(trim(coalesce(p_notes,'')),''),'Walk-in laundry: '||v_summary)
  );

  insert into public.orders(store_id,customer_name,customer_phone,order_number,status,subtotal,discount,total,notes,business_type,order_kind,workflow_stage,service_metadata)
  values(p_store_id,trim(p_customer_name),nullif(trim(coalesce(p_customer_phone,'')),''),v_tag,'Accepted',p_total,0,p_total,v_meta::text,'laundry','service','received',v_meta)
  returning id into v_order_id;

  insert into public.order_items(order_id,product_id,offering_id,item_kind,item_name,unit,quantity,price,subtotal,options,metadata)
  values(v_order_id,'walkin:'||coalesce(p_service_id,'service')||':charge',coalesce(p_service_id,''),'service',p_service_name||' — Service charge','service',1,p_total,p_total,
    jsonb_build_object('service_name',p_service_name,'pricing',coalesce(p_pricing,'fixed'),'billing_quantity',p_billing_quantity),
    jsonb_build_object('source','walk_in_laundry','charge_line',true));

  for v_garment in select value from jsonb_array_elements(p_garments)
  loop
    v_type := trim(v_garment->>'garment_type');
    v_qty := floor((v_garment->>'quantity')::numeric)::integer;
    insert into public.order_items(order_id,product_id,offering_id,item_kind,item_name,unit,quantity,price,subtotal,options,metadata)
    values(v_order_id,'walkin:'||coalesce(p_service_id,'service')||':'||lower(regexp_replace(v_type,'[^a-zA-Z0-9]+','-','g')),coalesce(p_service_id,''),'service',v_type,'pcs',v_qty,0,0,
      jsonb_build_object('service_name',p_service_name,'pricing',coalesce(p_pricing,'fixed')),
      jsonb_build_object('source','walk_in_laundry','identification_only',true));
    for i in 1..v_qty loop
      insert into public.laundry_order_items(order_id,store_id,garment_type,tag_code,quantity,special_instructions,workflow_stage,metadata)
      values(v_order_id,p_store_id,v_type,v_tag,1,nullif(trim(coalesce(p_notes,'')),''),'received',jsonb_build_object('source','walk_in_laundry','sequence',v_sequence,'service_id',coalesce(p_service_id,''),'service_name',p_service_name));
      v_sequence := v_sequence + 1;
    end loop;
  end loop;

  return jsonb_build_object('order_id',v_order_id,'tag_code',v_tag,'receipt_number',v_tag,'piece_count',v_piece_count,'garment_summary',v_summary);
end;
$$;

revoke all on function public.create_laundry_walkin(uuid,text,text,text,text,text,text,numeric,numeric,text,jsonb) from public;
grant execute on function public.create_laundry_walkin(uuid,text,text,text,text,text,text,numeric,numeric,text,jsonb) to anon,authenticated;
