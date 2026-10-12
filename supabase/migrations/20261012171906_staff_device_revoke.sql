-- Staff plan, step 6: the owner takes a worker's phone back.
--
-- Revoke cuts off one phone; Revoke all cuts off every phone a worker has -
-- a lost phone, or somebody who has left. Every worker door checks the
-- phone's state before its pass, so from here on the next thing the phone
-- asks is answered "revoked" and the app signs it out and forgets the shop
-- (staff-session.ts, SHUT_OUT). The passes themselves are left to run out:
-- deleted, the phone would hear "your pass expired" instead, which only
-- asks for the PIN again rather than signing it out. Offline it can still
-- open for what is left of its 24 hours, and nothing it sends after this is
-- accepted.
--
-- A revoked phone does not come back: it has to ask to join again, and the
-- owner approve it and give it a new code.
--
-- Removing a worker from the staff list needs nothing here: every door
-- already answers "no_staff" for them, and the phone signs itself out.

create or replace function public.staff_device_revoke(p_request_id uuid)
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
  if v_row.status not in ('pending', 'approved', 'authorized') then
    return jsonb_build_object('ok', false, 'error', 'decided');
  end if;
  update public.staff_devices
    set status = 'revoked', revoked_at = now(), code_hash = null, code_expires_at = null
    where id = v_row.id;
  return jsonb_build_object('ok', true, 'revoked', 1);
end;
$$;

-- Every phone of one worker in this shop, waiting or let in.
create or replace function public.staff_device_revoke_all(p_store_ref text, p_staff_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_count integer;
begin
  select id into v_store_id from public.stores
  where store_id = upper(trim(coalesce(p_store_ref, ''))) or access_code = upper(trim(coalesce(p_store_ref, '')))
  limit 1;
  if v_store_id is null or not public.staff_join_is_owner(v_store_id) then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  update public.staff_devices
    set status = 'revoked', revoked_at = now(), code_hash = null, code_expires_at = null
    where store_id = v_store_id and staff_id = coalesce(p_staff_id, '')
      and status in ('pending', 'approved', 'authorized');
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'revoked', v_count);
end;
$$;

revoke all on function public.staff_device_revoke(uuid) from public, anon;
revoke all on function public.staff_device_revoke_all(text, text) from public, anon;
grant execute on function public.staff_device_revoke(uuid) to authenticated;
grant execute on function public.staff_device_revoke_all(text, text) to authenticated;
