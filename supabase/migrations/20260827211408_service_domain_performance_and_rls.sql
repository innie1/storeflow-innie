-- Live migration: service_domain_performance_and_rls
create index if not exists idx_laundry_order_items_order_item_id on public.laundry_order_items(order_item_id) where order_item_id is not null;
create index if not exists idx_orders_assigned_staff_id on public.orders(assigned_staff_id) where assigned_staff_id is not null;
create index if not exists idx_service_order_events_actor_profile_id on public.service_order_events(actor_profile_id) where actor_profile_id is not null;

drop policy if exists "Purchase Orders SELECT" on public.purchase_orders;
create policy "Purchase Orders SELECT" on public.purchase_orders for select to authenticated using(public.is_store_member(store_id));
drop policy if exists "Purchase Orders INSERT" on public.purchase_orders;
create policy "Purchase Orders INSERT" on public.purchase_orders for insert to authenticated with check(public.is_store_member(store_id));
drop policy if exists "Purchase Orders UPDATE" on public.purchase_orders;
create policy "Purchase Orders UPDATE" on public.purchase_orders for update to authenticated using(public.is_store_member(store_id)) with check(public.is_store_member(store_id));

drop policy if exists "analytics_select_owner" on public.store_analytics_events;
create policy "analytics_select_owner" on public.store_analytics_events for select to authenticated
using (exists (
  select 1 from public.stores s join public.profiles p on p.id=s.owner_id
  where s.id=store_analytics_events.store_id and p.auth_user_id=(select auth.uid())
));
