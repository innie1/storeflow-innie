alter table public.orders add column if not exists customer_uuid uuid;
alter table public.orders add column if not exists is_guest boolean not null default true;

create table if not exists public.store_analytics_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  event_type text not null check (event_type in ('qr_scan','store_code_lookup','store_view','product_view','cart_started','checkout_started','order_placed','order_completed','order_cancelled')),
  visitor_id uuid,
  customer_uuid uuid,
  is_guest boolean not null default true,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_store_analytics_store_created on public.store_analytics_events(store_id, created_at desc);
create index if not exists idx_store_analytics_store_event on public.store_analytics_events(store_id, event_type, created_at desc);
create index if not exists idx_store_analytics_customer on public.store_analytics_events(store_id, customer_uuid);
alter table public.store_analytics_events enable row level security;
drop policy if exists analytics_insert_public on public.store_analytics_events;
create policy analytics_insert_public on public.store_analytics_events for insert to anon, authenticated with check (store_id is not null);
drop policy if exists analytics_select_owner on public.store_analytics_events;
create policy analytics_select_owner on public.store_analytics_events for select to authenticated using (exists (select 1 from public.stores s join public.profiles p on p.id=s.owner_id where s.id=store_analytics_events.store_id and p.auth_user_id=auth.uid()));
create or replace function public.record_store_analytics_event(p_store_id uuid,p_event_type text,p_visitor_id uuid default null,p_customer_uuid uuid default null,p_is_guest boolean default true,p_source text default null,p_metadata jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path=public as $$ declare v_id uuid; begin if p_store_id is null or p_event_type not in ('qr_scan','store_code_lookup','store_view','product_view','cart_started','checkout_started','order_placed','order_completed','order_cancelled') then raise exception 'Invalid analytics event'; end if; if p_event_type in ('qr_scan','store_code_lookup') and p_visitor_id is not null then select id into v_id from public.store_analytics_events where store_id=p_store_id and event_type=p_event_type and visitor_id=p_visitor_id and created_at > now()-interval '20 seconds' order by created_at desc limit 1; if v_id is not null then return v_id; end if; end if; insert into public.store_analytics_events(store_id,event_type,visitor_id,customer_uuid,is_guest,source,metadata) values(p_store_id,p_event_type,p_visitor_id,p_customer_uuid,coalesce(p_is_guest,true),p_source,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id; return v_id; end; $$;
revoke all on function public.record_store_analytics_event(uuid,text,uuid,uuid,boolean,text,jsonb) from public;
grant execute on function public.record_store_analytics_event(uuid,text,uuid,uuid,boolean,text,jsonb) to anon, authenticated;
