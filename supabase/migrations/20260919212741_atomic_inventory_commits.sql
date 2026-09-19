-- One conflict domain for inventory, money and ledgers. No new table or data rewrite.
create or replace function public.merge_inventory_snapshot(p_base jsonb, p_next jsonb, p_remote jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  k text; result jsonb := coalesce(p_remote, '{}'::jsonb);
  financial text[] := array['products','sales','pendingPayments','customers','cashBalance','bankBalance','inventoryMovements','expenses','restocks','investments','trash'];
  changed boolean := false; same_base boolean := true; same_next boolean := true;
begin
  if jsonb_typeof(p_base) <> 'object' or jsonb_typeof(p_next) <> 'object' or jsonb_typeof(result) <> 'object' then
    raise exception 'Store snapshots must be objects';
  end if;
  foreach k in array financial loop
    changed := changed or (p_base->k is distinct from p_next->k);
    same_base := same_base and (p_base->k is not distinct from result->k);
    same_next := same_next and (p_next->k is not distinct from result->k);
  end loop;
  if changed and not same_base and not same_next then
    raise exception 'Another device changed stock or payments. Review your saved records before syncing.' using errcode='40001';
  end if;
  for k in select jsonb_object_keys(p_base || p_next) loop
    if p_base->k is not distinct from p_next->k then continue; end if;
    if result->k is distinct from p_base->k and result->k is distinct from p_next->k then
      raise exception 'Another device changed %. Review your saved records before syncing.', k using errcode='40001';
    end if;
    if p_next ? k then result := jsonb_set(result, array[k], p_next->k, true);
    else result := result - k; end if;
  end loop;
  return result;
end; $$;
revoke all on function public.merge_inventory_snapshot(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.merge_inventory_snapshot(jsonb,jsonb,jsonb) to authenticated;

create or replace function public.commit_store_snapshot(
  p_store_id uuid, p_base jsonb, p_next jsonb, p_order jsonb default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s public.stores%rowtype; o public.orders%rowtype; merged jsonb; desired text; product jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to sync' using errcode='42501'; end if;
  -- Same ordering as existing order triggers: order lock precedes store lock.
  if p_order is not null then
    select * into o from public.orders where id=(p_order->>'id')::uuid and store_id=p_store_id for update;
    if not found then raise exception 'Order not found or access denied' using errcode='42501'; end if;
  end if;
  select * into s from public.stores where id=p_store_id for update;
  if not found or not exists(select 1 from public.profiles p where p.id=s.owner_id and p.auth_user_id=auth.uid()) then
    raise exception 'Only the store owner account can commit store records' using errcode='42501';
  end if;
  if p_order is not null then
    desired := p_order->>'status';
    -- A retry after a lost response is safe only for the same committed result.
    if o.status = desired and public.merge_inventory_snapshot(p_base,p_next,s.data) = s.data then
      return jsonb_build_object('data', s.data, 'order', to_jsonb(o));
    end if;
    if o.updated_at is distinct from (p_order->>'expected_updated_at')::timestamptz then
      raise exception 'Another device changed this order. Refresh it before retrying.' using errcode='40001';
    end if;
    if not (
      (o.status='Pending' and desired in ('Accepted','Rejected','Cancelled')) or
      (o.status='Accepted' and desired in ('Preparing','Cancelled','Rejected')) or
      (o.status='Preparing' and desired in ('Ready','Cancelled','Rejected')) or
      (o.status='Ready' and desired in ('Completed','Cancelled','Rejected'))
    ) then raise exception 'Invalid order status transition'; end if;
  end if;
  merged := public.merge_inventory_snapshot(p_base,p_next,coalesce(s.data,'{}'::jsonb));
  for product in select value from jsonb_array_elements(coalesce(merged->'products','[]'::jsonb)) loop
    if coalesce((product->>'quantity')::numeric,0) < 0 then raise exception 'Stock cannot be negative'; end if;
  end loop;
  update public.stores set data=merged,
    business_name=coalesce(merged->>'storeName',business_name),
    business_type=coalesce(merged->>'storeType',merged->>'category',business_type), updated_at=now()
  where id=p_store_id returning * into s;
  -- Existing relational products are a projection of the same stock snapshot.
  -- IDs created offline need not be UUIDs, so compare text without casting.
  for product in select value from jsonb_array_elements(coalesce(s.data->'products','[]'::jsonb)) loop
    if not coalesce((product->>'isService')::boolean,false) then
      update public.products set quantity=(product->>'quantity')::numeric,
        units_sold=coalesce((product->>'units_sold')::numeric,units_sold),
        total_revenue=coalesce((product->>'total_revenue')::numeric,total_revenue),
        total_profit=coalesce((product->>'total_profit')::numeric,total_profit),updated_at=now()
      where store_id=p_store_id and id::text=product->>'id';
    end if;
  end loop;
  if p_order is not null then
    update public.orders set status=desired, notes=p_order->>'notes',
      service_metadata=case when desired='Completed' and (p_order->>'notes')::jsonb ? 'inventoryItems'
        then coalesce(service_metadata,'{}'::jsonb) || '{"inventory_commit":"snapshot-v1"}'::jsonb else service_metadata end, updated_at=now()
      where id=o.id returning * into o;
    -- Any order trigger failure rolls back the complete store/order transaction.
  end if;
  return jsonb_build_object('data',s.data,'order',case when p_order is null then null else to_jsonb(o) end);
end; $$;
revoke all on function public.commit_store_snapshot(uuid,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.commit_store_snapshot(uuid,jsonb,jsonb,jsonb) to authenticated;

-- New snapshot commits already updated the product projection. Keep the legacy
-- completion trigger for service workflows and older clients, without deducting
-- a second time for the new inventory checkout.
drop trigger if exists trg_deduct_inventory_on_order_completion on public.orders;
create trigger trg_deduct_inventory_on_order_completion after update of status on public.orders
for each row when (new.status='Completed' and old.status is distinct from 'Completed'
  and coalesce(new.service_metadata->>'inventory_commit','') <> 'snapshot-v1')
execute function public.deduct_inventory_on_order_completion();
