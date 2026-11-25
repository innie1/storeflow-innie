-- The cloud books a worker's money itself, the moment it is taken.
--
-- Until now a worker's payment waited in staff_laundry_payments until the
-- owner's phone opened, collected it, and wrote it into the books (a sale,
-- and the bundle's line in Money Owed). With the owner's phone closed all
-- day, the shop's books in the cloud were a day behind; and the owner's phone
-- doing everyone's bookkeeping is what put two phones on one record.
--
-- 1. book_laundry_payment is the owner's phone's booking (recordLaundryPayment
--    in src/lib/laundry-money.ts, as addArrivedPayments in staff-records.ts
--    calls it), written again here field for field, so a payment booked by
--    the cloud is the very record the phone would have written.
--
-- 2. A trigger books every new worker payment into the shop as it is kept,
--    and marks it booked_at. A method sent afterwards fills in the sale too.
--
-- 3. store_staff_records_since says which payments the cloud booked and sends
--    its sale and Money Owed line with them: the owner's phone takes those,
--    and books by itself only what came before this.
--
-- 4. Sales and Money Owed merge record by record, like customers: the cloud
--    adding a worker's sale while the owner's phone adds its own keeps both.
--    Stock, cash and the other money records keep the all-or-nothing check.

alter table public.staff_laundry_payments add column if not exists booked_at timestamptz;

-- ── 1. the booking ──────────────────────────────────────────────────────────

create or replace function public.book_laundry_payment(p_data jsonb, p_pay jsonb)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
  data jsonb := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
  ref text := coalesce(p_pay->>'clientRef', '');
  owed_id text; at_text text := p_pay->>'at';
  owed jsonb; sales jsonb; existing jsonb;
  amount numeric; total numeric; paid_before numeric; remaining numeric; applied numeric;
  paid_after numeric; change numeric; balance numeric;
  tag text; svc_id text; svc_name text; product text; method text; how text; who text; role text;
  sale jsonb; event jsonb := null; entry jsonb;
begin
  if ref = '' or at_text is null then return data; end if;
  owed_id := 'laundry-' || ref;
  owed := case when jsonb_typeof(data->'pendingPayments') = 'array' then data->'pendingPayments' else '[]'::jsonb end;
  sales := case when jsonb_typeof(data->'sales') = 'array' then data->'sales' else '[]'::jsonb end;
  select e into existing from jsonb_array_elements(owed) e where e->>'id' = owed_id limit 1;

  -- addArrivedPayments: Math.max(0, Number(amount) || 0)
  amount := greatest(0, coalesce((p_pay->>'amount')::numeric, 0));
  -- Taken in with nothing paid, on a bundle already owed on: nothing new.
  if p_pay->>'kind' = 'intake' and amount <= 0 and existing is not null then return data; end if;

  -- recordLaundryPayment and settleLaundryPayment, money() being to the kobo.
  total := round(coalesce((p_pay->>'total')::numeric, 0), 2);
  if total <= 0 then return data; end if;
  amount := round(amount, 2);
  paid_before := case when existing is not null then round(coalesce((existing->>'paid')::numeric, 0), 2) else 0 end;
  paid_before := least(total, greatest(0, paid_before));
  remaining := greatest(0, total - paid_before);
  applied := least(remaining, amount);
  paid_after := least(total, paid_before + applied);
  change := greatest(0, amount - applied);
  balance := greatest(0, total - paid_after);
  total := trim_scale(total); applied := trim_scale(applied); paid_after := trim_scale(paid_after);
  balance := trim_scale(balance); change := trim_scale(change); amount := trim_scale(amount);

  tag := upper(coalesce(nullif(p_pay->>'tagCode', ''), left(ref, 8)));
  svc_id := coalesce(nullif(p_pay->>'serviceId', ''), 'laundry');
  svc_name := coalesce(nullif(p_pay->>'serviceName', ''), 'Laundry');
  product := svc_name || ' · ' || tag;
  -- A card machine pays into the bank, so POS is counted as transfer.
  method := case when p_pay->>'method' = 'cash' then 'cash' when p_pay->>'method' in ('transfer', 'pos') then 'transfer' end;
  -- Change given means cash: nobody gives change on a transfer.
  how := case when change > 0 then 'cash' else method end;
  who := nullif(p_pay->>'staffName', '');
  role := nullif(trim(coalesce(p_pay->>'staffRole', '')), '');

  if applied > 0 then
    sale := jsonb_build_object(
      'id', 'laundry-' || ref || '-' || at_text,
      'productId', svc_id, 'productName', product,
      'quantity', 1, 'unitPrice', applied, 'total', applied, 'profit', applied,
      'date', at_text, 'pendingPaymentId', owed_id, 'channel', 'in_store');
    if how is not null then
      sale := sale || jsonb_build_object('paymentMethod', how,
        'paymentAllocation', case when how = 'cash' then jsonb_build_object('cash', applied, 'bank', 0) else jsonb_build_object('cash', 0, 'bank', applied) end);
    end if;
    if nullif(trim(coalesce(who, '')), '') is not null then
      sale := sale || jsonb_build_object('recordedByName', trim(who));
      if role is not null then sale := sale || jsonb_build_object('recordedByRole', role); end if;
    end if;
    sales := sales || jsonb_build_array(sale);

    event := jsonb_build_object('date', at_text, 'amount', applied,
      'note', case when change > 0
        then tag || ' payment — ₦' || rtrim(to_char(amount, 'FM999,999,999,990.99'), '.') || ' tendered, ₦' || rtrim(to_char(change, 'FM999,999,999,990.99'), '.') || ' change'
        else tag || ' payment' end || case when who is not null then ' (taken by ' || who || ')' else '' end);
    if how is not null then event := event || jsonb_build_object('method', how); end if;
    if who is not null then event := event || jsonb_build_object('takenBy', who); end if;
  end if;

  entry := jsonb_build_object(
    'id', owed_id,
    'customerName', coalesce(nullif(p_pay->>'customerName', ''), 'Walk-in Customer'),
    'customerPhone', coalesce(p_pay->'customerPhone', 'null'::jsonb),
    'items', jsonb_build_array(jsonb_build_object('productId', svc_id, 'productName', product, 'quantity', 1, 'unitPrice', total)),
    'total', total, 'paid', paid_after, 'balance', balance,
    'dueDate', coalesce(p_pay->'promisedFor', 'null'::jsonb),
    'createdAt', coalesce(nullif(existing->>'createdAt', ''), at_text),
    'status', case when balance <= 0 then 'paid' else 'pending' end,
    'events', case when jsonb_typeof(existing->'events') = 'array' then existing->'events' else '[]'::jsonb end
              || case when event is null then '[]'::jsonb else jsonb_build_array(event) end);
  if existing ? 'customerId' then entry := entry || jsonb_build_object('customerId', existing->'customerId'); end if;
  if coalesce(existing->'takenInElsewhere', 'null'::jsonb) not in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb) then
    entry := entry || jsonb_build_object('takenInElsewhere', true);
  end if;

  select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into owed
    from jsonb_array_elements(owed) with ordinality x(e, o) where e->>'id' is distinct from owed_id;
  owed := owed || jsonb_build_array(entry);
  return data || jsonb_build_object('sales', sales, 'pendingPayments', owed);
end;
$function$;

-- What the owner's phone is sent for one payment; the booking reads the same.
create or replace function public.staff_payment_as_sent(p public.staff_laundry_payments)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'clientRef', p.client_ref, 'amount', p.amount, 'at', p.paid_at,
    'staffId', p.staff_id, 'staffName', p.staff_name, 'staffRole', p.staff_role, 'method', p.method,
    'total', o.total, 'tagCode', o.order_number, 'customerName', o.customer_name, 'customerPhone', o.customer_phone,
    'serviceId', o.service_metadata->>'service_id', 'serviceName', o.service_metadata->>'service_name',
    'promisedFor', o.service_metadata->>'promised_for')
  from public.orders o where o.id = p.order_id;
$function$;

-- ── 2. booked as it is kept ─────────────────────────────────────────────────

create or replace function public.staff_payment_book()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  pay jsonb := public.staff_payment_as_sent(new);
  sale_id text; how text;
begin
  if pay is null then return null; end if;
  if tg_op = 'INSERT' then
    update public.stores set data = public.book_laundry_payment(coalesce(data, '{}'::jsonb), pay), updated_at = now()
      where id = new.store_id;
    update public.staff_laundry_payments set booked_at = now() where store_id = new.store_id and id = new.id;
    return null;
  end if;
  -- A method sent after the payment: the sale and the payment line learn it,
  -- where they do not already say.
  if old.method is null and new.method is not null and new.booked_at is not null then
    how := case when new.method = 'cash' then 'cash' else 'transfer' end;
    sale_id := 'laundry-' || new.client_ref || '-' || (pay->>'at');
    update public.stores s set data = jsonb_set(jsonb_set(s.data,
        '{sales}', (select coalesce(jsonb_agg(case when e->>'id' = sale_id and not (e ? 'paymentMethod')
            then e || jsonb_build_object('paymentMethod', how, 'paymentAllocation',
              case when how = 'cash' then jsonb_build_object('cash', e->'total', 'bank', 0) else jsonb_build_object('cash', 0, 'bank', e->'total') end)
            else e end order by o), '[]'::jsonb)
          from jsonb_array_elements(s.data->'sales') with ordinality x(e, o))),
        '{pendingPayments}', (select coalesce(jsonb_agg(case when e->>'id' = 'laundry-' || new.client_ref
            then jsonb_set(e, '{events}', (select coalesce(jsonb_agg(case when ev->>'date' = pay->>'at' and not (ev ? 'method')
                then ev || jsonb_build_object('method', how) else ev end order by eo), '[]'::jsonb)
              from jsonb_array_elements(case when jsonb_typeof(e->'events') = 'array' then e->'events' else '[]'::jsonb end) with ordinality y(ev, eo)))
            else e end order by o), '[]'::jsonb)
          from jsonb_array_elements(s.data->'pendingPayments') with ordinality x(e, o))),
      updated_at = now()
      where s.id = new.store_id and jsonb_typeof(s.data->'sales') = 'array' and jsonb_typeof(s.data->'pendingPayments') = 'array';
  end if;
  return null;
exception when others then
  -- Never at the cost of the payment itself: left unbooked, the owner's phone
  -- books it the way it always has.
  return null;
end;
$function$;

drop trigger if exists staff_payment_book on public.staff_laundry_payments;
create trigger staff_payment_book
  after insert or update of method on public.staff_laundry_payments
  for each row execute function public.staff_payment_book();

-- ── 3. the owner's phone is told what the cloud booked ──────────────────────

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
    'payments', (select coalesce(jsonb_agg(
        public.staff_payment_as_sent(p) || case when p.booked_at is null then '{}'::jsonb else jsonb_build_object(
          'booked', true,
          'sale', (select e from jsonb_array_elements(case when jsonb_typeof(v_store.data->'sales') = 'array' then v_store.data->'sales' else '[]'::jsonb end) e
                    where e->>'id' = 'laundry-' || p.client_ref || '-' || (to_jsonb(p.paid_at)#>>'{}') limit 1),
          'owed', (select e from jsonb_array_elements(case when jsonb_typeof(v_store.data->'pendingPayments') = 'array' then v_store.data->'pendingPayments' else '[]'::jsonb end) e
                    where e->>'id' = 'laundry-' || p.client_ref limit 1)) end
        order by p.paid_at), '[]'::jsonb)
      from public.staff_laundry_payments p
      where p.store_id = v_store.id and (p_since is null or p.created_at > p_since))
  );
end;
$function$;

-- ── 4. sales and Money Owed merge record by record ──────────────────────────

create or replace function public.merge_inventory_snapshot(p_base jsonb, p_next jsonb, p_remote jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  k text; result jsonb := coalesce(p_remote, '{}'::jsonb);
  -- 'products' is checked below by its stock items only.
  financial text[] := array['cashBalance','bankBalance','inventoryMovements','expenses','restocks','investments','trash'];
  by_record text[] := array['customers','staffExpenseRequests','pieceWork','serviceChangeRequests','sales','pendingPayments'];
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

-- ── who may call what ──────────────────────────────────────────────────────

revoke all on function public.book_laundry_payment(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.staff_payment_as_sent(public.staff_laundry_payments) from public, anon, authenticated;
revoke all on function public.staff_payment_book() from public, anon, authenticated;
