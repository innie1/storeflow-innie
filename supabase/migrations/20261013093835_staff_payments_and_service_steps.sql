-- Recovered on 2026-10-14 from the live database.
--
-- This migration was applied to production on 2026-10-13 (version
-- 20261013093835) from a laptop that is gone, and never reached the
-- repository - nor did the app code that used it. It is written back here
-- from the live definitions (pg_get_functiondef and the catalogue), so the
-- repository describes the database again. Already applied: do not re-run.
--
-- 1. Money a worker takes on a laundry bundle - at intake, or at hand-over -
--    reaches the owner: staff_send_payments takes it from the worker's
--    phone (once per id, only for a bundle the cloud holds, never more than
--    the bundle's total), and store_staff_records_since hands it to the
--    owner's phone with the bundle's details.
-- 2. service_order_note_step: who moved a service order to a status, kept
--    in the order's notes beside the same record orders of goods keep.

create table if not exists public.staff_laundry_payments (
  store_id uuid not null references public.stores(id) on delete cascade,
  id text not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  client_ref text not null,
  kind text not null check (kind = any (array['intake'::text, 'payment'::text])),
  amount numeric not null check (amount >= (0)::numeric),
  paid_at timestamptz not null,
  staff_id text not null,
  staff_name text not null,
  staff_role text,
  created_at timestamptz not null default now(),
  primary key (store_id, id)
);

create index if not exists staff_laundry_payments_since_idx on public.staff_laundry_payments (store_id, created_at);

-- Read and written only through the functions below.
alter table public.staff_laundry_payments enable row level security;

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
  v_kind text;
  v_amount numeric;
  v_at timestamptz;
  v_order public.orders;
  v_taken numeric;
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

    select * into v_order from public.orders o
      where o.store_id = (v.o_store).id and o.client_ref = item->>'clientRef'
        and o.business_type = 'laundry' and o.order_kind = 'service'
      limit 1;
    -- Not in the cloud yet: the phone sends it again once the bundle is.
    continue when v_order.id is null;

    if exists (select 1 from public.staff_laundry_payments p where p.store_id = (v.o_store).id and p.id = v_id) then
      got := got || to_jsonb(v_id);
      continue;
    end if;

    select coalesce(sum(p.amount), 0) into v_taken from public.staff_laundry_payments p where p.order_id = v_order.id;
    continue when v_taken + v_amount > coalesce(v_order.total, 0) + 0.01;

    insert into public.staff_laundry_payments (store_id, id, order_id, client_ref, kind, amount, paid_at, staff_id, staff_name, staff_role)
    values ((v.o_store).id, v_id, v_order.id, v_order.client_ref, v_kind, v_amount, least(v_at, v_now),
            v.o_worker->>'id', v.o_worker->>'name', v.o_worker->>'role')
    on conflict do nothing;
    got := got || to_jsonb(v_id);
  end loop;

  update public.staff_devices set last_seen_at = v_now where id = v.o_device_id;
  return jsonb_build_object('ok', true, 'payments', got);
end;
$function$;

revoke all on function public.staff_send_payments(text, text, jsonb) from public;
grant execute on function public.staff_send_payments(text, text, jsonb) to anon, authenticated;

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
        'staffId', p.staff_id, 'staffName', p.staff_name, 'staffRole', p.staff_role,
        'total', o.total, 'tagCode', o.order_number, 'customerName', o.customer_name, 'customerPhone', o.customer_phone,
        'serviceId', o.service_metadata->>'service_id', 'serviceName', o.service_metadata->>'service_name',
        'promisedFor', o.service_metadata->>'promised_for'
      ) order by p.paid_at), '[]'::jsonb)
      from public.staff_laundry_payments p join public.orders o on o.id = p.order_id
      where p.store_id = v_store.id and (p_since is null or p.created_at > p_since))
  );
end;
$function$;

create or replace function public.service_order_note_step(p_order_id uuid, p_status text, p_by_name text, p_by_role text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r public.orders%rowtype;
  n jsonb;
  v_status text := left(trim(coalesce(p_status, '')), 30);
  v_step jsonb;
begin
  if v_status = '' then raise exception 'A step is required'; end if;
  select * into r from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.is_store_member(r.store_id) then raise exception 'Not authorized for this store' using errcode = '42501'; end if;
  begin n := coalesce(nullif(r.notes, ''), '{}')::jsonb; exception when others then n := '{}'::jsonb; end;
  if jsonb_typeof(n) <> 'object' then n := '{}'::jsonb; end if;
  v_step := jsonb_strip_nulls(jsonb_build_object('status', v_status, 'at', now(),
    'by', nullif(left(trim(coalesce(p_by_name, '')), 60), ''), 'role', nullif(left(trim(coalesce(p_by_role, '')), 30), '')));
  n := jsonb_set(n, '{status_by}', (
    select coalesce(jsonb_agg(step order by k), '[]'::jsonb) from (
      select step, k from jsonb_array_elements(
        case when jsonb_typeof(n->'status_by') = 'array' then n->'status_by' else '[]'::jsonb end || jsonb_build_array(v_step)
      ) with ordinality as s(step, k) order by k desc limit 20
    ) kept), true);
  update public.orders set notes = n::text where id = r.id;
  return n->'status_by';
end;
$function$;

revoke all on function public.service_order_note_step(uuid, text, text, text) from public, anon;
grant execute on function public.service_order_note_step(uuid, text, text, text) to authenticated;
