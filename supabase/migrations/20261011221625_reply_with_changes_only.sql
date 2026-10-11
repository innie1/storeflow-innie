-- Stop sending every shop back to the phone that just saved it.
--
-- commit_store_snapshot is how a phone saves its shop: a sale, an expense, a
-- bundle moving along. It answered every save with the whole merged shop -
-- up to 110 kB - although the phone had just sent all of it. Sending up is
-- free; sending back is the outgoing data the free plan limits. A busy shop
-- saving 150 times a day used about 450 MB a month on replies alone.
--
-- Every caller lays the reply over its own copy:
--     { ...mine, ...reply.data, managerSettings: { ...mine.ms, ...reply.data.ms } }
-- so a reply holding only the parts that differ from what the phone sent -
-- normally nothing, or what another phone changed meanwhile - gives the
-- caller exactly the same shop. p_reply = 'changes' asks for that; the
-- default stays 'full', so a phone still running the old app is unaffected.
--
-- Replaced, not overloaded: two versions differing by one defaulted argument
-- would make every existing call ambiguous. Dropped and recreated in one
-- transaction, with the same owner checks, the same grants and the same body
-- apart from the reply.
--
-- Also: pg_cron keeps a row for every run of every job, forever. The
-- deadline check alone adds 96 a day. Keep a week.

drop function if exists public.commit_store_snapshot(uuid, jsonb, jsonb, jsonb);

create function public.commit_store_snapshot(
  p_store_id uuid, p_base jsonb, p_next jsonb, p_order jsonb default null, p_reply text default 'full'
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  s public.stores%rowtype; o public.orders%rowtype; merged jsonb; desired text; product jsonb; reply jsonb;
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
      reply := case when p_reply = 'changes'
        then coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(s.data) e where (p_next->e.key) is distinct from e.value), '{}'::jsonb)
        else s.data end;
      return jsonb_build_object('data', reply, 'order', to_jsonb(o), 'changes_only', p_reply = 'changes');
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
  -- Only what differs from what the phone sent, when it asked for that.
  reply := case when p_reply = 'changes'
    then coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(s.data) e where (p_next->e.key) is distinct from e.value), '{}'::jsonb)
    else s.data end;
  return jsonb_build_object('data', reply, 'order', case when p_order is null then null else to_jsonb(o) end, 'changes_only', p_reply = 'changes');
end; $function$;

revoke all on function public.commit_store_snapshot(uuid, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.commit_store_snapshot(uuid, jsonb, jsonb, jsonb, text) to authenticated, service_role;

-- A week of job history is plenty to see whether the jobs run.
select cron.unschedule(jobid) from cron.job where jobname = 'cron-history-cleanup';
select cron.schedule('cron-history-cleanup', '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
