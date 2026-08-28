-- Live migration: service_workflow_events_and_laundry

create table if not exists public.service_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  business_type text not null,
  stage text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_service_order_events_order_created on public.service_order_events(order_id,created_at);
create index if not exists idx_service_order_events_store_created on public.service_order_events(store_id,created_at desc);
alter table public.service_order_events enable row level security;
drop policy if exists "Service order events SELECT" on public.service_order_events;
create policy "Service order events SELECT" on public.service_order_events for select to authenticated using(public.is_store_member(store_id));
drop policy if exists "Service order events INSERT" on public.service_order_events;
create policy "Service order events INSERT" on public.service_order_events for insert to authenticated with check(public.is_store_member(store_id));

create table if not exists public.laundry_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  garment_type text not null,
  color text,
  tag_code text,
  quantity numeric not null default 1 check(quantity>0),
  stain_notes text,
  damage_notes text,
  special_instructions text,
  photo_url text,
  workflow_stage text not null default 'received',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_laundry_order_items_order on public.laundry_order_items(order_id);
create index if not exists idx_laundry_order_items_store_tag on public.laundry_order_items(store_id,tag_code) where tag_code is not null;
alter table public.laundry_order_items enable row level security;
drop policy if exists "Laundry items SELECT" on public.laundry_order_items;
create policy "Laundry items SELECT" on public.laundry_order_items for select to authenticated using(public.is_store_member(store_id));
drop policy if exists "Laundry items INSERT" on public.laundry_order_items;
create policy "Laundry items INSERT" on public.laundry_order_items for insert to authenticated with check(public.is_store_member(store_id));
drop policy if exists "Laundry items UPDATE" on public.laundry_order_items;
create policy "Laundry items UPDATE" on public.laundry_order_items for update to authenticated using(public.is_store_member(store_id)) with check(public.is_store_member(store_id));
drop policy if exists "Laundry items DELETE" on public.laundry_order_items;
create policy "Laundry items DELETE" on public.laundry_order_items for delete to authenticated using(public.is_store_member(store_id));

drop trigger if exists update_laundry_order_items_updated_at on public.laundry_order_items;
create trigger update_laundry_order_items_updated_at before update on public.laundry_order_items
for each row execute function public.update_updated_at_column();

create or replace function public.log_order_workflow_event()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_profile_id uuid;
begin
  if new.order_kind='product' then return new; end if;
  select p.id into v_profile_id from public.profiles p where p.auth_user_id=auth.uid() limit 1;
  if tg_op='INSERT' then
    insert into public.service_order_events(order_id,store_id,business_type,stage,event_type,payload,actor_profile_id)
    values(new.id,new.store_id,new.business_type,new.workflow_stage,'created',jsonb_build_object('status',new.status),v_profile_id);
  elsif new.status is distinct from old.status or new.workflow_stage is distinct from old.workflow_stage then
    insert into public.service_order_events(order_id,store_id,business_type,stage,event_type,payload,actor_profile_id)
    values(new.id,new.store_id,new.business_type,new.workflow_stage,'stage_changed',jsonb_build_object('old_status',old.status,'new_status',new.status,'old_stage',old.workflow_stage,'new_stage',new.workflow_stage),v_profile_id);
  end if;
  return new;
end;$$;

drop trigger if exists trg_log_order_workflow_event on public.orders;
create trigger trg_log_order_workflow_event after insert or update of status,workflow_stage on public.orders
for each row execute function public.log_order_workflow_event();

insert into public.service_order_events(order_id,store_id,business_type,stage,event_type,payload)
select o.id,o.store_id,o.business_type,o.workflow_stage,'baseline_import',jsonb_build_object('status',o.status)
from public.orders o
where o.order_kind<>'product'
  and not exists(select 1 from public.service_order_events e where e.order_id=o.id and e.event_type='baseline_import');

revoke all on function public.log_order_workflow_event() from public,anon,authenticated;
