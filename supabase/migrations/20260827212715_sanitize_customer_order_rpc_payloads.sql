-- Live migration: sanitize_customer_order_rpc_payloads
create or replace function public.get_customer_orders(p_customer_phone text)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare v_result jsonb;
begin
  perform public.check_rate_limit('get_customer_orders', p_customer_phone, 20, 600);
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc),'[]'::jsonb) into v_result
  from (
    select
      o.id,
      o.store_id,
      o.customer_name,
      o.order_number,
      o.status,
      o.subtotal,
      o.discount,
      o.total,
      o.pickup_time,
      o.notes,
      o.status_history,
      o.business_type,
      o.order_kind,
      o.workflow_stage,
      o.scheduled_for,
      o.started_at,
      o.completed_at,
      o.created_at,
      o.updated_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',oi.id,
          'product_id',oi.product_id,
          'offering_id',oi.offering_id,
          'item_kind',oi.item_kind,
          'item_name',oi.item_name,
          'unit',oi.unit,
          'quantity',oi.quantity,
          'price',oi.price,
          'subtotal',oi.subtotal,
          'options',oi.options
        ))
        from public.order_items oi where oi.order_id=o.id
      ),'[]'::jsonb) as order_items
    from public.orders o
    where o.customer_phone=p_customer_phone
  ) t;
  return v_result;
end;
$$;

revoke all on function public.get_customer_orders(text) from public;
grant execute on function public.get_customer_orders(text) to anon,authenticated,service_role;
