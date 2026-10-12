-- Laundry work from a worker's own phone (staff plan 5b).
--
-- The counter's laundry doors - create_laundry_walkin_v2 and
-- update_laundry_walkin_stage - are opened with the shop's access code.
-- A worker's phone must never hold that code: it is also the password for
-- deleting sales, expenses and products. So a worker's phone gets doors of
-- its own, opened with the 24-hour pass from staff_sign_in instead:
--
--   staff_laundry_walkin   take a bundle in
--   staff_laundry_stage    move a bundle along (washing, ironing, ready...)
--   staff_laundry_list     the shop's bundles, or only those changed since
--                          the phone last asked
--
-- Each one checks, every time, that the pass is live, that it belongs to
-- this phone, that the phone is still authorized, that the worker is still
-- on the shop's staff list, and that their role - read from that list, never
-- from the phone - is one that works with laundry: attendant, supervisor,
-- manager, or a custom role with sales ticked. That is the same rule that
-- decides who sees Laundry Records in the app. Then it does exactly what the
-- counter's door does, with the shop's own code, so a bundle from a worker's
-- phone is the same bundle as one from the counter.
--
-- A bundle taken in this way records who took it, in its service_metadata,
-- so the owner can always tell.
--
-- The list never carries a customer's private order key (access_token) or
-- account id (customer_uuid): with those, anyone could act as the customer
-- on the customer app. It carries open bundles and anything finished in the
-- last week, at most 300; after the first time, only what changed.

-- The worker behind a live pass on this phone, or why not.
create or replace function public.staff_session_check(
  p_token text, p_device_key text,
  out o_store public.stores, out o_worker jsonb, out o_device_id uuid, out o_error text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session public.staff_sessions;
  v_device public.staff_devices;
begin
  select * into v_session from public.staff_sessions where token_hash = public.staff_join_hash(p_token);
  if v_session.id is null or v_session.expires_at <= now() then o_error := 'expired'; return; end if;
  select * into v_device from public.staff_devices
    where id = v_session.device_id and device_key_hash = public.staff_join_hash(p_device_key);
  if v_device.id is null then o_error := 'expired'; return; end if;
  if v_device.status <> 'authorized' then o_error := 'revoked'; return; end if;
  select * into o_store from public.stores where id = v_device.store_id;
  if o_store.id is null then o_error := 'not_found'; return; end if;
  o_worker := public.staff_session_worker(o_store, v_device.staff_id);
  if o_worker is null then o_error := 'no_staff'; return; end if;
  o_device_id := v_device.id;
end;
$$;

-- Who works with laundry - the same rule as Laundry Records in the app.
create or replace function public.staff_works_laundry(p_worker jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_worker->>'role', '') in ('attendant', 'supervisor', 'manager')
      or (p_worker->>'role' = 'custom' and coalesce((p_worker->'permissions'->>'sales')::boolean, false));
$$;

create or replace function public.staff_laundry_walkin(
  p_token text, p_device_key text,
  p_client_ref text, p_tag_code text, p_customer_name text, p_customer_phone text,
  p_service_id text, p_service_name text, p_pricing text, p_billing_quantity numeric,
  p_total numeric, p_notes text, p_garments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_result jsonb;
begin
  select * into v from public.staff_session_check(p_token, p_device_key);
  if v.o_error is not null then return jsonb_build_object('ok', false, 'error', v.o_error); end if;
  if not public.staff_works_laundry(v.o_worker) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;

  v_result := public.create_laundry_walkin_v2(
    (v.o_store).access_code, p_client_ref, p_tag_code, p_customer_name, p_customer_phone,
    p_service_id, p_service_name, p_pricing, p_billing_quantity, p_total, p_notes, p_garments
  );
  update public.orders
    set service_metadata = coalesce(service_metadata, '{}'::jsonb)
      || jsonb_build_object('recorded_by_staff_id', v.o_worker->>'id', 'recorded_by_name', v.o_worker->>'name')
    where id = (v_result->>'order_id')::uuid and store_id = (v.o_store).id
      and not coalesce(service_metadata, '{}'::jsonb) ? 'recorded_by_staff_id';
  update public.staff_devices set last_seen_at = now() where id = v.o_device_id;
  return v_result;
end;
$$;

create or replace function public.staff_laundry_stage(p_token text, p_device_key text, p_client_ref text, p_stage text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select * into v from public.staff_session_check(p_token, p_device_key);
  if v.o_error is not null then return jsonb_build_object('ok', false, 'error', v.o_error); end if;
  if not public.staff_works_laundry(v.o_worker) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  update public.staff_devices set last_seen_at = now() where id = v.o_device_id;
  return public.update_laundry_walkin_stage((v.o_store).access_code, p_client_ref, p_stage);
end;
$$;

create or replace function public.staff_laundry_list(p_token text, p_device_key text, p_since timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_now timestamptz := now();
begin
  select * into v from public.staff_session_check(p_token, p_device_key);
  if v.o_error is not null then return jsonb_build_object('ok', false, 'error', v.o_error); end if;
  if not public.staff_works_laundry(v.o_worker) then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  return jsonb_build_object('ok', true, 'as_of', v_now, 'orders', coalesce((
    select jsonb_agg(
      (to_jsonb(o) - 'access_token' - 'customer_uuid')
      || jsonb_build_object('order_items', coalesce((select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id = o.id), '[]'::jsonb))
      order by o.created_at desc)
    from (
      select * from public.orders o
      where o.store_id = (v.o_store).id
        and case when p_since is null
          then (coalesce(o.status, '') not in ('Completed', 'Cancelled', 'Rejected') or o.updated_at > v_now - interval '7 days')
          else o.updated_at > p_since end
      order by o.created_at desc
      limit 300
    ) o
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.staff_session_check(text, text) from public, anon, authenticated;
revoke all on function public.staff_works_laundry(jsonb) from public, anon, authenticated;
revoke all on function public.staff_laundry_walkin(text, text, text, text, text, text, text, text, text, numeric, numeric, text, jsonb) from public;
revoke all on function public.staff_laundry_stage(text, text, text, text) from public;
revoke all on function public.staff_laundry_list(text, text, timestamptz) from public;
grant execute on function public.staff_laundry_walkin(text, text, text, text, text, text, text, text, text, numeric, numeric, text, jsonb) to anon, authenticated;
grant execute on function public.staff_laundry_stage(text, text, text, text) to anon, authenticated;
grant execute on function public.staff_laundry_list(text, text, timestamptz) to anon, authenticated;
