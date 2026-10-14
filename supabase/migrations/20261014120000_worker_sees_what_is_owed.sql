-- A worker's phone sees what a customer still owes on a bundle.
--
-- What was paid on a bundle lives in the owner's copy of the shop
-- (pendingPayments, `laundry-<client_ref>`), not on the order row, so a
-- worker's phone showed nothing owed on a bundle somebody else took in - and
-- could hand it over, or take the whole price again. staff_laundry_list now
-- adds `paid_so_far` to each bundle it sends: what the owner's copy says was
-- paid, plus money workers took that the owner's phone has not booked yet.
-- Left out (null) when nothing is known, so the phone keeps its own figure.
--
-- Kept tiny: the owner's list is read once per reply, and only when the
-- reply carries bundles - the usual "nothing changed" refresh costs nothing.

create index if not exists staff_laundry_payments_order_idx on public.staff_laundry_payments (order_id);

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

  -- What the owner's copy says was paid on each bundle.
  select coalesce(jsonb_object_agg(e->>'id', e->'paid'), '{}'::jsonb) into v_paid
    from jsonb_array_elements(case when jsonb_typeof((v.o_store).data->'pendingPayments') = 'array' then (v.o_store).data->'pendingPayments' else '[]'::jsonb end) e
    where e->>'id' like 'laundry-%' and jsonb_typeof(e->'paid') = 'number';
  -- Worker money the owner's phone has already booked into those figures.
  v_applied := case when jsonb_typeof((v.o_store).data->'appliedStaffPayments') = 'array' then (v.o_store).data->'appliedStaffPayments' else '[]'::jsonb end;

  return jsonb_build_object('ok', true, 'as_of', v_now, 'orders', (
    select coalesce(jsonb_agg(
      case when known.owner_paid is null and known.staff_ids is null then o.ord
      else o.ord || jsonb_build_object(
        'paid_so_far', least(coalesce((o.ord->>'total')::numeric, 0), coalesce(known.owner_paid, 0) + known.staff_paid),
        -- Every worker payment counted in that figure, so a phone adds only its own the cloud has not seen.
        'paid_ids', coalesce(known.staff_ids, '[]'::jsonb))
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
