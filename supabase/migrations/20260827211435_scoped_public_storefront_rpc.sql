-- Live migration: scoped_public_storefront_rpc
create or replace function public.get_public_storefront(p_key text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if nullif(trim(p_key),'') is null then return null; end if;
  perform public.check_rate_limit('get_public_storefront',lower(trim(p_key)),120,600);
  select to_jsonb(x) into v_result
  from (
    select sp.id,sp.store_id,sp.business_name,sp.currency,sp.country,sp.state,sp.city,sp.address,
           sp.phone,sp.email,sp.logo,sp.subscription_status,sp.access_code,sp.qr_code,sp.data
    from public.stores_public sp
    where sp.store_id=p_key or sp.access_code=p_key
    limit 1
  ) x;
  return v_result;
end;
$$;
revoke all on function public.get_public_storefront(text) from public;
grant execute on function public.get_public_storefront(text) to anon,authenticated,service_role;

create or replace function public.get_order_by_number(p_store_id uuid,p_order_number text)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare v_result jsonb;
begin
  perform public.check_rate_limit('get_order_by_number',p_store_id::text||':'||p_order_number,15,600);
  select to_jsonb(o) into v_result from (
    select id,order_number,status,status_history,notes,created_at
    from public.orders
    where store_id=p_store_id and order_number=p_order_number
    order by created_at desc limit 1
  ) o;
  return v_result;
end;
$$;
