-- Merchant Flow message/order creation.
-- Creates the order header and all line items in one transaction so realtime
-- consumers never observe a half-created receipt.

create or replace function public.merchant_create_flow_message_order(
  p_store_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb,
  p_order_number text default null,
  p_notes text default null,
  p_business_type text default null,
  p_order_kind text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_qty numeric;
  v_price numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_item_name text;
  v_product_id text;
  v_offering_id text;
  v_item_kind text;
  v_unit text;
  v_order_number text;
  v_items jsonb;
  v_store_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_store_id is null or not public.is_store_member(p_store_id) then
    raise exception 'Not authorized for this store' using errcode = '42501';
  end if;
  if nullif(trim(p_customer_name), '') is null then
    raise exception 'Customer name is required';
  end if;
  if nullif(trim(p_customer_phone), '') is null then
    raise exception 'Customer phone is required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Too many order items';
  end if;

  select business_type into v_store_type from public.stores where id = p_store_id;
  if v_store_type is null then raise exception 'Store not found'; end if;

  -- Validate and calculate the server-side total before inserting anything.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    v_price := coalesce((v_item->>'price')::numeric, 0);
    v_item_name := nullif(trim(v_item->>'item_name'), '');
    if v_qty <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    if v_price < 0 then raise exception 'Item price cannot be negative'; end if;
    if v_item_name is null then raise exception 'Item name is required'; end if;
    v_total := v_total + (v_qty * v_price);
  end loop;

  v_order_number := coalesce(
    nullif(trim(p_order_number), ''),
    'FL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  );

  insert into public.orders (
    store_id, customer_name, customer_phone, order_number, status,
    subtotal, discount, total, notes, business_type, order_kind, workflow_stage,
    service_metadata
  ) values (
    p_store_id, trim(p_customer_name), trim(p_customer_phone), v_order_number, 'Pending',
    v_total, 0, v_total, p_notes,
    public.normalize_business_type(coalesce(nullif(trim(p_business_type), ''), v_store_type, 'other')),
    nullif(trim(p_order_kind), ''), 'pending',
    jsonb_build_object('source', 'flow_message', 'created_by', auth.uid(), 'created_at', now())
  ) returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    v_price := coalesce((v_item->>'price')::numeric, 0);
    v_subtotal := v_qty * v_price;
    v_product_id := nullif(trim(v_item->>'product_id'), '');
    v_offering_id := coalesce(nullif(trim(v_item->>'offering_id'), ''), v_product_id);
    v_item_name := trim(v_item->>'item_name');
    v_item_kind := coalesce(nullif(trim(v_item->>'item_kind'), ''), 'product');
    v_unit := nullif(trim(v_item->>'unit'), '');

    if v_item_kind not in ('product','service','appointment','session','metered','custom') then
      raise exception 'Invalid item kind';
    end if;

    -- If a supplied product id exists in the cloud catalogue, it must belong
    -- to this store. Local-only offering ids are allowed and are preserved as
    -- snapshots through offering_id/item_name.
    if v_product_id is not null
       and exists(select 1 from public.products p where p.id::text = v_product_id)
       and not exists(select 1 from public.products p where p.id::text = v_product_id and p.store_id = p_store_id)
    then
      raise exception 'Order item does not belong to this store';
    end if;

    insert into public.order_items (
      order_id, product_id, quantity, price, subtotal,
      offering_id, item_kind, item_name, unit, options, metadata
    ) values (
      v_order.id, v_product_id, v_qty, v_price, v_subtotal,
      v_offering_id, v_item_kind, v_item_name, v_unit,
      coalesce(v_item->'options', '{}'::jsonb),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id), '[]'::jsonb)
    into v_items
  from public.order_items oi
  where oi.order_id = v_order.id;

  return to_jsonb(v_order) || jsonb_build_object('order_items', v_items);
end;
$$;

revoke all on function public.merchant_create_flow_message_order(uuid,text,text,jsonb,text,text,text,text) from public, anon;
grant execute on function public.merchant_create_flow_message_order(uuid,text,text,jsonb,text,text,text,text) to authenticated;
