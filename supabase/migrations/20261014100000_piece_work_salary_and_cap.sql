-- Piece work for a worker on a salary, and never more pieces than a bundle has.
--
-- 1. A worker can be paid a monthly salary AND by the piece for some tasks -
--    an attendant on a wage who is also paid for every shirt she irons. That
--    is payType 'salary_piece'; claims from such a worker are taken just like
--    a per-piece worker's.
--
-- 2. A claim is capped here, in the cloud, at what is left on the bundle for
--    that task and garment - the bundle's own count less every claim already
--    made on it, by anybody. The phone already caps it, but a phone is only
--    a phone: one that is out of date, or altered, could claim fifty shirts
--    on a bundle of twenty-five, or claim again shirts already paid for.
--    Here it cannot. A bundle the cloud does not hold yet (taken in offline,
--    not sent) has nothing to check against; its claims still wait for the
--    owner's approval, as every claim does.
--
-- One indexed row read per claim line (orders(store_id, client_ref) is
-- unique), at most fifty lines a call: small on purpose.
--
-- Rewritten from the live definition (which matches
-- 20261012131342_staff_records_and_record_merge.sql); only the piece-work
-- block changes.
create or replace function public.staff_send_records(
  p_token text, p_device_key text, p_customers jsonb, p_expense_requests jsonb, p_piece_work jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record; v_data jsonb; v_now timestamptz := now(); v_staff jsonb; v_from jsonb; item jsonb;
  v_id text; v_name text; v_amount numeric; v_date timestamptz; v_qty int; v_rate numeric;
  v_total numeric; v_claimed numeric;
  got_customers jsonb := '[]'::jsonb; got_expenses jsonb := '[]'::jsonb; got_piece jsonb := '[]'::jsonb;
begin
  select * into v from public.staff_session_check(p_token, p_device_key);
  if v.o_error is not null then return jsonb_build_object('ok', false, 'error', v.o_error); end if;
  select data into v_data from public.stores where id = (v.o_store).id for update;
  v_data := coalesce(v_data, '{}'::jsonb);
  select m into v_staff from jsonb_array_elements(case when jsonb_typeof(v_data->'staffMembers') = 'array' then v_data->'staffMembers' else '[]'::jsonb end) m
    where m->>'id' = v.o_worker->>'id' limit 1;
  v_from := jsonb_build_object('staffId', v.o_worker->>'id', 'name', v.o_worker->>'name', 'at', v_now);
  if public.staff_works_laundry(v.o_worker) then
    for item in select e from jsonb_array_elements(case when jsonb_typeof(p_customers) = 'array' then p_customers else '[]'::jsonb end) e limit 50 loop
      v_id := item->>'id';
      v_name := left(trim(coalesce(item->>'name', '')), 80);
      continue when v_id is null or v_id !~ '^[A-Za-z0-9_.:-]{1,64}$' or v_name = '';
      if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_data->'customers') = 'array' then v_data->'customers' else '[]'::jsonb end) c where c->>'id' = v_id) then
        v_data := jsonb_set(v_data, '{customers}', jsonb_build_array(jsonb_build_object(
          'id', v_id, 'name', v_name,
          'phone', left(regexp_replace(coalesce(item->>'phone', ''), '[^0-9+]', '', 'g'), 20),
          'address', left(trim(coalesce(item->>'address', '')), 200),
          'totalPurchases', 0, 'outstandingDebt', 0, 'purchaseHistory', '[]'::jsonb, 'loyaltyPoints', 0, 'visitsCount', 0,
          '_fromStaff', v_from
        )) || case when jsonb_typeof(v_data->'customers') = 'array' then v_data->'customers' else '[]'::jsonb end, true);
      end if;
      got_customers := got_customers || to_jsonb(v_id);
    end loop;
  end if;
  for item in select e from jsonb_array_elements(case when jsonb_typeof(p_expense_requests) = 'array' then p_expense_requests else '[]'::jsonb end) e limit 50 loop
    v_id := item->>'id';
    continue when v_id is null or v_id !~ '^[A-Za-z0-9_.:-]{1,64}$';
    begin
      v_amount := round((item->>'amount')::numeric, 2);
      v_date := (item->>'date')::timestamptz;
    exception when others then continue;
    end;
    continue when v_amount is null or v_amount <= 0 or v_amount >= 100000000;
    continue when v_date is null or v_date > v_now + interval '1 day';
    continue when coalesce(item->>'category', '') not in ('Consumables', 'Transport', 'Utilities', 'Other');
    continue when coalesce(item->>'paidFrom', '') not in ('cash', 'bank', 'wallet');
    continue when trim(coalesce(item->>'note', '')) = '';
    if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_data->'staffExpenseRequests') = 'array' then v_data->'staffExpenseRequests' else '[]'::jsonb end) x where x->>'id' = v_id) then
      v_data := jsonb_set(v_data, '{staffExpenseRequests}', jsonb_build_array(jsonb_build_object(
        'id', v_id, 'amount', v_amount, 'category', item->>'category', 'note', left(trim(item->>'note'), 200),
        'date', v_date, 'paidFrom', item->>'paidFrom',
        'recordedBy', jsonb_build_object('staffId', v.o_worker->>'id', 'name', v.o_worker->>'name', 'role', v.o_worker->>'role'),
        'recordedAt', v_now, 'status', 'pending', '_fromStaff', v_from
      )) || case when jsonb_typeof(v_data->'staffExpenseRequests') = 'array' then v_data->'staffExpenseRequests' else '[]'::jsonb end, true);
    end if;
    got_expenses := got_expenses || to_jsonb(v_id);
  end loop;
  -- Piece work: for a worker paid by the piece, on a wage or not, at the owner's rate.
  if coalesce(v_staff->>'payType', '') in ('per_piece', 'salary_piece') then
    for item in select e from jsonb_array_elements(case when jsonb_typeof(p_piece_work) = 'array' then p_piece_work else '[]'::jsonb end) e limit 50 loop
      v_id := item->>'id';
      continue when v_id is null or v_id !~ '^[A-Za-z0-9_.:-]{1,64}$';
      begin
        v_qty := (item->>'quantity')::int;
      exception when others then continue;
      end;
      continue when v_qty is null or v_qty < 1 or v_qty > 1000;
      continue when coalesce(item->>'task', '') = '' or coalesce(item->>'garmentType', '') = '';
      -- Already here (a resend): answered, never counted twice.
      if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_data->'pieceWork') = 'array' then v_data->'pieceWork' else '[]'::jsonb end) w where w->>'id' = v_id) then
        got_piece := got_piece || to_jsonb(v_id);
        continue;
      end if;
      -- How many of this garment the bundle holds, by its own garment lines.
      select sum(greatest(0, coalesce((l->>'quantity')::numeric, 0))) into v_total
        from public.orders o,
             jsonb_array_elements(case when jsonb_typeof(o.service_metadata->'garment_lines') = 'array' then o.service_metadata->'garment_lines' else '[]'::jsonb end) l
        where o.store_id = (v.o_store).id and o.client_ref = item->>'clientRef'
          and lower(coalesce(l->>'garment_type', l->>'garmentType', '')) = lower(item->>'garmentType');
      if v_total is not null then
        -- Less every claim already on it, for this task, by anybody.
        select coalesce(sum((w->>'quantity')::numeric), 0) into v_claimed
          from jsonb_array_elements(case when jsonb_typeof(v_data->'pieceWork') = 'array' then v_data->'pieceWork' else '[]'::jsonb end) w
          where w->>'clientRef' = item->>'clientRef' and w->>'task' = item->>'task'
            and lower(w->>'garmentType') = lower(item->>'garmentType');
        v_qty := least(v_qty, greatest(0, floor(v_total - v_claimed))::int);
        if v_qty < 1 then
          -- Nothing left to claim: answered, so the phone stops sending it.
          got_piece := got_piece || to_jsonb(v_id);
          continue;
        end if;
      end if;
      select coalesce(
        (select (r->>'rate')::numeric from jsonb_array_elements(coalesce(v_staff->'pieceRates', '[]'::jsonb)) r
          where r->>'task' = item->>'task' and lower(r->>'garmentType') = lower(item->>'garmentType') limit 1),
        (select (r->>'rate')::numeric from jsonb_array_elements(coalesce(v_staff->'pieceRates', '[]'::jsonb)) r
          where r->>'task' = item->>'task' and r->>'garmentType' = '*' limit 1),
        0) into v_rate;
      v_rate := greatest(0, v_rate);
      v_data := jsonb_set(v_data, '{pieceWork}', jsonb_build_array(jsonb_build_object(
        'id', v_id, 'workerId', v.o_worker->>'id', 'workerName', v.o_worker->>'name',
        'clientRef', left(coalesce(item->>'clientRef', ''), 64), 'tagCode', left(coalesce(item->>'tagCode', ''), 16),
        'customerName', left(coalesce(item->>'customerName', ''), 80),
        'task', left(item->>'task', 40), 'garmentType', left(item->>'garmentType', 60),
        'quantity', v_qty, 'rate', v_rate, 'amount', round(v_rate * v_qty, 2),
        'at', v_now, 'approved', false, '_fromStaff', v_from
      )) || case when jsonb_typeof(v_data->'pieceWork') = 'array' then v_data->'pieceWork' else '[]'::jsonb end, true);
      got_piece := got_piece || to_jsonb(v_id);
    end loop;
  end if;
  update public.stores set data = v_data, updated_at = v_now where id = (v.o_store).id;
  update public.staff_devices set last_seen_at = v_now where id = v.o_device_id;
  return jsonb_build_object('ok', true, 'customers', got_customers, 'expenses', got_expenses, 'pieceWork', got_piece);
end;
$$;
