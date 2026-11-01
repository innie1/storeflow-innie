-- Money a worker takes is never answered "already got it" and thrown away.
--
-- A bundle's taking-in has one id. A phone that took money on a bundle it did
-- not take in - another phone took it in, or this one lost its storage - sent
-- that money under the same id. The cloud found the id, took it for a repeat
-- and said yes, so the phone never sent it again and the owner never got it.
--
-- The app now names such a payment itself, but a phone can run an older copy
-- of the app for days. So the cloud no longer goes by the id alone: a true
-- repeat has the same amount, the same worker and the same time. Anything
-- else holding money is a different payment, and is kept under its own id -
-- the same one every time it is sent, so it is still only counted once.
--
-- A payment also marks its bundle as changed, so a phone open on the next
-- shift hears what was paid and by whom, rather than still offering Take.

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

    insert into public.staff_laundry_payments (store_id, id, order_id, client_ref, kind, amount, paid_at, staff_id, staff_name, staff_role)
    values ((v.o_store).id, v_store_as, v_order.id, v_order.client_ref, v_kind, v_amount, least(v_at, v_now),
            v.o_worker->>'id', v.o_worker->>'name', v.o_worker->>'role')
    on conflict do nothing;
    update public.orders set updated_at = v_now where id = v_order.id;
    got := got || to_jsonb(v_id);
  end loop;

  update public.staff_devices set last_seen_at = v_now where id = v.o_device_id;
  return jsonb_build_object('ok', true, 'payments', got);
end;
$function$;
