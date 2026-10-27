-- A service a manager makes on their own phone is the shop's service.
--
-- A worker's phone keeps a slim copy of the shop and is never sent up as the
-- shop; what a worker does travels as single records through doors that
-- check who they are. Services had no door. A manager could add one on their
-- phone, but the owner's phone never got it, nor did the customer page - and
-- the next refresh of the manager's own copy took it away again.
--
-- staff_save_services is that door, for any kind of shop:
--   - only a worker the staff list names as a manager - the same people the
--     app lets open Services - and only services: an id that belongs to a
--     stock item is refused, so the door cannot touch stock;
--   - add, edit, switch on and off. Nothing is ever removed here: deleting a
--     service stays with the owner;
--   - each service is written where the shop keeps it - the product list,
--     the customer page's catalogue (businessTemplate.offerings) and, for a
--     laundry, that service's row of item prices - with who did it;
--   - what is accepted is checked and trimmed here, never taken as sent.
--
-- And the owner's phone has to be able to take it. The cloud used to compare
-- the whole product list as one block, stock and services together, so a
-- service arriving from a manager's phone would have made the owner's next
-- sale fail with "another device changed stock". Stock keeps exactly that
-- check. Services are now merged one by one, as customers and piece work
-- already are; so is the customer page's catalogue. Two phones changing the
-- same service at once is still a conflict for the owner to look at.

-- ── the product list, split ────────────────────────────────────────────────

create or replace function public.store_service_items(p_products jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.e order by x.o), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_products) = 'array' then p_products else '[]'::jsonb end) with ordinality x(e, o)
  where x.e->'isService' = 'true'::jsonb;
$$;

create or replace function public.store_stock_items(p_products jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.e order by x.o), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_products) = 'array' then p_products else '[]'::jsonb end) with ordinality x(e, o)
  where x.e->'isService' is distinct from 'true'::jsonb;
$$;

-- Items in the order a reference list has them; anything it lacks after.
create or replace function public.store_order_like(p_items jsonb, p_reference jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(i.e order by coalesce(r.o, 1000000 + i.o)), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) with ordinality i(e, o)
  left join lateral (
    select ref.o from jsonb_array_elements(case when jsonb_typeof(p_reference) = 'array' then p_reference else '[]'::jsonb end) with ordinality ref(e, o)
    where i.e->>'id' is not null and ref.e->>'id' = i.e->>'id'
    limit 1
  ) r on true;
$$;

-- ── the merge, with services by record ─────────────────────────────────────

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
  by_record text[] := array['customers','staffExpenseRequests','pieceWork'];
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

-- ── the door ───────────────────────────────────────────────────────────────

create or replace function public.staff_save_services(p_token text, p_device_key text, p_services jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record; v_data jsonb; v_now timestamptz := now(); v_from jsonb; item jsonb;
  v_id text; v_name text; v_price numeric; v_pricing text; v_off boolean;
  v_products jsonb; v_existing jsonb; v_pos int; v_service jsonb; v_flow jsonb; v_duration int;
  v_offerings jsonb; v_offering jsonb; v_template jsonb; v_row jsonb; v_pricing_cfg jsonb; g record;
  saved jsonb := '[]'::jsonb; refused jsonb := '[]'::jsonb;
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

    v_products := case when jsonb_typeof(v_data->'products') = 'array' then v_data->'products' else '[]'::jsonb end;
    v_existing := null; v_pos := null;
    select x.e, (x.o - 1)::int into v_existing, v_pos
      from jsonb_array_elements(v_products) with ordinality x(e, o) where x.e->>'id' = v_id limit 1;
    if v_existing is not null and v_existing->'isService' is distinct from 'true'::jsonb then
      refused := refused || jsonb_build_object('id', v_id, 'reason', 'not_a_service'); continue;
    end if;

    begin
      v_duration := (item->'serviceWorkflow'->>'durationMinutes')::int;
    exception when others then v_duration := null;
    end;
    v_flow := jsonb_strip_nulls(jsonb_build_object(
      'mode', case when item->'serviceWorkflow'->>'mode' in ('job', 'session', 'appointment') then item->'serviceWorkflow'->>'mode' else 'job' end,
      'requiresStart', item->'serviceWorkflow'->'requiresStart' is distinct from 'false'::jsonb,
      'timer', item->'serviceWorkflow'->'timer' = 'true'::jsonb,
      'allowPause', item->'serviceWorkflow'->'allowPause' = 'true'::jsonb,
      'allowAddTime', item->'serviceWorkflow'->'allowAddTime' = 'true'::jsonb,
      'durationMinutes', case when v_duration between 1 and 1440 then v_duration end
    ));
    v_service := jsonb_strip_nulls(jsonb_build_object(
      'name', v_name,
      'description', left(trim(coalesce(item->>'description', '')), 500),
      'sellingPrice', v_price,
      'unit', case when item->>'unit' in ('pcs', 'kg', 'liter', 'load', 'bundle') then item->>'unit' end,
      'turnaround', left(trim(coalesce(item->>'turnaround', '')), 40),
      'servicePricing', v_pricing,
      'serviceWorkflow', v_flow,
      'discontinued', v_off
    ));
    if v_existing is not null then
      v_service := v_existing || v_service || jsonb_build_object('_editedByStaff', v_from);
      v_products := jsonb_set(v_products, array[v_pos::text], v_service);
    else
      v_service := v_service || jsonb_build_object('id', v_id, 'isService', true, 'category', 'Service',
        'costPrice', 0, 'quantity', 999999, 'addedAt', v_now, '_fromStaff', v_from);
      v_products := v_products || jsonb_build_array(v_service);
    end if;
    v_data := jsonb_set(v_data, '{products}', v_products, true);

    -- The customer page's catalogue: listed while on, gone while off.
    v_template := case when jsonb_typeof(v_data->'businessTemplate') = 'object' then v_data->'businessTemplate' else '{}'::jsonb end;
    v_offerings := coalesce((
      select jsonb_agg(o) from jsonb_array_elements(case when jsonb_typeof(v_template->'offerings') = 'array' then v_template->'offerings' else '[]'::jsonb end) o
      where o->>'id' is distinct from v_id
    ), '[]'::jsonb);
    if not v_off then
      v_offering := jsonb_strip_nulls(jsonb_build_object(
        'id', v_id, 'name', v_name, 'description', v_service->>'description',
        'price', v_price, 'sellingPrice', v_price, 'pricing', v_pricing, 'unit', v_service->>'unit',
        'unitLabel', left(coalesce(item->>'unitLabel', ''), 30), 'turnaround', v_service->>'turnaround',
        'enabled', true, 'active', true, 'discontinued', false, 'serviceWorkflow', v_flow
      ));
      v_offerings := v_offerings || jsonb_build_array(v_offering);
    end if;
    v_template := v_template || jsonb_build_object('offerings', v_offerings,
      'modes', (select coalesce(jsonb_agg(distinct m), '[]'::jsonb) from jsonb_array_elements(
        case when jsonb_typeof(v_template->'modes') = 'array' then v_template->'modes' else '[]'::jsonb end || '["services"]'::jsonb) m));
    v_data := jsonb_set(v_data, '{businessTemplate}', v_template, true);

    -- A laundry's price for each item, for this service only.
    if jsonb_typeof(item->'garmentPrices') = 'object' then
      v_row := '{}'::jsonb;
      for g in select key, value from jsonb_each(item->'garmentPrices') limit 200 loop
        continue when length(g.key) = 0 or length(g.key) > 40 or jsonb_typeof(g.value) <> 'number';
        continue when (g.value)::text::numeric < 0 or (g.value)::text::numeric >= 100000000;
        v_row := v_row || jsonb_build_object(g.key, round((g.value)::text::numeric));
      end loop;
      v_pricing_cfg := case when jsonb_typeof(v_data->'laundryPricing') = 'object' then v_data->'laundryPricing' else jsonb_build_object('version', 1) end;
      v_pricing_cfg := v_pricing_cfg || jsonb_build_object('matrix',
        (case when jsonb_typeof(v_pricing_cfg->'matrix') = 'object' then v_pricing_cfg->'matrix' else '{}'::jsonb end) || jsonb_build_object(v_id, v_row));
      v_data := jsonb_set(v_data, '{laundryPricing}', v_pricing_cfg, true);
    end if;

    saved := saved || to_jsonb(v_id);
  end loop;

  if jsonb_array_length(saved) > 0 then
    update public.stores set data = v_data, updated_at = v_now where id = (v.o_store).id;
  end if;
  return jsonb_build_object('ok', true, 'saved', saved, 'refused', refused);
end;
$$;

-- ── the worker's copy carries the item prices ──────────────────────────────

-- A manager's phone compares its services with the cloud's, item prices
-- included, so the copy has to hold them. They are selling prices, which the
-- customer page already shows; costs stay out as before.
create or replace function public.staff_shop_view(p_store public.stores, p_staff_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with d as (select coalesce(p_store.data, '{}'::jsonb) as data),
  arr as (
    select
      case when jsonb_typeof(d.data->'products') = 'array' then d.data->'products' else '[]'::jsonb end as products,
      case when jsonb_typeof(d.data->'supplies') = 'array' then d.data->'supplies' else '[]'::jsonb end as supplies,
      case when jsonb_typeof(d.data->'customers') = 'array' then d.data->'customers' else '[]'::jsonb end as customers,
      case when jsonb_typeof(d.data->'staffMembers') = 'array' then d.data->'staffMembers' else '[]'::jsonb end as staff,
      case when jsonb_typeof(d.data->'pieceWork') = 'array' then d.data->'pieceWork' else '[]'::jsonb end as piece_work,
      case when jsonb_typeof(d.data->'staffExpenseRequests') = 'array' then d.data->'staffExpenseRequests' else '[]'::jsonb end as expense_requests
    from d
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'storeName', d.data->'storeName', 'category', d.data->'category', 'retailType', d.data->'retailType',
    'businessType', d.data->'businessType', 'storeType', d.data->'storeType', 'uiMode', d.data->'uiMode',
    'simpleModeSettings', d.data->'simpleModeSettings', 'businessTemplate', d.data->'businessTemplate',
    'loyaltySettings', d.data->'loyaltySettings', 'laundryEquipment', d.data->'laundryEquipment', 'createdAt', d.data->'createdAt',
    -- What each item costs the customer, per service: selling prices, as on the customer page.
    'laundryPricing', case when jsonb_typeof(d.data->'laundryPricing') = 'object' then d.data->'laundryPricing' end,
    'profile', (
      select jsonb_object_agg(e.key, e.value) from jsonb_each(case when jsonb_typeof(d.data->'profile') = 'object' then d.data->'profile' else '{}'::jsonb end) e
      where e.key in ('storeType', 'location', 'phone', 'photo', 'logoStyle', 'website', 'openingTime', 'closingTime', 'openingDate')
    ),
    'products', (
      select coalesce(jsonb_agg(p - array['costPrice', 'priceHistory', 'total_revenue', 'total_profit', 'units_sold',
        'restock_count', 'initialQuantity', 'addedAt', 'first_sale_at', 'last_sold_at', 'source', 'needsStockSetup', 'image']), '[]'::jsonb)
      from jsonb_array_elements(arr.products) p
    ),
    'supplies', (select coalesce(jsonb_agg(s - array['lastPurchaseCost']), '[]'::jsonb) from jsonb_array_elements(arr.supplies) s),
    'customers', (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', c->'id', 'name', c->'name', 'phone', c->'phone', 'address', c->'address',
        'loyaltyPoints', c->'loyaltyPoints', 'visitsCount', c->'visitsCount', 'lastPurchaseDate', c->'lastPurchaseDate'
      ))), '[]'::jsonb)
      from jsonb_array_elements(arr.customers) c
    ),
    'staffMembers', (select coalesce(jsonb_agg(m - array['pin', 'monthlySalary']), '[]'::jsonb) from jsonb_array_elements(arr.staff) m where m->>'id' = p_staff_id),
    'pieceWork', (select coalesce(jsonb_agg(w), '[]'::jsonb) from jsonb_array_elements(arr.piece_work) w where w->>'workerId' = p_staff_id),
    'staffExpenseRequests', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(arr.expense_requests) x where x->'recordedBy'->>'staffId' = p_staff_id),
    'managerSettings', jsonb_build_object(
      'staffExpenseApproval', d.data->'managerSettings'->'staffExpenseApproval',
      'staffExpenseFreeLimit', d.data->'managerSettings'->'staffExpenseFreeLimit',
      'workerLockTimer', case when d.data->'managerSettings'->>'workerLockTimer' in ('1h', '4h', '8h', '12h', 'never')
        then d.data->'managerSettings'->'workerLockTimer' end
    )
  ))
  from d, arr;
$$;

-- ── who may call what ──────────────────────────────────────────────────────

-- The three list helpers stay callable like merge_records_by_id: they only
-- reshape what they are given, and the owner's sync runs as the owner.
revoke all on function public.staff_save_services(text, text, jsonb) from public;
grant execute on function public.staff_save_services(text, text, jsonb) to anon, authenticated;
