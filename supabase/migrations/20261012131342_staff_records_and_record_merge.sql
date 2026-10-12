-- A worker's expenses, new customers and piece-work claims reach the owner
-- (staff plan 5c), and two phones adding records at once no longer block
-- each other.
--
-- 1. Record-by-record merge.
--
--    merge_inventory_snapshot settles a save against what the cloud holds.
--    It took each part of the shop whole: if the owner's phone changed the
--    customer list while another phone had changed it too, the save was
--    refused and held for review - and customers sat in the "money" group,
--    so even an owner's sale was refused if a customer had been added
--    elsewhere. With workers adding customers from their own phones that
--    would happen all day.
--
--    Now customers, staff expense requests and piece-work claims are merged
--    record by record, by id: what this phone added, changed or removed is
--    applied; what another phone added stays. Only two phones changing the
--    SAME record differently is refused. Customers leave the money group.
--    Everything else - sales, stock, expenses, balances - keeps the strict
--    rule exactly as before.
--
-- 2. staff_send_records - the worker's door for these three kinds.
--
--    Opened with the worker's pass, checked every time like the laundry
--    doors. It only ever ADDS, and the cloud decides what is added:
--      - a customer: name, phone, address, with everything about money set
--        to zero. Only for roles that work the counter (attendant,
--        supervisor, manager, custom with sales). An existing customer is
--        never changed from a worker's phone.
--      - an expense request: always as this worker's - name and role from
--        the staff list, never from the phone - and always waiting. Only
--        the four staff categories; a positive amount; a day not in the
--        future. Whether it then counts straight away is the owner's rule,
--        applied on the owner's phone.
--      - a piece-work claim: only for a worker paid per piece, always
--        unapproved, and at the rate in the owner's staff list - the
--        phone's rate and amount are ignored, so a claim cannot be priced
--        up on the way.
--    At most 50 of each per call. Each added record carries _fromStaff
--    (who, and when) so the owner's phone can collect only what is new.
--
-- 3. store_staff_records_since - the owner's phone collecting them.
--
--    Owner only. Returns the records workers added since the given time:
--    normally none, so the reply is a few bytes.

-- ── 1. merge ───────────────────────────────────────────────────────────────

create or replace function public.merge_records_by_id(p_base jsonb, p_next jsonb, p_remote jsonb, p_key text)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
  b_arr jsonb := case when jsonb_typeof(p_base) = 'array' then p_base else '[]'::jsonb end;
  n_arr jsonb := case when jsonb_typeof(p_next) = 'array' then p_next else '[]'::jsonb end;
  result jsonb := case when jsonb_typeof(p_remote) = 'array' then p_remote else '[]'::jsonb end;
  rid text; b jsonb; n jsonb; r jsonb; pos int;
begin
  -- Records without ids cannot be matched up; keep the whole-list rule.
  if exists (select 1 from jsonb_array_elements(b_arr || n_arr || result) e where coalesce(e->>'id', '') = '') then
    if b_arr is distinct from n_arr and result is distinct from b_arr and result is distinct from n_arr then
      raise exception 'Another device changed %. Review your saved records before syncing.', p_key using errcode = '40001';
    end if;
    return case when b_arr is distinct from n_arr then n_arr else result end;
  end if;

  for rid in
    select distinct e->>'id' from jsonb_array_elements(b_arr || n_arr) e
  loop
    b := null; n := null; r := null; pos := null;
    select e into b from jsonb_array_elements(b_arr) e where e->>'id' = rid limit 1;
    select e into n from jsonb_array_elements(n_arr) e where e->>'id' = rid limit 1;
    if b is not distinct from n then continue; end if;
    select e into r from jsonb_array_elements(result) e where e->>'id' = rid limit 1;
    if r is distinct from b and r is distinct from n then
      raise exception 'Another device changed the same record in %. Review your saved records before syncing.', p_key using errcode = '40001';
    end if;
    select (o - 1) into pos from jsonb_array_elements(result) with ordinality as x(e, o) where e->>'id' = rid limit 1;
    if n is null then
      if pos is not null then result := result - pos; end if;
    elsif pos is not null then
      result := jsonb_set(result, array[pos::text], n);
    else
      result := jsonb_build_array(n) || result;
    end if;
  end loop;
  return result;
end;
$function$;

create or replace function public.merge_inventory_snapshot(p_base jsonb, p_next jsonb, p_remote jsonb)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
  k text; result jsonb := coalesce(p_remote, '{}'::jsonb);
  -- One transaction: if any of these changed here, all of them must still be
  -- as this phone last saw them, or be exactly what it sends. Customers are
  -- no longer here; they merge record by record below.
  financial text[] := array['products','sales','pendingPayments','cashBalance','bankBalance','inventoryMovements','expenses','restocks','investments','trash'];
  by_record text[] := array['customers','staffExpenseRequests','pieceWork'];
  changed boolean := false; same_base boolean := true; same_next boolean := true;
begin
  if jsonb_typeof(p_base) <> 'object' or jsonb_typeof(p_next) <> 'object' or jsonb_typeof(result) <> 'object' then
    raise exception 'Store snapshots must be objects';
  end if;
  foreach k in array financial loop
    changed := changed or (p_base->k is distinct from p_next->k);
    same_base := same_base and (p_base->k is not distinct from result->k);
    same_next := same_next and (p_next->k is not distinct from result->k);
  end loop;
  if changed and not same_base and not same_next then
    raise exception 'Another device changed stock or payments. Review your saved records before syncing.' using errcode='40001';
  end if;
  for k in select jsonb_object_keys(p_base || p_next) loop
    if p_base->k is not distinct from p_next->k then continue; end if;
    if k = any(by_record) then
      result := jsonb_set(result, array[k], public.merge_records_by_id(p_base->k, p_next->k, result->k, k), true);
      continue;
    end if;
    if result->k is distinct from p_base->k and result->k is distinct from p_next->k then
      raise exception 'Another device changed %. Review your saved records before syncing.', k using errcode='40001';
    end if;
    if p_next ? k then result := jsonb_set(result, array[k], p_next->k, true);
    else result := result - k; end if;
  end loop;
  return result;
end;
$function$;

-- ── 2. the worker's door ───────────────────────────────────────────────────

create or replace function public.staff_send_records(
  p_token text, p_device_key text, p_customers jsonb, p_expense_requests jsonb, p_piece_work jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_data jsonb;
  v_now timestamptz := now();
  v_staff jsonb;
  v_from jsonb;
  item jsonb;
  v_id text;
  v_name text;
  v_amount numeric;
  v_date timestamptz;
  v_qty int;
  v_rate numeric;
  got_customers jsonb := '[]'::jsonb;
  got_expenses jsonb := '[]'::jsonb;
  got_piece jsonb := '[]'::jsonb;
begin
  select * into v from public.staff_session_check(p_token, p_device_key);
  if v.o_error is not null then return jsonb_build_object('ok', false, 'error', v.o_error); end if;

  select data into v_data from public.stores where id = (v.o_store).id for update;
  v_data := coalesce(v_data, '{}'::jsonb);
  select m into v_staff from jsonb_array_elements(case when jsonb_typeof(v_data->'staffMembers') = 'array' then v_data->'staffMembers' else '[]'::jsonb end) m
    where m->>'id' = v.o_worker->>'id' limit 1;
  v_from := jsonb_build_object('staffId', v.o_worker->>'id', 'name', v.o_worker->>'name', 'at', v_now);

  -- Customers: added, never changed, by those who work the counter.
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

  -- Expense requests: always this worker's, always waiting.
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

  -- Piece work: only for a worker paid per piece, at the owner's rate.
  if coalesce(v_staff->>'payType', '') = 'per_piece' then
    for item in select e from jsonb_array_elements(case when jsonb_typeof(p_piece_work) = 'array' then p_piece_work else '[]'::jsonb end) e limit 50 loop
      v_id := item->>'id';
      continue when v_id is null or v_id !~ '^[A-Za-z0-9_.:-]{1,64}$';
      begin
        v_qty := (item->>'quantity')::int;
      exception when others then continue;
      end;
      continue when v_qty is null or v_qty < 1 or v_qty > 1000;
      continue when coalesce(item->>'task', '') = '' or coalesce(item->>'garmentType', '') = '';
      select coalesce(
        (select (r->>'rate')::numeric from jsonb_array_elements(coalesce(v_staff->'pieceRates', '[]'::jsonb)) r
          where r->>'task' = item->>'task' and lower(r->>'garmentType') = lower(item->>'garmentType') limit 1),
        (select (r->>'rate')::numeric from jsonb_array_elements(coalesce(v_staff->'pieceRates', '[]'::jsonb)) r
          where r->>'task' = item->>'task' and r->>'garmentType' = '*' limit 1),
        0) into v_rate;
      v_rate := greatest(0, v_rate);
      if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_data->'pieceWork') = 'array' then v_data->'pieceWork' else '[]'::jsonb end) w where w->>'id' = v_id) then
        v_data := jsonb_set(v_data, '{pieceWork}', jsonb_build_array(jsonb_build_object(
          'id', v_id, 'workerId', v.o_worker->>'id', 'workerName', v.o_worker->>'name',
          'clientRef', left(coalesce(item->>'clientRef', ''), 64), 'tagCode', left(coalesce(item->>'tagCode', ''), 16),
          'customerName', left(coalesce(item->>'customerName', ''), 80),
          'task', left(item->>'task', 40), 'garmentType', left(item->>'garmentType', 60),
          'quantity', v_qty, 'rate', v_rate, 'amount', round(v_rate * v_qty, 2),
          'at', v_now, 'approved', false, '_fromStaff', v_from
        )) || case when jsonb_typeof(v_data->'pieceWork') = 'array' then v_data->'pieceWork' else '[]'::jsonb end, true);
      end if;
      got_piece := got_piece || to_jsonb(v_id);
    end loop;
  end if;

  update public.stores set data = v_data, updated_at = v_now where id = (v.o_store).id;
  update public.staff_devices set last_seen_at = v_now where id = v.o_device_id;
  return jsonb_build_object('ok', true, 'customers', got_customers, 'expenses', got_expenses, 'pieceWork', got_piece);
end;
$$;

-- ── 3. the owner collecting them ───────────────────────────────────────────

create or replace function public.store_staff_records_since(p_store_ref text, p_since timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
      where e ? '_fromStaff' and (p_since is null or (e->'_fromStaff'->>'at')::timestamptz > p_since))
  );
end;
$$;

-- Called inside merge_inventory_snapshot, which runs as the owner signed in:
-- they must be able to execute it. It reads nothing; it only merges lists.
revoke all on function public.merge_records_by_id(jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.merge_records_by_id(jsonb, jsonb, jsonb, text) to authenticated, service_role;
revoke all on function public.staff_send_records(text, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.staff_send_records(text, text, jsonb, jsonb, jsonb) to anon, authenticated;
revoke all on function public.store_staff_records_since(text, timestamptz) from public, anon;
grant execute on function public.store_staff_records_since(text, timestamptz) to authenticated;
