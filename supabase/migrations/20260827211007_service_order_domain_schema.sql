-- Live migration: service_order_domain_schema
-- Extends existing orders without replacing historical retail data.

alter table public.orders add column if not exists business_type text;
alter table public.orders add column if not exists order_kind text;
alter table public.orders add column if not exists workflow_stage text;
alter table public.orders add column if not exists scheduled_for timestamptz;
alter table public.orders add column if not exists started_at timestamptz;
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders add column if not exists assigned_staff_id uuid references public.staff(id) on delete set null;
alter table public.orders add column if not exists service_metadata jsonb not null default '{}'::jsonb;

update public.orders o
set business_type=s.business_type,
    order_kind=case
      when s.business_type='games' then 'session'
      when s.business_type in ('food','restaurant','gas_filling','printing','cyber_cafe') then 'mixed'
      when s.business_type in ('laundry','barber','salon','tailoring','repair','car_wash','photography','cleaning','spa') then 'service'
      else 'product' end,
    workflow_stage=coalesce(o.workflow_stage,regexp_replace(lower(coalesce(o.status,'pending')),'[^a-z0-9]+','_','g')),
    started_at=coalesce(o.started_at,case when lower(coalesce(o.status,'')) in ('in progress','in_service','active','preparing') then o.updated_at end),
    completed_at=coalesce(o.completed_at,case when lower(coalesce(o.status,''))='completed' then o.updated_at end)
from public.stores s where s.id=o.store_id;

update public.orders set business_type='other' where business_type is null;
update public.orders set order_kind='product' where order_kind is null;
update public.orders set workflow_stage='pending' where workflow_stage is null;
alter table public.orders alter column business_type set default 'other';
alter table public.orders alter column business_type set not null;
alter table public.orders alter column order_kind set default 'product';
alter table public.orders alter column order_kind set not null;
alter table public.orders alter column workflow_stage set default 'pending';
alter table public.orders alter column workflow_stage set not null;

alter table public.orders drop constraint if exists orders_business_type_canonical_check;
alter table public.orders add constraint orders_business_type_canonical_check check (business_type in (
  'provision','pharmacy','clothing','food','electronics','laundry','gas_filling','restaurant','games','barber','salon','tailoring','repair','printing','cyber_cafe','car_wash','photography','cleaning','spa','other'
));
alter table public.orders drop constraint if exists orders_order_kind_check;
alter table public.orders add constraint orders_order_kind_check check (order_kind in ('product','service','appointment','session','metered','mixed'));

alter table public.order_items add column if not exists offering_id text;
alter table public.order_items add column if not exists item_kind text;
alter table public.order_items add column if not exists item_name text;
alter table public.order_items add column if not exists unit text;
alter table public.order_items add column if not exists options jsonb not null default '{}'::jsonb;
alter table public.order_items add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.order_items oi
set offering_id=coalesce(oi.offering_id,oi.product_id),
    item_name=coalesce(oi.item_name,(select p.name from public.products p where p.id::text=oi.product_id limit 1)),
    unit=coalesce(oi.unit,(select p.unit from public.products p where p.id::text=oi.product_id limit 1)),
    item_kind=coalesce(oi.item_kind,case
      when exists(select 1 from public.products p where p.id::text=oi.product_id and coalesce(p.is_service,false)) then 'service'
      else coalesce((select case when o.order_kind in ('service','appointment','session','metered') then o.order_kind when o.order_kind='mixed' then 'service' else 'product' end from public.orders o where o.id=oi.order_id),'product') end);

update public.order_items set item_kind='product' where item_kind is null;
alter table public.order_items alter column item_kind set default 'product';
alter table public.order_items alter column item_kind set not null;
alter table public.order_items drop constraint if exists order_items_item_kind_check;
alter table public.order_items add constraint order_items_item_kind_check check(item_kind in ('product','service','appointment','session','metered','custom'));

create index if not exists idx_orders_store_business_kind on public.orders(store_id,business_type,order_kind);
create index if not exists idx_orders_store_workflow on public.orders(store_id,workflow_stage);
create index if not exists idx_orders_scheduled_for on public.orders(scheduled_for) where scheduled_for is not null;
create index if not exists idx_order_items_offering_id on public.order_items(offering_id);
create index if not exists idx_loyalty_redemptions_order_id on public.loyalty_redemptions(order_id);

create or replace function public.sync_order_business_domain()
returns trigger language plpgsql set search_path=''
as $$
declare v_store_type text;
begin
  select s.business_type into v_store_type from public.stores s where s.id=new.store_id;
  new.business_type:=public.normalize_business_type(coalesce(nullif(new.business_type,''),v_store_type,'other'));
  if new.order_kind is null or new.order_kind='' then
    new.order_kind:=case when new.business_type='games' then 'session'
      when new.business_type in ('food','restaurant','gas_filling','printing','cyber_cafe') then 'mixed'
      when new.business_type in ('laundry','barber','salon','tailoring','repair','car_wash','photography','cleaning','spa') then 'service'
      else 'product' end;
  end if;
  if tg_op='INSERT' or new.workflow_stage is null or (new.status is distinct from old.status and new.workflow_stage is not distinct from old.workflow_stage) then
    new.workflow_stage:=regexp_replace(lower(coalesce(new.status,'pending')),'[^a-z0-9]+','_','g');
  end if;
  if lower(coalesce(new.status,'')) in ('in progress','in_service','active') and new.started_at is null then new.started_at:=now(); end if;
  if lower(coalesce(new.status,''))='completed' and new.completed_at is null then new.completed_at:=now(); end if;
  return new;
end;$$;

drop trigger if exists trg_00_sync_order_business_domain on public.orders;
create trigger trg_00_sync_order_business_domain before insert or update of store_id,business_type,order_kind,status,workflow_stage on public.orders
for each row execute function public.sync_order_business_domain();
revoke all on function public.sync_order_business_domain() from public,anon,authenticated;
