-- Live migration: constrain_public_order_inserts
-- Keep legacy customer checkout compatible while preventing arbitrary inserts into
-- historical orders or non-pending order states.

drop policy if exists "Orders INSERT" on public.orders;
drop policy if exists "Customer orders INSERT" on public.orders;
drop policy if exists "Store members INSERT orders" on public.orders;
create policy "Customer orders INSERT" on public.orders
for insert to anon, authenticated
with check (
  orders.store_id is not null
  and exists (select 1 from public.stores s where s.id = orders.store_id and coalesce(s.subscription_status,'active') = 'active')
  and lower(coalesce(orders.status,'pending')) in ('pending','pending approval')
  and nullif(trim(orders.customer_name),'') is not null
  and nullif(trim(orders.customer_phone),'') is not null
  and coalesce(orders.subtotal,0) >= 0
  and coalesce(orders.total,0) >= 0
  and coalesce(orders.total,0) <= coalesce(orders.subtotal,0) + 100000000
);

create policy "Store members INSERT orders" on public.orders
for insert to authenticated
with check (public.is_store_member(orders.store_id));

drop policy if exists "Order Items INSERT" on public.order_items;
drop policy if exists "Customer order items INSERT" on public.order_items;
drop policy if exists "Store members INSERT order items" on public.order_items;
create policy "Customer order items INSERT" on public.order_items
for insert to anon, authenticated
with check (
  order_items.quantity > 0
  and order_items.price >= 0
  and order_items.subtotal >= 0
  and abs(order_items.subtotal - (order_items.quantity * order_items.price)) <= 0.01
  and exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and lower(coalesce(o.status,'pending')) in ('pending','pending approval')
      and o.created_at >= now() - interval '15 minutes'
  )
);

create policy "Store members INSERT order items" on public.order_items
for insert to authenticated
with check (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and public.is_store_member(o.store_id)
  )
);
