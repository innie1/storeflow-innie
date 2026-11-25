-- Two phones touching one record no longer stop the shop.
--
-- What happened (Washlie, 25 Nov): a manager's phone saved the price list,
-- and the cloud stamped three services "edited by" her. A minute later the
-- owner's phone wrote her new bundle into the books, which moves the
-- service's sales count. Different fields of the same service - but the
-- cloud compared the service whole, refused the owner's save, and held it
-- for review. The owner had touched nothing.
--
-- 1. merge_records_by_id settles a record both sides changed field by
--    field: what only one side changed is taken from that side. Only the
--    same field changed two different ways is still refused. Customers,
--    piece work, expense requests and services all go through here.
--
-- 2. A manager's change to a service or its prices waits for the owner.
--    staff_save_services no longer changes the shop. It keeps a request in
--    serviceChangeRequests - what the service says now, what the manager
--    wants, who and when - and only for what actually differs: a save with
--    nothing new leaves no trace. The owner's phone collects requests with
--    the rest of the workers' records (store_staff_records_since), tells the
--    owner, and applies one only when the owner taps Approve.
--
--    The door used to write the service, its catalogue entry and its whole
--    row of item prices straight into the shop. That is how, on 25 Nov, a
--    rename of Pillowcase to Uniform on the manager's phone removed the
--    shop's Pillowcase price and stamped three services "edited" - which
--    then refused the owner's next save.
--
-- 3. A manager may also rename an item or add one; that waits for the
--    owner too. One item gone from the phone's prices and one new in its
--    place is read as a rename (Pillowcase -> Uniform); other new items as
--    additions. An item the phone dropped is never removed from here.
--
-- 4. serviceChangeRequests merges record by record, like customers: the
--    door adds, the owner's phone decides, and neither overwrites the other.
--
-- The app's copy of rule 1 is mergeRecordFields in src/lib/store-sync-guard.ts.

-- ── 1. field by field ──────────────────────────────────────────────────────

create or replace function public.merge_record_fields(p_base jsonb, p_next jsonb, p_remote jsonb)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
  b jsonb := case when jsonb_typeof(p_base) = 'object' then p_base else '{}'::jsonb end;
  n jsonb := case when jsonb_typeof(p_next) = 'object' then p_next else '{}'::jsonb end;
  r jsonb := case when jsonb_typeof(p_remote) = 'object' then p_remote else '{}'::jsonb end;
  result jsonb := '{}'::jsonb; k text; v jsonb;
begin
  for k in select jsonb_object_keys(b || n || r) loop
    if n->k is not distinct from b->k then v := r->k;
    elsif r->k is not distinct from b->k or r->k is not distinct from n->k then v := n->k;
    else return null;
    end if;
    if v is not null then result := result || jsonb_build_object(k, v); end if;
  end loop;
  return result;
end;
$function$;

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
  rid text; b jsonb; n jsonb; r jsonb; pos int; merged jsonb;
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
    select (o - 1) into pos from jsonb_array_elements(result) with ordinality as x(e, o) where e->>'id' = rid limit 1;
    if r is distinct from b and r is distinct from n then
      merged := case when n is not null and r is not null then public.merge_record_fields(b, n, r) end;
      if merged is null then
        raise exception 'Another device changed the same record in %. Review your saved records before syncing.', p_key using errcode = '40001';
      end if;
      result := jsonb_set(result, array[pos::text], merged);
      continue;
    end if;
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

-- ── 2 and 3. the manager's door: a request, never a change ─────────────────

create or replace function public.staff_save_services(p_token text, p_device_key text, p_services jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record; v_data jsonb; v_now timestamptz := now(); v_from jsonb; item jsonb;
  v_id text; v_name text; v_price numeric; v_pricing text; v_off boolean; v_desc text; v_turn text;
  v_products jsonb; v_existing jsonb; v_row jsonb; g record; v_items text[]; v_item text; v_old numeric; v_new numeric;
  v_before jsonb; v_proposed jsonb; v_before_prices jsonb; v_new_prices jsonb; v_requests jsonb;
  v_unknown jsonb; v_missing jsonb; v_renames jsonb; v_adds jsonb; v_old_name text;
  saved jsonb := '[]'::jsonb; refused jsonb := '[]'::jsonb; v_wrote boolean := false;
begin
  select * into v from public.staff_session_check(p_token, p_device_key);
  if v.o_error is not null then return jsonb_build_object('ok', false, 'error', v.o_error); end if;
  -- The role the staff list gives, never the phone's word for it.
  if coalesce(v.o_worker->>'role', '') <> 'manager' then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select data into v_data from public.stores where id = (v.o_store).id for update;
  v_data := coalesce(v_data, '{}'::jsonb);
  v_from := jsonb_build_object('staffId', v.o_worker->>'id', 'name', v.o_worker->>'name', 'at', v_now);
  v_products := case when jsonb_typeof(v_data->'products') = 'array' then v_data->'products' else '[]'::jsonb end;
  v_requests := case when jsonb_typeof(v_data->'serviceChangeRequests') = 'array' then v_data->'serviceChangeRequests' else '[]'::jsonb end;
  -- The shop's item list, as the owner keeps it. Null for a shop without one.
  if jsonb_typeof(v_data->'laundryPricing'->'garmentTypes') = 'array' then
    select array_agg(lower(trim(x))) into v_items from jsonb_array_elements_text(v_data->'laundryPricing'->'garmentTypes') x;
  end if;

  for item in select e from jsonb_array_elements(case when jsonb_typeof(p_services) = 'array' then p_services else '[]'::jsonb end) e limit 50 loop
    v_id := item->>'id';
    continue when v_id is null or v_id !~ '^[A-Za-z0-9_.:-]{1,64}$';
    v_name := left(trim(coalesce(item->>'name', '')), 80);
    if v_name = '' then refused := refused || jsonb_build_object('id', v_id, 'reason', 'no_name'); continue; end if;
    begin
      v_price := round(coalesce((item->>'sellingPrice')::numeric, 0), 2);
    exception when others then v_price := null;
    end;
    if v_price is null or v_price < 0 or v_price >= 100000000 then
      refused := refused || jsonb_build_object('id', v_id, 'reason', 'bad_price'); continue;
    end if;
    v_pricing := case when item->>'servicePricing' in
      ('fixed', 'per_piece', 'per_kg', 'per_load', 'per_bundle', 'per_page', 'per_hour', 'per_session', 'appointment', 'quote')
      then item->>'servicePricing' else 'fixed' end;
    v_off := item->'discontinued' = 'true'::jsonb;
    v_desc := left(trim(coalesce(item->>'description', '')), 500);
    v_turn := left(trim(coalesce(item->>'turnaround', '')), 40);

    v_existing := null;
    select x.e into v_existing from jsonb_array_elements(v_products) x(e) where x.e->>'id' = v_id limit 1;
    if v_existing is not null and v_existing->'isService' is distinct from 'true'::jsonb then
      refused := refused || jsonb_build_object('id', v_id, 'reason', 'not_a_service'); continue;
    end if;

    -- Only what differs from the shop, beside what the shop has now.
    v_before := '{}'::jsonb; v_proposed := '{}'::jsonb;
    if v_existing is null then
      v_proposed := jsonb_build_object('name', v_name, 'description', v_desc, 'sellingPrice', v_price,
        'turnaround', v_turn, 'servicePricing', v_pricing, 'discontinued', v_off);
    else
      if trim(coalesce(v_existing->>'name', '')) <> v_name then
        v_before := v_before || jsonb_build_object('name', v_existing->'name');
        v_proposed := v_proposed || jsonb_build_object('name', v_name);
      end if;
      if coalesce(v_existing->>'description', '') <> v_desc then
        v_before := v_before || jsonb_build_object('description', coalesce(v_existing->>'description', ''));
        v_proposed := v_proposed || jsonb_build_object('description', v_desc);
      end if;
      if coalesce((v_existing->>'sellingPrice')::numeric, -1) <> v_price then
        v_before := v_before || jsonb_strip_nulls(jsonb_build_object('sellingPrice', v_existing->'sellingPrice'));
        v_proposed := v_proposed || jsonb_build_object('sellingPrice', v_price);
      end if;
      if coalesce(v_existing->>'turnaround', '') <> v_turn then
        v_before := v_before || jsonb_build_object('turnaround', coalesce(v_existing->>'turnaround', ''));
        v_proposed := v_proposed || jsonb_build_object('turnaround', v_turn);
      end if;
      -- A service saved before it had a way of charging is charged however the app reads it.
      if v_existing ? 'servicePricing' and v_existing->>'servicePricing' <> v_pricing then
        v_before := v_before || jsonb_build_object('servicePricing', v_existing->'servicePricing');
        v_proposed := v_proposed || jsonb_build_object('servicePricing', v_pricing);
      end if;
      if coalesce(v_existing->'discontinued' = 'true'::jsonb, false) <> v_off then
        v_before := v_before || jsonb_build_object('discontinued', coalesce(v_existing->'discontinued' = 'true'::jsonb, false));
        v_proposed := v_proposed || jsonb_build_object('discontinued', v_off);
      end if;
    end if;

    -- Item prices, only for items on the shop's list, only where they differ.
    v_row := case when jsonb_typeof(v_data->'laundryPricing'->'matrix'->v_id) = 'object' then v_data->'laundryPricing'->'matrix'->v_id else '{}'::jsonb end;
    v_before_prices := '{}'::jsonb; v_new_prices := '{}'::jsonb;
    v_unknown := '{}'::jsonb; v_renames := '[]'::jsonb; v_adds := '[]'::jsonb;
    if jsonb_typeof(item->'garmentPrices') = 'object' then
      for g in select key, value from jsonb_each(item->'garmentPrices') limit 200 loop
        continue when length(g.key) = 0 or length(g.key) > 40 or jsonb_typeof(g.value) <> 'number';
        continue when (g.value)::text::numeric < 0 or (g.value)::text::numeric >= 100000000;
        -- An item the shop does not have yet: a new item, or a new name for one
        -- (sorted out below). Either way the owner decides.
        if v_items is not null and not (lower(trim(g.key)) = any(v_items)) then
          -- Old names left in the shop's own rows from earlier renames are not
          -- new: the phone is only sending back what it was given.
          continue when exists (select 1 from jsonb_object_keys(v_row) k where lower(trim(k)) = lower(trim(g.key)));
          if (select count(*) from jsonb_object_keys(v_unknown)) < 20 then
            v_unknown := v_unknown || jsonb_build_object(left(trim(g.key), 40), round((g.value)::text::numeric));
          end if;
          continue;
        end if;
        v_item := null;
        select k into v_item from jsonb_object_keys(v_row) k where lower(trim(k)) = lower(trim(g.key)) limit 1;
        v_new := round((g.value)::text::numeric);
        v_old := case when v_item is not null and jsonb_typeof(v_row->v_item) = 'number' then round((v_row->>v_item)::numeric) end;
        continue when v_old is not distinct from v_new;
        v_item := coalesce(v_item, trim(g.key));
        v_new_prices := v_new_prices || jsonb_build_object(v_item, v_new);
        if v_old is not null then v_before_prices := v_before_prices || jsonb_build_object(v_item, v_old); end if;
      end loop;
      -- Items the shop prices for this service that the phone no longer has.
      v_missing := '[]'::jsonb;
      if v_items is not null then
        select coalesce(jsonb_agg(t.x), '[]'::jsonb) into v_missing
          from jsonb_array_elements_text(v_data->'laundryPricing'->'garmentTypes') t(x)
          where exists (select 1 from jsonb_object_keys(v_row) k where lower(trim(k)) = lower(trim(t.x)) and jsonb_typeof(v_row->k) = 'number')
            and not exists (select 1 from jsonb_object_keys(item->'garmentPrices') k where lower(trim(k)) = lower(trim(t.x)));
      end if;
      if (select count(*) from jsonb_object_keys(v_unknown)) = 1 and jsonb_array_length(v_missing) = 1 then
        -- One item gone and one new in its place: renamed. Pillowcase → Uniform.
        select k into v_item from jsonb_object_keys(v_unknown) k limit 1;
        select k into v_old_name from jsonb_object_keys(v_row) k where lower(trim(k)) = lower(trim(v_missing->>0)) limit 1;
        v_renames := jsonb_build_array(jsonb_build_object('from', v_missing->>0, 'to', v_item));
        v_new_prices := v_new_prices || jsonb_build_object(v_item, v_unknown->v_item);
        v_before_prices := v_before_prices || jsonb_build_object(v_item, v_row->v_old_name);
      elsif v_unknown <> '{}'::jsonb then
        -- New items. One the phone dropped is never removed from here.
        select jsonb_agg(k) into v_adds from jsonb_object_keys(v_unknown) k;
        v_new_prices := v_new_prices || v_unknown;
      end if;
    end if;
    if v_renames <> '[]'::jsonb then
      v_proposed := v_proposed || jsonb_build_object('itemRenames', v_renames);
    end if;
    if v_adds <> '[]'::jsonb then
      v_proposed := v_proposed || jsonb_build_object('addItems', v_adds);
    end if;
    if v_new_prices <> '{}'::jsonb then
      v_proposed := v_proposed || jsonb_build_object('garmentPrices', v_new_prices);
      v_before := v_before || jsonb_build_object('garmentPrices', v_before_prices);
    end if;

    -- Nothing new: answered, and nothing written.
    if v_existing is not null and v_proposed = '{}'::jsonb then
      saved := saved || to_jsonb(v_id);
      continue;
    end if;

    v_requests := v_requests || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', 'sc_' || replace(gen_random_uuid()::text, '-', ''),
      'serviceId', v_id,
      'serviceName', coalesce(v_existing->>'name', v_name),
      'isNew', case when v_existing is null then true end,
      'before', v_before,
      'proposed', v_proposed,
      '_fromStaff', v_from,
      'status', 'pending'
    )));
    v_wrote := true;
    saved := saved || to_jsonb(v_id);
  end loop;

  if v_wrote then
    v_data := jsonb_set(v_data, '{serviceChangeRequests}', v_requests, true);
    update public.stores set data = v_data, updated_at = v_now where id = (v.o_store).id;
  end if;
  return jsonb_build_object('ok', true, 'saved', saved, 'refused', refused, 'waiting', v_wrote);
end;
$$;

-- ── 4. requests merge record by record ─────────────────────────────────────

create or replace function public.merge_inventory_snapshot(p_base jsonb, p_next jsonb, p_remote jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  k text; result jsonb := coalesce(p_remote, '{}'::jsonb);
  -- 'products' is checked below by its stock items only.
  financial text[] := array['sales','pendingPayments','cashBalance','bankBalance','inventoryMovements','expenses','restocks','investments','trash'];
  by_record text[] := array['customers','staffExpenseRequests','pieceWork','serviceChangeRequests'];
  changed boolean := false; same_base boolean := true; same_next boolean := true;
  b_stock jsonb; n_stock jsonb; r_stock jsonb; new_stock jsonb; services jsonb;
  bt_b jsonb; bt_n jsonb; bt_r jsonb; new_bt jsonb;
begin
  if jsonb_typeof(p_base) <> 'object' or jsonb_typeof(p_next) <> 'object' or jsonb_typeof(result) <> 'object' then
    raise exception 'Store snapshots must be objects';
  end if;
  b_stock := public.store_stock_items(p_base->'products');
  n_stock := public.store_stock_items(p_next->'products');
  r_stock := public.store_stock_items(result->'products');
  changed := b_stock is distinct from n_stock;
  same_base := b_stock is not distinct from r_stock;
  same_next := n_stock is not distinct from r_stock;
  foreach k in array financial loop
    changed := changed or (p_base->k is distinct from p_next->k);
    same_base := same_base and (p_base->k is not distinct from result->k);
    same_next := same_next and (p_next->k is not distinct from result->k);
  end loop;
  if changed and not same_base and not same_next then
    raise exception 'Another device changed stock or payments. Review your saved records before syncing.' using errcode = 'P0001';
  end if;
  for k in select jsonb_object_keys(p_base || p_next) loop
    if p_base->k is not distinct from p_next->k then continue; end if;
    if k = 'products' then
      new_stock := case when b_stock is distinct from n_stock then n_stock else r_stock end;
      services := public.merge_records_by_id(
        public.store_service_items(p_base->'products'), public.store_service_items(p_next->'products'),
        public.store_service_items(result->'products'), 'services');
      result := jsonb_set(result, '{products}', public.store_order_like(new_stock || services, p_next->'products'), true);
      continue;
    end if;
    if k = 'businessTemplate' then
      bt_b := case when jsonb_typeof(p_base->k) = 'object' then p_base->k else '{}'::jsonb end;
      bt_n := case when jsonb_typeof(p_next->k) = 'object' then p_next->k else '{}'::jsonb end;
      bt_r := case when jsonb_typeof(result->k) = 'object' then result->k else '{}'::jsonb end;
      if (bt_b - 'offerings') is distinct from (bt_n - 'offerings')
         and (bt_r - 'offerings') is distinct from (bt_b - 'offerings')
         and (bt_r - 'offerings') is distinct from (bt_n - 'offerings') then
        raise exception 'Another device changed %. Review your saved records before syncing.', k using errcode = 'P0001';
      end if;
      new_bt := case when (bt_b - 'offerings') is distinct from (bt_n - 'offerings') then bt_n - 'offerings' else bt_r - 'offerings' end;
      if bt_b ? 'offerings' or bt_n ? 'offerings' or bt_r ? 'offerings' then
        new_bt := new_bt || jsonb_build_object('offerings',
          public.merge_records_by_id(bt_b->'offerings', bt_n->'offerings', bt_r->'offerings', 'services'));
      end if;
      result := jsonb_set(result, array[k], new_bt, true);
      continue;
    end if;
    if k = any(by_record) then
      result := jsonb_set(result, array[k], public.merge_records_by_id(p_base->k, p_next->k, result->k, k), true);
      continue;
    end if;
    if result->k is distinct from p_base->k and result->k is distinct from p_next->k then
      raise exception 'Another device changed %. Review your saved records before syncing.', k using errcode = 'P0001';
    end if;
    if p_next ? k then result := jsonb_set(result, array[k], p_next->k, true);
    else result := result - k; end if;
  end loop;
  return result;
end;
$function$;

-- ── the owner's phone collects requests with the rest ──────────────────────

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
    'serviceChangeRequests', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(v_store.data->'serviceChangeRequests') = 'array' then v_store.data->'serviceChangeRequests' else '[]'::jsonb end) e
      where e->>'status' = 'pending' and (p_since is null or (e->'_fromStaff'->>'at')::timestamptz > p_since)),
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

-- ── who may call what ──────────────────────────────────────────────────────

revoke all on function public.merge_record_fields(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.merge_record_fields(jsonb, jsonb, jsonb) to authenticated, service_role;
