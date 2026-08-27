-- Live migration: secure_service_rpcs_and_order_reads

-- Anonymous customers must use scoped tracking RPCs, not enumerate every order item.
drop policy if exists "Allow public SELECT on order_items" on public.order_items;
drop policy if exists "Order Items SELECT" on public.order_items;
create policy "Order Items SELECT" on public.order_items for select to authenticated
using (exists(select 1 from public.orders o where o.id=order_id and public.is_store_member(o.store_id)));

drop policy if exists "Orders UPDATE" on public.orders;
create policy "Orders UPDATE" on public.orders for update to authenticated
using(public.is_store_member(store_id))
with check(public.is_store_member(store_id));

-- Initially switched to security_invoker; the immediately following compatibility migration restores
-- the sanitized definer view until every deployed storefront has moved to the scoped public RPC.
alter view public.stores_public set (security_invoker=true);

create or replace function public.sync_product_service_flag()
returns trigger language plpgsql set search_path=''
as $$
declare v_type text;
begin
  select s.business_type into v_type from public.stores s where s.id=new.store_id;
  if v_type in ('laundry','barber','salon','tailoring','repair','car_wash','photography','cleaning','spa') then
    new.is_service:=true;
  end if;
  return new;
end;$$;

create or replace function public.service_order_start(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.orders%rowtype; n jsonb; started timestamptz:=now();
begin
  select * into r from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.is_store_member(r.store_id) then raise exception 'Not authorized for this store' using errcode='42501'; end if;
  if r.status<>'Accepted' then raise exception 'Service can only start after acceptance'; end if;
  if r.order_kind not in ('service','appointment','session','metered','mixed')
    and not exists(select 1 from public.order_items oi left join public.products p on p.id::text=oi.product_id where oi.order_id=r.id and (oi.item_kind<>'product' or coalesce(p.is_service,false)))
  then raise exception 'This is not a service order'; end if;
  begin n:=coalesce(nullif(r.notes,''),'{}')::jsonb; exception when others then n:='{}'::jsonb; end;
  n:=jsonb_set(n,'{serviceSession,status}','"running"'::jsonb,true);
  n:=jsonb_set(n,'{serviceSession,started_at}',to_jsonb(started),true);
  n:=jsonb_set(n,'{serviceSession,paused_seconds}','0'::jsonb,true);
  update public.orders set status='In Progress',workflow_stage='in_progress',started_at=coalesce(started_at,started),notes=n::text,service_metadata=service_metadata||jsonb_build_object('session_state','running'),updated_at=now() where id=r.id;
  return n;
end;$$;

create or replace function public.service_order_pause(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.orders%rowtype; n jsonb; paused timestamptz:=now(); started timestamptz; accumulated numeric:=0;
begin
  select * into r from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.is_store_member(r.store_id) then raise exception 'Not authorized for this store' using errcode='42501'; end if;
  if r.status<>'In Progress' then raise exception 'Service is not running'; end if;
  begin n:=coalesce(nullif(r.notes,''),'{}')::jsonb; exception when others then n:='{}'::jsonb; end;
  started:=nullif(n#>>'{serviceSession,started_at}','')::timestamptz;
  if started is not null then accumulated:=greatest(0,extract(epoch from(paused-started))); end if;
  n:=jsonb_set(n,'{serviceSession,status}','"paused"'::jsonb,true);
  n:=jsonb_set(n,'{serviceSession,paused_at}',to_jsonb(paused),true);
  n:=jsonb_set(n,'{serviceSession,elapsed_seconds}',to_jsonb(coalesce((n#>>'{serviceSession,elapsed_seconds}')::numeric,0)+accumulated),true);
  update public.orders set notes=n::text,service_metadata=service_metadata||jsonb_build_object('session_state','paused'),updated_at=now() where id=r.id;
  insert into public.service_order_events(order_id,store_id,business_type,stage,event_type,payload) values(r.id,r.store_id,r.business_type,r.workflow_stage,'paused','{}'::jsonb);
  return n;
end;$$;

create or replace function public.service_order_resume(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.orders%rowtype; n jsonb;
begin
  select * into r from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.is_store_member(r.store_id) then raise exception 'Not authorized for this store' using errcode='42501'; end if;
  if r.status<>'In Progress' then raise exception 'Service is not paused'; end if;
  begin n:=coalesce(nullif(r.notes,''),'{}')::jsonb; exception when others then n:='{}'::jsonb; end;
  if coalesce(n#>>'{serviceSession,status}','')<>'paused' then raise exception 'Service is not paused'; end if;
  n:=jsonb_set(n,'{serviceSession,status}','"running"'::jsonb,true);
  n:=jsonb_set(n,'{serviceSession,started_at}',to_jsonb(now()),true);
  n:=jsonb_set(n,'{serviceSession,paused_at}','null'::jsonb,true);
  update public.orders set notes=n::text,service_metadata=service_metadata||jsonb_build_object('session_state','running'),updated_at=now() where id=r.id;
  insert into public.service_order_events(order_id,store_id,business_type,stage,event_type,payload) values(r.id,r.store_id,r.business_type,r.workflow_stage,'resumed','{}'::jsonb);
  return n;
end;$$;

create or replace function public.service_order_add_time(p_order_id uuid,p_minutes integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.orders%rowtype; n jsonb; old numeric;
begin
  if p_minutes=0 then raise exception 'Minutes must not be zero'; end if;
  select * into r from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.is_store_member(r.store_id) then raise exception 'Not authorized for this store' using errcode='42501'; end if;
  if r.status<>'In Progress' then raise exception 'Service is not running'; end if;
  begin n:=coalesce(nullif(r.notes,''),'{}')::jsonb; exception when others then n:='{}'::jsonb; end;
  old:=coalesce((n#>>'{serviceSession,added_minutes}')::numeric,0);
  n:=jsonb_set(n,'{serviceSession,added_minutes}',to_jsonb(old+p_minutes),true);
  n:=jsonb_set(n,'{serviceSession,last_time_adjustment_at}',to_jsonb(now()),true);
  update public.orders set notes=n::text,updated_at=now() where id=r.id;
  insert into public.service_order_events(order_id,store_id,business_type,stage,event_type,payload) values(r.id,r.store_id,r.business_type,r.workflow_stage,'time_adjusted',jsonb_build_object('minutes',p_minutes));
  return n;
end;$$;

create or replace function public.service_order_complete(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.orders%rowtype; n jsonb; started timestamptz; current numeric:=0;
begin
  select * into r from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.is_store_member(r.store_id) then raise exception 'Not authorized for this store' using errcode='42501'; end if;
  if r.status<>'In Progress' then raise exception 'Service must be in progress before completion'; end if;
  begin n:=coalesce(nullif(r.notes,''),'{}')::jsonb; exception when others then n:='{}'::jsonb; end;
  current:=coalesce((n#>>'{serviceSession,elapsed_seconds}')::numeric,0);
  if coalesce(n#>>'{serviceSession,status}','')='running' then
    started:=nullif(n#>>'{serviceSession,started_at}','')::timestamptz;
    if started is not null then current:=current+greatest(0,extract(epoch from(now()-started))); end if;
  end if;
  n:=jsonb_set(n,'{serviceSession,status}','"completed"'::jsonb,true);
  n:=jsonb_set(n,'{serviceSession,elapsed_seconds}',to_jsonb(current),true);
  n:=jsonb_set(n,'{serviceSession,completed_at}',to_jsonb(now()),true);
  update public.orders set status='Completed',workflow_stage='completed',completed_at=coalesce(completed_at,now()),notes=n::text,service_metadata=service_metadata||jsonb_build_object('session_state','completed'),updated_at=now() where id=r.id;
  return n;
end;$$;

revoke all on function public.service_order_start(uuid) from public,anon;
revoke all on function public.service_order_pause(uuid) from public,anon;
revoke all on function public.service_order_resume(uuid) from public,anon;
revoke all on function public.service_order_complete(uuid) from public,anon;
revoke all on function public.service_order_add_time(uuid,integer) from public,anon;
grant execute on function public.service_order_start(uuid) to authenticated;
grant execute on function public.service_order_pause(uuid) to authenticated;
grant execute on function public.service_order_resume(uuid) to authenticated;
grant execute on function public.service_order_complete(uuid) to authenticated;
grant execute on function public.service_order_add_time(uuid,integer) to authenticated;

create or replace function public.merge_store_data_key(store_id_input uuid,key_input text,value_input jsonb)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_store_member(store_id_input) then raise exception 'Not authorized for this store' using errcode='42501'; end if;
  update public.stores set data=coalesce(data,'{}'::jsonb)||jsonb_build_object(key_input,value_input),updated_at=now() where id=store_id_input;
end;$$;
revoke all on function public.merge_store_data_key(uuid,text,jsonb) from public,anon;
grant execute on function public.merge_store_data_key(uuid,text,jsonb) to authenticated;

revoke all on function public.add_owner_as_store_member() from public,anon,authenticated;
revoke all on function public.deduct_inventory_on_order_completion() from public,anon,authenticated;
revoke all on function public.sync_product_service_flag() from public,anon,authenticated;
revoke all on function public.sync_service_catalog_metadata() from public,anon,authenticated;
revoke all on function public.trigger_send_order_push() from public,anon,authenticated;
revoke all on function public.trigger_send_customer_order_push() from public,anon,authenticated;
revoke all on function public.rls_auto_enable() from public,anon,authenticated;
revoke all on function public.check_rate_limit(text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.is_store_member(uuid) from public,anon;
grant execute on function public.is_store_member(uuid) to authenticated,service_role;
