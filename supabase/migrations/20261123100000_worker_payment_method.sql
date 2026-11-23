-- How a worker was paid reaches the owner: cash or transfer.
--
-- A worker tapping Cash or Transfer on her own phone kept the answer on her
-- phone only. What reached the owner was the amount, the bundle and the name,
-- so on the owner's phone every worker's payment read "not recorded", and the
-- cash and transfer totals were short by everything the workers took.
--
-- The phone now sends the method with each payment. Older copies of the app
-- send none, and those payments stay "not recorded", as before: nothing is
-- guessed. A payment sent again with its method fills in one kept without.

alter table public.staff_laundry_payments
  add column if not exists method text check (method is null or method = any (array['cash'::text, 'transfer'::text, 'pos'::text]));

create or replace function public.staff_send_payments(p_token text, p_device_key text, p_payments jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
  v_now timestamptz := now();
  item jsonb;
  v_id text;
  v_store_as text;
  v_kind text;
  v_amount numeric;
  v_at timestamptz;
  v_method text;
  v_order public.orders;
  v_taken numeric;
  v_prev public.staff_laundry_payments;
  got jsonb := '[]'::jsonb;
begin
  select * into v from public.staff_session_check(p_token, p_device_key);
  if v.o_error is not null then return jsonb_build_object('ok', false, 'error', v.o_error); end if;
  if not public.staff_works_laundry(v.o_worker) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;

  for item in select e from jsonb_array_elements(case when jsonb_typeof(p_payments) = 'array' then p_payments else '[]'::jsonb end) e limit 50 loop
    v_id := item->>'id';
    v_kind := item->>'kind';
    continue when v_id is null or v_id !~ '^[A-Za-z0-9_.:+-]{1,96}$' or v_kind not in ('intake', 'payment');
    begin
      v_amount := round(coalesce((item->>'amount')::numeric, 0), 2);
      v_at := (item->>'at')::timestamptz;
    exception when others then continue;
    end;
    continue when v_amount is null or v_amount < 0 or v_at is null or v_at > v_now + interval '1 day';
    continue when v_kind = 'payment' and v_amount <= 0;
    -- Only the three the app offers; anything else is left unsaid, not refused.
    v_method := case when item->>'method' in ('cash', 'transfer', 'pos') then item->>'method' end;

    select * into v_order from public.orders o
      where o.store_id = (v.o_store).id and o.client_ref = item->>'clientRef'
        and o.business_type = 'laundry' and o.order_kind = 'service'
      limit 1;
    -- Not in the cloud yet: the phone sends it again once the bundle is.
    continue when v_order.id is null;

    v_store_as := v_id;
    select * into v_prev from public.staff_laundry_payments p where p.store_id = (v.o_store).id and p.id = v_id;
    if v_prev.id is not null then
      -- The same payment again, or nothing in it to lose: answered, not counted.
      if v_amount <= 0 or (v_prev.amount = v_amount and v_prev.staff_id = v.o_worker->>'id'
                           and (v_prev.paid_at = v_at or v_at > v_now)) then
        -- Kept before the method was sent: it can have it now.
        if v_prev.method is null and v_method is not null then
          update public.staff_laundry_payments set method = v_method
            where store_id = (v.o_store).id and id = v_id;
        end if;
        got := got || to_jsonb(v_id);
        continue;
      end if;
      -- Same id, different money: its own payment, under an id that does not change.
      v_store_as := v_id || '-' || (extract(epoch from v_at) * 1000)::bigint::text;
      v_kind := 'payment';
      if exists (select 1 from public.staff_laundry_payments p where p.store_id = (v.o_store).id and p.id = v_store_as) then
        got := got || to_jsonb(v_id);
        continue;
      end if;
    end if;

    select coalesce(sum(p.amount), 0) into v_taken from public.staff_laundry_payments p where p.order_id = v_order.id;
    continue when v_taken + v_amount > coalesce(v_order.total, 0) + 0.01;

    insert into public.staff_laundry_payments (store_id, id, order_id, client_ref, kind, amount, paid_at, staff_id, staff_name, staff_role, method)
    values ((v.o_store).id, v_store_as, v_order.id, v_order.client_ref, v_kind, v_amount, least(v_at, v_now),
            v.o_worker->>'id', v.o_worker->>'name', v.o_worker->>'role', v_method)
    on conflict do nothing;
    update public.orders set updated_at = v_now where id = v_order.id;
    got := got || to_jsonb(v_id);
  end loop;

  update public.staff_devices set last_seen_at = v_now where id = v.o_device_id;
  return jsonb_build_object('ok', true, 'payments', got);
end;
$function$;

create or replace function public.store_staff_records_since(p_store_ref text, p_since timestamp with time zone)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_store public.stores;
  v_now timestamptz := now();
begin
  select * into v_store from public.stores
    where store_id = upper(trim(coalesce(p_store_ref, ''))) or access_code = upper(trim(coalesce(p_store_ref, '')))
    limit 1;
  if v_store.id is null or not public.staff_join_is_owner(v_store.id) then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  return jsonb_build_object('ok', true, 'as_of', v_now,
    'customers', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(v_store.data->'customers') = 'array' then v_store.data->'customers' else '[]'::jsonb end) e
      where e ? '_fromStaff' and (p_since is null or (e->'_fromStaff'->>'at')::timestamptz > p_since)),
    'staffExpenseRequests', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(v_store.data->'staffExpenseRequests') = 'array' then v_store.data->'staffExpenseRequests' else '[]'::jsonb end) e
      where e ? '_fromStaff' and (p_since is null or (e->'_fromStaff'->>'at')::timestamptz > p_since)),
    'pieceWork', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(v_store.data->'pieceWork') = 'array' then v_store.data->'pieceWork' else '[]'::jsonb end) e
      where e ? '_fromStaff' and (p_since is null or (e->'_fromStaff'->>'at')::timestamptz > p_since)),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'clientRef', p.client_ref, 'amount', p.amount, 'at', p.paid_at,
        'staffId', p.staff_id, 'staffName', p.staff_name, 'staffRole', p.staff_role, 'method', p.method,
        'total', o.total, 'tagCode', o.order_number, 'customerName', o.customer_name, 'customerPhone', o.customer_phone,
        'serviceId', o.service_metadata->>'service_id', 'serviceName', o.service_metadata->>'service_name',
        'promisedFor', o.service_metadata->>'promised_for'
      ) order by p.paid_at), '[]'::jsonb)
      from public.staff_laundry_payments p join public.orders o on o.id = p.order_id
      where p.store_id = v_store.id and (p_since is null or p.created_at > p_since))
  );
end;
$function$;
