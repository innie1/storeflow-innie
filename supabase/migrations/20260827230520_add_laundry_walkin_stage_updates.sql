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

revoke all on function public.update_laundry_walkin_stage(text,text,text) from public;
grant execute on function public.update_laundry_walkin_stage(text,text,text) to anon, authenticated;
