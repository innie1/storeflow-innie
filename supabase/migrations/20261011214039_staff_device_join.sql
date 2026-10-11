-- A worker's own phone asks to join a shop, and the owner lets it in.
--
-- Until now a worker's phone could reach a shop only by signing in with the
-- owner's email and password, which handed the worker the owner's account.
-- This lets a phone ask, as a named worker, and be let in by the owner with a
-- one-time code - without the worker ever holding an owner credential.
--
-- How it goes:
--   1. The worker types the shop's permanent Store ID and their own 4-digit
--      staff PIN. The Store ID is public (it is on the customer QR code), so
--      it identifies the shop and nothing more; the PIN says which worker.
--      No worker names are shown to anybody who has not got a right PIN.
--   2. They confirm "You are Faith (Attendant)?" and the phone files a
--      pending request, carrying a random secret key it made for itself.
--   3. The owner approves (or rejects). Approval issues a 6-digit code, good
--      for 5 minutes and 5 tries, used once, bound to that request.
--   4. The worker types the code; the phone is then authorized for that
--      shop and that worker.
--
-- What is stored, and what is not:
--   - the phone's key and the code are kept only as SHA-256 hashes. A copy of
--     this table cannot be used to impersonate a phone or redeem a code;
--   - nobody reads these tables directly. RLS is on with no policies, and
--     every read or write goes through the functions below, which check who
--     is asking: the owner by their signed-in account, a phone by its key;
--   - the PIN is checked against the shop's own cloud copy and never stored
--     here.
--
-- Guessing is limited:
--   - 10 wrong PINs for one shop in an hour pause joining that shop for the
--     hour, and 5 from one phone pause that phone;
--   - at most 10 requests can wait for one shop at a time;
--   - 5 wrong codes and the code is gone; the owner issues a new one.

create table if not exists public.staff_devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  staff_id text not null,
  staff_name text not null,
  staff_role text,
  device_label text,
  device_key_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'authorized', 'rejected', 'revoked')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  code_hash text,
  code_expires_at timestamptz,
  code_attempts integer not null default 0,
  authorized_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index if not exists staff_devices_store_status_idx on public.staff_devices (store_id, status);
create index if not exists staff_devices_key_idx on public.staff_devices (device_key_hash);

create table if not exists public.staff_join_attempts (
  id bigserial primary key,
  store_id uuid references public.stores(id) on delete cascade,
  device_key_hash text,
  kind text not null,
  ok boolean not null,
  at timestamptz not null default now()
);

create index if not exists staff_join_attempts_store_idx on public.staff_join_attempts (store_id, at);
create index if not exists staff_join_attempts_key_idx on public.staff_join_attempts (device_key_hash, at);

alter table public.staff_devices enable row level security;
alter table public.staff_join_attempts enable row level security;
revoke all on public.staff_devices from anon, authenticated;
revoke all on public.staff_join_attempts from anon, authenticated;
revoke all on sequence public.staff_join_attempts_id_seq from anon, authenticated;

-- ── helpers ────────────────────────────────────────────────────────────────

create or replace function public.staff_join_hash(p_value text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(coalesce(p_value, ''), 'sha256'), 'hex');
$$;

-- The shop a worker means, by its permanent Store ID.
create or replace function public.staff_join_store(p_store_ref text)
returns public.stores
language sql
stable
security definer
set search_path = public
as $$
  select * from public.stores where store_id = upper(trim(coalesce(p_store_ref, ''))) limit 1;
$$;

-- The shop's workers whose PIN is this one. Never the owner.
create or replace function public.staff_join_matches(p_store public.stores, p_pin text)
returns table (staff_id text, staff_name text, staff_role text)
language sql
stable
security definer
set search_path = public
as $$
  select m->>'id', m->>'name', m->>'role'
  from jsonb_array_elements(case when jsonb_typeof(p_store.data->'staffMembers') = 'array'
                                 then p_store.data->'staffMembers' else '[]'::jsonb end) m
  where coalesce(m->>'role', '') <> 'owner'
    and coalesce(m->>'id', '') <> ''
    and m->>'pin' = trim(coalesce(p_pin, ''));
$$;

-- Whether this shop or this phone has guessed too often in the last hour.
create or replace function public.staff_join_paused(p_store_id uuid, p_key_hash text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.staff_join_attempts
          where store_id = p_store_id and kind = 'pin' and not ok and at > now() - interval '1 hour') >= 10
      or (select count(*) from public.staff_join_attempts
          where device_key_hash = p_key_hash and kind = 'pin' and not ok and at > now() - interval '1 hour') >= 5;
$$;

-- The owner of this shop is the one signed in.
create or replace function public.staff_join_is_owner(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stores s join public.profiles p on p.id = s.owner_id
    where s.id = p_store_id and p.auth_user_id = auth.uid()
  );
$$;

-- ── the worker's phone ─────────────────────────────────────────────────────

-- Store ID + PIN -> who this is. Wrong PINs are counted.
create or replace function public.staff_join_identify(p_store_ref text, p_pin text, p_device_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores;
  v_key text := public.staff_join_hash(p_device_key);
  v_matches jsonb;
begin
  if length(coalesce(p_device_key, '')) < 32 then
    return jsonb_build_object('ok', false, 'error', 'bad_device');
  end if;
  delete from public.staff_join_attempts where at < now() - interval '1 day';
  v_store := public.staff_join_store(p_store_ref);
  if v_store.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if public.staff_join_paused(v_store.id, v_key) then
    return jsonb_build_object('ok', false, 'error', 'paused');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('staff_id', staff_id, 'name', staff_name, 'role', staff_role)), '[]'::jsonb)
    into v_matches from public.staff_join_matches(v_store, p_pin);
  insert into public.staff_join_attempts (store_id, device_key_hash, kind, ok)
    values (v_store.id, v_key, 'pin', jsonb_array_length(v_matches) > 0);
  if jsonb_array_length(v_matches) = 0 then
    return jsonb_build_object('ok', false, 'error', 'wrong_pin');
  end if;
  return jsonb_build_object('ok', true, 'store_name', v_store.business_name, 'matches', v_matches);
end;
$$;

-- File the request. The PIN is checked again, so knowing a worker's id is
-- not enough to ask as them.
create or replace function public.staff_join_request(
  p_store_ref text, p_pin text, p_staff_id text, p_device_key text, p_device_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores;
  v_key text := public.staff_join_hash(p_device_key);
  v_staff record;
  v_row public.staff_devices;
begin
  if length(coalesce(p_device_key, '')) < 32 then
    return jsonb_build_object('ok', false, 'error', 'bad_device');
  end if;
  v_store := public.staff_join_store(p_store_ref);
  if v_store.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if public.staff_join_paused(v_store.id, v_key) then
    return jsonb_build_object('ok', false, 'error', 'paused');
  end if;
  select * into v_staff from public.staff_join_matches(v_store, p_pin) where staff_id = p_staff_id limit 1;
  if v_staff.staff_id is null then
    insert into public.staff_join_attempts (store_id, device_key_hash, kind, ok) values (v_store.id, v_key, 'pin', false);
    return jsonb_build_object('ok', false, 'error', 'wrong_pin');
  end if;

  -- Asking again from the same phone finds the same request.
  select * into v_row from public.staff_devices
  where store_id = v_store.id and staff_id = v_staff.staff_id and device_key_hash = v_key
    and status in ('pending', 'approved', 'authorized')
  order by requested_at desc limit 1;
  if v_row.id is not null then
    return jsonb_build_object('ok', true, 'request_id', v_row.id, 'status', v_row.status,
      'store_name', v_store.business_name, 'staff_name', v_row.staff_name, 'staff_role', v_row.staff_role);
  end if;

  if (select count(*) from public.staff_devices where store_id = v_store.id and status = 'pending') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  insert into public.staff_devices (store_id, staff_id, staff_name, staff_role, device_label, device_key_hash)
  values (v_store.id, v_staff.staff_id, v_staff.staff_name, v_staff.staff_role,
          left(nullif(trim(coalesce(p_device_label, '')), ''), 60), v_key)
  returning * into v_row;

  return jsonb_build_object('ok', true, 'request_id', v_row.id, 'status', v_row.status,
    'store_name', v_store.business_name, 'staff_name', v_row.staff_name, 'staff_role', v_row.staff_role);
end;
$$;

-- What became of this phone's request. Only the phone that made it can ask.
create or replace function public.staff_join_status(p_request_id uuid, p_device_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_devices;
begin
  select * into v_row from public.staff_devices
  where id = p_request_id and device_key_hash = public.staff_join_hash(p_device_key);
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'status', v_row.status,
    'code_ready', v_row.status = 'approved' and v_row.code_hash is not null and v_row.code_expires_at > now(),
    'store_name', (select business_name from public.stores where id = v_row.store_id),
    'staff_name', v_row.staff_name, 'staff_role', v_row.staff_role);
end;
$$;

-- The 6-digit code. Right once, in time, within 5 tries, from the phone that
-- asked - and the phone is authorized.
create or replace function public.staff_join_redeem(p_request_id uuid, p_device_key text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_devices;
begin
  select * into v_row from public.staff_devices
  where id = p_request_id and device_key_hash = public.staff_join_hash(p_device_key)
  for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_row.status = 'authorized' then
    return jsonb_build_object('ok', true, 'status', 'authorized', 'staff_id', v_row.staff_id, 'staff_name', v_row.staff_name);
  end if;
  if v_row.status <> 'approved' or v_row.code_hash is null then
    return jsonb_build_object('ok', false, 'error', 'no_code');
  end if;
  if v_row.code_expires_at <= now() then
    update public.staff_devices set code_hash = null where id = v_row.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_row.code_hash <> public.staff_join_hash(v_row.id::text || ':' || regexp_replace(coalesce(p_code, ''), '\D', '', 'g')) then
    update public.staff_devices
      set code_attempts = code_attempts + 1,
          code_hash = case when code_attempts + 1 >= 5 then null else code_hash end
      where id = v_row.id;
    return jsonb_build_object('ok', false,
      'error', case when v_row.code_attempts + 1 >= 5 then 'no_code' else 'wrong_code' end,
      'tries_left', greatest(0, 4 - v_row.code_attempts));
  end if;
  update public.staff_devices
    set status = 'authorized', code_hash = null, authorized_at = now(), last_seen_at = now()
    where id = v_row.id;
  return jsonb_build_object('ok', true, 'status', 'authorized', 'staff_id', v_row.staff_id, 'staff_name', v_row.staff_name);
end;
$$;

-- ── the owner ──────────────────────────────────────────────────────────────

-- This shop's phones, for its owner only. The shop is named by the Store ID
-- or the access code the owner's app already holds.
create or replace function public.staff_device_list(p_store_ref text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
begin
  select id into v_store_id from public.stores
  where store_id = upper(trim(coalesce(p_store_ref, ''))) or access_code = upper(trim(coalesce(p_store_ref, '')))
  limit 1;
  if v_store_id is null or not public.staff_join_is_owner(v_store_id) then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  return jsonb_build_object('ok', true, 'devices', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'staff_id', staff_id, 'staff_name', staff_name, 'staff_role', staff_role,
      'device_label', device_label, 'status', status, 'requested_at', requested_at,
      'decided_at', decided_at, 'authorized_at', authorized_at, 'last_seen_at', last_seen_at,
      'code_live', status = 'approved' and code_hash is not null and code_expires_at > now(),
      'code_expires_at', code_expires_at
    ) order by requested_at desc)
    from public.staff_devices
    where store_id = v_store_id and status in ('pending', 'approved', 'authorized')
  ), '[]'::jsonb));
end;
$$;

-- Approve: a fresh 6-digit code, shown to the owner once. Approving again
-- replaces a code that ran out or was mistyped too often.
create or replace function public.staff_device_approve(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.staff_devices;
  v_code text;
begin
  select * into v_row from public.staff_devices where id = p_request_id for update;
  if v_row.id is null or not public.staff_join_is_owner(v_row.store_id) then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  if v_row.status not in ('pending', 'approved') then
    return jsonb_build_object('ok', false, 'error', 'decided');
  end if;
  -- Four random bytes, read as a positive number, folded into six digits.
  v_code := lpad(((('x' || lpad(encode(extensions.gen_random_bytes(4), 'hex'), 16, '0'))::bit(64)::bigint) % 1000000)::text, 6, '0');
  update public.staff_devices
    set status = 'approved',
        decided_at = coalesce(decided_at, now()),
        code_hash = public.staff_join_hash(v_row.id::text || ':' || v_code),
        code_expires_at = now() + interval '5 minutes',
        code_attempts = 0
    where id = v_row.id;
  return jsonb_build_object('ok', true, 'code', v_code, 'expires_at', now() + interval '5 minutes');
end;
$$;

create or replace function public.staff_device_reject(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_devices;
begin
  select * into v_row from public.staff_devices where id = p_request_id for update;
  if v_row.id is null or not public.staff_join_is_owner(v_row.store_id) then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  if v_row.status not in ('pending', 'approved') then
    return jsonb_build_object('ok', false, 'error', 'decided');
  end if;
  update public.staff_devices
    set status = 'rejected', decided_at = now(), code_hash = null
    where id = v_row.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── who may call what ──────────────────────────────────────────────────────

revoke all on function public.staff_join_hash(text) from public, anon, authenticated;
revoke all on function public.staff_join_store(text) from public, anon, authenticated;
revoke all on function public.staff_join_matches(public.stores, text) from public, anon, authenticated;
revoke all on function public.staff_join_paused(uuid, text) from public, anon, authenticated;
revoke all on function public.staff_join_is_owner(uuid) from public, anon, authenticated;

revoke all on function public.staff_join_identify(text, text, text) from public;
revoke all on function public.staff_join_request(text, text, text, text, text) from public;
revoke all on function public.staff_join_status(uuid, text) from public;
revoke all on function public.staff_join_redeem(uuid, text, text) from public;
grant execute on function public.staff_join_identify(text, text, text) to anon, authenticated;
grant execute on function public.staff_join_request(text, text, text, text, text) to anon, authenticated;
grant execute on function public.staff_join_status(uuid, text) to anon, authenticated;
grant execute on function public.staff_join_redeem(uuid, text, text) to anon, authenticated;

revoke all on function public.staff_device_list(text) from public, anon;
revoke all on function public.staff_device_approve(uuid) from public, anon;
revoke all on function public.staff_device_reject(uuid) from public, anon;
grant execute on function public.staff_device_list(text) to authenticated;
grant execute on function public.staff_device_approve(uuid) to authenticated;
grant execute on function public.staff_device_reject(uuid) to authenticated;
