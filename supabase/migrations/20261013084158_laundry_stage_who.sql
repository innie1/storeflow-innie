-- Who moved each laundry bundle along.
--
-- A bundle's record said who took it in (recorded_by_name) and nothing after:
-- not who started the wash, not who marked it ready, not who handed it back.
-- The owner asked for every step to carry the name of whoever did it, on the
-- list, the receipt and the history.
--
-- Each real change of stage now appends { stage, at, by, role } to
-- service_metadata.stage_history (the last 30 steps). A retry of the same
-- stage - the phone re-sending what the cloud already has - adds nothing.
--
-- From the shop's own phone the name is the person signed in there, sent by
-- the app (p_by_name, p_by_role; both optional, so an app not yet updated
-- still works and simply records no name). From a worker's own phone it is
-- taken from the worker's pass in the cloud, never from what the phone says.

drop function if exists public.update_laundry_walkin_stage(text, text, text);

create or replace function public.update_laundry_walkin_stage(
  p_access_code text,
  p_client_ref text,
  p_stage text,
  p_by_name text default null,
  p_by_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_store public.stores%rowtype;
  v_order_id uuid;
  v_current text;
  v_stage text := lower(trim(coalesce(p_stage,'')));
  v_status text;
  v_by text := nullif(left(trim(coalesce(p_by_name, '')), 60), '');
  v_role text := nullif(left(trim(coalesce(p_by_role, '')), 30), '');
  v_step jsonb;
begin
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
  if v_store.business_type <> 'laundry' then raise exception 'This store is not a laundry business'; end if;
  if coalesce(v_store.subscription_status,'active') <> 'active' then raise exception 'Store is not active'; end if;

  select o.id, o.workflow_stage into v_order_id, v_current
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

  v_step := jsonb_strip_nulls(jsonb_build_object('stage', v_stage, 'at', now(), 'by', v_by, 'role', v_role));

  update public.orders o
  set workflow_stage=v_stage,
      status=v_status,
      updated_at=now(),
      service_metadata=coalesce(o.service_metadata,'{}'::jsonb)
        || jsonb_build_object('workflow_stage',v_stage,'stage_updated_at',now())
        || case
             when v_current is distinct from v_stage then jsonb_build_object('stage_history', (
               select coalesce(jsonb_agg(step order by n), '[]'::jsonb)
               from (
                 select step, n
                 from jsonb_array_elements(
                   case when jsonb_typeof(o.service_metadata->'stage_history') = 'array'
                        then o.service_metadata->'stage_history' else '[]'::jsonb end
                   || jsonb_build_array(v_step)
                 ) with ordinality as h(step, n)
                 order by n desc
                 limit 30
               ) kept
             ))
             else '{}'::jsonb
           end
  where o.id=v_order_id;

  update public.laundry_order_items
  set workflow_stage=v_stage,
      updated_at=now()
  where order_id=v_order_id;

  return jsonb_build_object('order_id',v_order_id,'workflow_stage',v_stage,'status',v_status,'updated_at',now());
end;
$function$;

revoke all on function public.update_laundry_walkin_stage(text, text, text, text, text) from public;
grant execute on function public.update_laundry_walkin_stage(text, text, text, text, text) to anon, authenticated;

-- A worker's phone: the name and role come from the pass, not the phone.
create or replace function public.staff_laundry_stage(p_token text, p_device_key text, p_client_ref text, p_stage text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
begin
  select * into v from public.staff_session_check(p_token, p_device_key);
  if v.o_error is not null then return jsonb_build_object('ok', false, 'error', v.o_error); end if;
  if not public.staff_works_laundry(v.o_worker) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  update public.staff_devices set last_seen_at = now() where id = v.o_device_id;
  return public.update_laundry_walkin_stage((v.o_store).access_code, p_client_ref, p_stage, v.o_worker->>'name', v.o_worker->>'role');
end;
$function$;
