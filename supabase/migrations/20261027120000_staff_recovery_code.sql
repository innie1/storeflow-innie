-- A worker's phone that has lost what it knew gets back in on its own.
--
-- A phone is known to the cloud only by the secret it keeps in the browser
-- (staff-join.ts, deviceKey). When that is wiped - the browser's data
-- cleared, or the app opened from WhatsApp's own browser instead of Chrome -
-- the phone is a stranger, and until now the only way back was a new
-- request, the owner's approval and a new 6-digit code.
--
-- Now an approved phone is also given a recovery code, once, for the worker
-- to keep as a screenshot. Store ID, the worker's PIN and that code move
-- the worker's approval onto the phone in front of them:
--   - the same approval row, so the owner's list keeps one entry per phone
--     and nothing tied to it is lost; its old secret stops working;
--   - only an approval that is still standing - a revoked phone, or a worker
--     taken off the staff list or given a new PIN, cannot come back this way;
--   - the code works once; the phone is shown a fresh one straight away;
--   - 5 wrong codes from one phone, or 10 for one shop, in an hour pause it,
--     on top of the PIN limits that were already there;
--   - the owner sees that the phone came back with its recovery code.
--
-- The code is 12 characters from 32 (60 bits): a list of attempts this
-- short can never walk through it. Kept only as a hash, like the rest.

alter table public.staff_devices add column if not exists recovery_hash text;
alter table public.staff_devices add column if not exists recovered_at timestamptz;

create or replace function public.staff_recovery_hash(p_store_id uuid, p_staff_id text, p_code text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select public.staff_join_hash(p_store_id::text || ':' || coalesce(p_staff_id, '') || ':recovery:'
    || regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g'));
$$;

-- A fresh code for this approval row, replacing any before it. Shown once.
create or replace function public.staff_recovery_new(p_device_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- No I, O, 0 or 1: read off a screenshot and typed, they get mixed up.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(12);
  v_code text := '';
  v_row public.staff_devices;
begin
  for i in 0..11 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) & 31) + 1, 1);
  end loop;
  update public.staff_devices
    set recovery_hash = public.staff_recovery_hash(store_id, staff_id, v_code)
    where id = p_device_id
    returning * into v_row;
  if v_row.id is null then return null; end if;
  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4);
end;
$$;

-- ── the worker's phone ─────────────────────────────────────────────────────

-- The approved phone asks for its recovery code: right after the owner's
-- code let it in, or later for a phone approved before there were any.
create or replace function public.staff_recovery_issue(p_request_id uuid, p_device_key text)
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
  if v_row.status <> 'authorized' then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;
  return jsonb_build_object('ok', true, 'recovery_code', public.staff_recovery_new(v_row.id));
end;
$$;

-- Back in with Store ID, PIN and recovery code, on a phone the cloud does
-- not know. The PIN says which worker; the code says which of their
-- approvals - and that it is theirs to move.
create or replace function public.staff_join_recover(
  p_store_ref text, p_pin text, p_recovery_code text, p_device_key text, p_device_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store public.stores;
  v_key text := public.staff_join_hash(p_device_key);
  v_row public.staff_devices;
begin
  if length(coalesce(p_device_key, '')) < 32 then
    return jsonb_build_object('ok', false, 'error', 'bad_device');
  end if;
  delete from public.staff_join_attempts where at < now() - interval '1 day';
  v_store := public.staff_join_store(p_store_ref);
  if v_store.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if public.staff_join_paused(v_store.id, v_key)
     or (select count(*) from public.staff_join_attempts
         where store_id = v_store.id and kind = 'recovery' and not ok and at > now() - interval '1 hour') >= 10
     or (select count(*) from public.staff_join_attempts
         where device_key_hash = v_key and kind = 'recovery' and not ok and at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'paused');
  end if;
  if not exists (select 1 from public.staff_join_matches(v_store, p_pin)) then
    insert into public.staff_join_attempts (store_id, device_key_hash, kind, ok) values (v_store.id, v_key, 'pin', false);
    return jsonb_build_object('ok', false, 'error', 'wrong_pin');
  end if;

  select d.* into v_row
  from public.staff_devices d
  join public.staff_join_matches(v_store, p_pin) m on m.staff_id = d.staff_id
  where d.store_id = v_store.id
    and d.status = 'authorized'
    and d.recovery_hash is not null
    and d.recovery_hash = public.staff_recovery_hash(v_store.id, d.staff_id, p_recovery_code)
  limit 1
  for update of d;
  if v_row.id is null then
    insert into public.staff_join_attempts (store_id, device_key_hash, kind, ok) values (v_store.id, v_key, 'recovery', false);
    return jsonb_build_object('ok', false, 'error', 'wrong_recovery');
  end if;
  insert into public.staff_join_attempts (store_id, device_key_hash, kind, ok) values (v_store.id, v_key, 'recovery', true);

  -- A request this phone already made for this worker is answered by this.
  update public.staff_devices
    set status = 'rejected', decided_at = now(), code_hash = null
    where store_id = v_store.id and staff_id = v_row.staff_id and device_key_hash = v_key
      and status in ('pending', 'approved') and id <> v_row.id;

  -- The approval moves to this phone. Passes the old secret was given end.
  delete from public.staff_sessions where device_id = v_row.id;
  update public.staff_devices
    set device_key_hash = v_key,
        device_label = coalesce(left(nullif(trim(coalesce(p_device_label, '')), ''), 60), device_label),
        recovery_hash = null,
        recovered_at = now(),
        last_seen_at = now()
    where id = v_row.id;

  return jsonb_build_object('ok', true, 'request_id', v_row.id, 'status', 'authorized',
    'store_name', v_store.business_name, 'staff_id', v_row.staff_id, 'staff_name', v_row.staff_name,
    'staff_role', v_row.staff_role, 'recovery_code', public.staff_recovery_new(v_row.id));
end;
$$;

-- ── the owner ──────────────────────────────────────────────────────────────

-- As before, and when a phone last came back with its recovery code.
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
      'recovered_at', recovered_at,
      'code_live', status = 'approved' and code_hash is not null and code_expires_at > now(),
      'code_expires_at', code_expires_at
    ) order by requested_at desc)
    from public.staff_devices
    where store_id = v_store_id and status in ('pending', 'approved', 'authorized')
  ), '[]'::jsonb));
end;
$$;

-- ── who may call what ──────────────────────────────────────────────────────

revoke all on function public.staff_recovery_hash(uuid, text, text) from public, anon, authenticated;
revoke all on function public.staff_recovery_new(uuid) from public, anon, authenticated;

revoke all on function public.staff_recovery_issue(uuid, text) from public;
revoke all on function public.staff_join_recover(text, text, text, text, text) from public;
grant execute on function public.staff_recovery_issue(uuid, text) to anon, authenticated;
grant execute on function public.staff_join_recover(text, text, text, text, text) to anon, authenticated;

revoke all on function public.staff_device_list(text) from public, anon;
grant execute on function public.staff_device_list(text) to authenticated;
