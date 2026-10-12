-- A worker signs in on their own approved phone, and gets a slim copy of the
-- shop: what their work needs, and nothing of the owner's.
--
-- Step 5a of the staff plan. The phone was authorized by the owner with a
-- one-time code (20261011214039_staff_device_join). Now:
--
--   staff_sign_in      phone + the worker's own PIN -> a pass for 24 hours,
--                      and the slim copy of the shop
--   staff_session_view the pass -> a fresh slim copy, without the PIN
--
-- The pass is random, kept here only as a hash, tied to that phone and that
-- worker, and good for 24 hours. The worker's role always comes from the
-- shop's own staff list in the cloud, never from what the phone says, so a
-- phone cannot give itself more than its worker has. A phone that has been
-- revoked, or a worker who has been removed from the staff list, gets no pass
-- and no copy.
--
-- The slim copy is an allow-list, not a deny-list, so a field added to the
-- shop later stays off workers' phones until somebody decides it belongs.
-- It carries: the shop's name and kind, the price list (without cost prices
-- or sales figures), the laundry price matrix, supplies (without what they
-- cost), customers (name, phone, address, visits, loyalty - no spending or
-- debt), equipment, the shop's public profile (no email, bank details or
-- rent), this worker's own staff record (no PIN, no salary), this worker's
-- own piece work and expense requests, and the shop's staff-expense rule.
-- It never carries sales, expenses, balances, profit, other workers, PINs,
-- salaries, the access code, or anything of the owner's account.
--
-- Wrong PINs count towards the same pause as joining: 5 from one phone or 10
-- for one shop in an hour.

create table if not exists public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.staff_devices(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists staff_sessions_device_idx on public.staff_sessions (device_id);
alter table public.staff_sessions enable row level security;
revoke all on public.staff_sessions from anon, authenticated;

-- ── the slim copy ──────────────────────────────────────────────────────────

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
    'storeName', d.data->'storeName',
    'category', d.data->'category',
    'retailType', d.data->'retailType',
    'businessType', d.data->'businessType',
    'storeType', d.data->'storeType',
    'uiMode', d.data->'uiMode',
    'simpleModeSettings', d.data->'simpleModeSettings',
    'businessTemplate', d.data->'businessTemplate',
    'loyaltySettings', d.data->'loyaltySettings',
    'laundryEquipment', d.data->'laundryEquipment',
    'createdAt', d.data->'createdAt',
    'profile', (
      select jsonb_object_agg(e.key, e.value) from jsonb_each(case when jsonb_typeof(d.data->'profile') = 'object' then d.data->'profile' else '{}'::jsonb end) e
      where e.key in ('storeType', 'location', 'phone', 'photo', 'logoStyle', 'website', 'openingTime', 'closingTime', 'openingDate')
    ),
    'products', (
      select coalesce(jsonb_agg(p - array['costPrice', 'priceHistory', 'total_revenue', 'total_profit', 'units_sold',
        'restock_count', 'initialQuantity', 'addedAt', 'first_sale_at', 'last_sold_at', 'source', 'needsStockSetup', 'image']), '[]'::jsonb)
      from jsonb_array_elements(arr.products) p
    ),
    'supplies', (
      select coalesce(jsonb_agg(s - array['lastPurchaseCost']), '[]'::jsonb) from jsonb_array_elements(arr.supplies) s
    ),
    'customers', (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', c->'id', 'name', c->'name', 'phone', c->'phone', 'address', c->'address',
        'loyaltyPoints', c->'loyaltyPoints', 'visitsCount', c->'visitsCount', 'lastPurchaseDate', c->'lastPurchaseDate'
      ))), '[]'::jsonb)
      from jsonb_array_elements(arr.customers) c
    ),
    'staffMembers', (
      select coalesce(jsonb_agg(m - array['pin', 'monthlySalary']), '[]'::jsonb)
      from jsonb_array_elements(arr.staff) m where m->>'id' = p_staff_id
    ),
    'pieceWork', (
      select coalesce(jsonb_agg(w), '[]'::jsonb) from jsonb_array_elements(arr.piece_work) w where w->>'workerId' = p_staff_id
    ),
    'staffExpenseRequests', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(arr.expense_requests) x where x->'recordedBy'->>'staffId' = p_staff_id
    ),
    'managerSettings', jsonb_build_object(
      'staffExpenseApproval', d.data->'managerSettings'->'staffExpenseApproval',
      'staffExpenseFreeLimit', d.data->'managerSettings'->'staffExpenseFreeLimit'
    )
  ))
  from d, arr;
$$;

-- This worker as the shop's staff list says, never as the phone says.
create or replace function public.staff_session_worker(p_store public.stores, p_staff_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', m->>'id', 'name', m->>'name', 'role', m->>'role', 'permissions', coalesce(m->'permissions', '{}'::jsonb))
  from jsonb_array_elements(case when jsonb_typeof(p_store.data->'staffMembers') = 'array' then p_store.data->'staffMembers' else '[]'::jsonb end) m
  where m->>'id' = p_staff_id and coalesce(m->>'role', '') <> 'owner'
  limit 1;
$$;

-- ── the worker's phone ─────────────────────────────────────────────────────

create or replace function public.staff_sign_in(p_request_id uuid, p_device_key text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text := public.staff_join_hash(p_device_key);
  v_device public.staff_devices;
  v_store public.stores;
  v_worker jsonb;
  v_token text;
  v_expires timestamptz := now() + interval '24 hours';
begin
  select * into v_device from public.staff_devices where id = p_request_id and device_key_hash = v_key;
  if v_device.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_device.status <> 'authorized' then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;
  select * into v_store from public.stores where id = v_device.store_id;
  if v_store.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if public.staff_join_paused(v_store.id, v_key) then
    return jsonb_build_object('ok', false, 'error', 'paused');
  end if;
  v_worker := public.staff_session_worker(v_store, v_device.staff_id);
  if v_worker is null then
    return jsonb_build_object('ok', false, 'error', 'no_staff');
  end if;
  if not exists (select 1 from public.staff_join_matches(v_store, p_pin) m where m.staff_id = v_device.staff_id) then
    insert into public.staff_join_attempts (store_id, device_key_hash, kind, ok) values (v_store.id, v_key, 'pin', false);
    return jsonb_build_object('ok', false, 'error', 'wrong_pin');
  end if;

  delete from public.staff_sessions where device_id = v_device.id and expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.staff_sessions (device_id, token_hash, expires_at)
    values (v_device.id, public.staff_join_hash(v_token), v_expires);
  update public.staff_devices set last_seen_at = now() where id = v_device.id;

  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_expires,
    'store_ref', v_store.store_id, 'worker', v_worker, 'view', public.staff_shop_view(v_store, v_device.staff_id));
end;
$$;

create or replace function public.staff_session_view(p_token text, p_device_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.staff_sessions;
  v_device public.staff_devices;
  v_store public.stores;
  v_worker jsonb;
begin
  select * into v_session from public.staff_sessions where token_hash = public.staff_join_hash(p_token);
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  select * into v_device from public.staff_devices
    where id = v_session.device_id and device_key_hash = public.staff_join_hash(p_device_key);
  if v_device.id is null then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_device.status <> 'authorized' then
    delete from public.staff_sessions where device_id = v_device.id;
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;
  if v_session.expires_at <= now() then
    delete from public.staff_sessions where id = v_session.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  select * into v_store from public.stores where id = v_device.store_id;
  v_worker := public.staff_session_worker(v_store, v_device.staff_id);
  if v_worker is null then
    delete from public.staff_sessions where device_id = v_device.id;
    return jsonb_build_object('ok', false, 'error', 'no_staff');
  end if;
  update public.staff_devices set last_seen_at = now() where id = v_device.id;
  return jsonb_build_object('ok', true, 'expires_at', v_session.expires_at, 'store_ref', v_store.store_id,
    'worker', v_worker, 'view', public.staff_shop_view(v_store, v_device.staff_id));
end;
$$;

revoke all on function public.staff_shop_view(public.stores, text) from public, anon, authenticated;
revoke all on function public.staff_session_worker(public.stores, text) from public, anon, authenticated;
revoke all on function public.staff_sign_in(uuid, text, text) from public;
revoke all on function public.staff_session_view(text, text) from public;
grant execute on function public.staff_sign_in(uuid, text, text) to anon, authenticated;
grant execute on function public.staff_session_view(text, text) to anon, authenticated;
