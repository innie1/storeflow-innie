-- A worker's phone can say who received the money on a bundle.
--
-- Whoever takes the clothes in is often not whoever takes the money: the shift
-- has changed by collection. A worker's phone holds only what it took itself,
-- so its receipt could not name anybody else. Each bundle in the list now also
-- carries paid_by: the workers' payments, with the name the cloud took from
-- their pass, and the owner's record of the same bundle. The same money can be
-- in both, so the phone treats an amount at the same moment as one payment
-- (laundryPaymentLines). The owner's dates are passed on as written and never
-- read here: one bad date must not cost the worker the whole list.

create or replace function public.staff_laundry_list(p_token text, p_device_key text, p_since timestamp with time zone default null::timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
  v_now timestamptz := now();
  v_orders jsonb;
  v_paid jsonb;
  v_events jsonb;
  v_applied jsonb;
begin
  select * into v from public.staff_session_check(p_token, p_device_key);
  if v.o_error is not null then return jsonb_build_object('ok', false, 'error', v.o_error); end if;
  if not public.staff_works_laundry(v.o_worker) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;

  select coalesce(jsonb_agg(
      (to_jsonb(o) - 'access_token' - 'customer_uuid')
      || jsonb_build_object('order_items', coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id = o.id), '[]'::jsonb))
      order by o.created_at desc), '[]'::jsonb)
    into v_orders
    from (
      select * from public.orders o
      where o.store_id = (v.o_store).id
        and case when p_since is null
          then (coalesce(o.status, '') not in ('Completed', 'Cancelled', 'Rejected') or o.updated_at > v_now - interval '7 days')
          else o.updated_at > p_since end
      order by o.created_at desc
      limit 300
    ) o;

  if jsonb_array_length(v_orders) = 0 then
    return jsonb_build_object('ok', true, 'as_of', v_now, 'orders', v_orders);
  end if;

  select coalesce(jsonb_object_agg(e->>'id', e->'paid'), '{}'::jsonb) into v_paid
    from jsonb_array_elements(case when jsonb_typeof((v.o_store).data->'pendingPayments') = 'array' then (v.o_store).data->'pendingPayments' else '[]'::jsonb end) e
    where e->>'id' like 'laundry-%' and jsonb_typeof(e->'paid') = 'number';
  select coalesce(jsonb_object_agg(e->>'id', e->'events'), '{}'::jsonb) into v_events
    from jsonb_array_elements(case when jsonb_typeof((v.o_store).data->'pendingPayments') = 'array' then (v.o_store).data->'pendingPayments' else '[]'::jsonb end) e
    where e->>'id' like 'laundry-%' and jsonb_typeof(e->'events') = 'array';
  v_applied := case when jsonb_typeof((v.o_store).data->'appliedStaffPayments') = 'array' then (v.o_store).data->'appliedStaffPayments' else '[]'::jsonb end;

  return jsonb_build_object('ok', true, 'as_of', v_now, 'orders', (
    select coalesce(jsonb_agg(
      case when known.owner_paid is null and known.staff_ids is null then o.ord
      else o.ord || jsonb_build_object(
        'paid_so_far', least(coalesce((o.ord->>'total')::numeric, 0), coalesce(known.owner_paid, 0) + known.staff_paid),
        'paid_ids', coalesce(known.staff_ids, '[]'::jsonb),
        'paid_by', (
          select coalesce(jsonb_agg(line.entry), '[]'::jsonb) from (
            select jsonb_build_object('amount', p.amount, 'at', p.paid_at, 'by', p.staff_name) as entry
              from public.staff_laundry_payments p
              where p.order_id = (o.ord->>'id')::uuid and p.amount > 0
            union all
            select jsonb_strip_nulls(jsonb_build_object('amount', ev->'amount', 'at', ev->'date',
                'by', coalesce(nullif(ev->>'takenBy', ''), substring(ev->>'note' from '\(taken by ([^)]+)\)'))))
              from jsonb_array_elements(case when jsonb_typeof(v_events->('laundry-' || coalesce(o.ord->>'client_ref', ''))) = 'array'
                     then v_events->('laundry-' || coalesce(o.ord->>'client_ref', '')) else '[]'::jsonb end) ev
              where jsonb_typeof(ev->'amount') = 'number' and (ev->>'amount')::numeric > 0
          ) line))
      end order by o.n), '[]'::jsonb)
    from jsonb_array_elements(v_orders) with ordinality as o(ord, n)
    cross join lateral (
      select (v_paid->>('laundry-' || coalesce(o.ord->>'client_ref', '')))::numeric as owner_paid,
             coalesce(sum(p.amount) filter (where not (v_applied ? p.id)), 0) as staff_paid,
             jsonb_agg(p.id) as staff_ids
        from public.staff_laundry_payments p
        where p.order_id = (o.ord->>'id')::uuid
    ) known
  ));
end;
$function$;
