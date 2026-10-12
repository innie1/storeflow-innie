-- The owner's phone keeps its own copy of the shop's orders and asks only for
-- what changed since its last look (src/lib/orders-cache.ts), instead of
-- downloading every order the shop ever had each time the app opens - which
-- would have grown past the free plan's outgoing-data allowance within a
-- year of ordinary trade.
--
-- Two things make "changed since" true:
--
-- 1. An index on (store_id, updated_at), so the question is a short range
--    read, not a walk through every order the shop has.
--
-- 2. An order counts as changed when its items do. updated_at already moves
--    on any update of the order itself (update_orders_updated_at), but items
--    live in their own table: an item added or edited after the order was
--    read would otherwise never reach a phone that had already seen the
--    order. Touching only updated_at fires none of the order's other
--    triggers - status history, pushes and workflow logs all key on status
--    or stage - and SECURITY DEFINER lets an item written by a customer's
--    checkout touch an order row that customer may not update.

create index if not exists idx_orders_store_updated_at
  on public.orders using btree (store_id, updated_at);

create or replace function public.touch_order_on_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
begin
  if v_order is not null then
    update public.orders set updated_at = now() where id = v_order;
  end if;
  return null;
end;
$$;

revoke all on function public.touch_order_on_item_change() from public, anon, authenticated;

drop trigger if exists trg_touch_order_on_item_change on public.order_items;
create trigger trg_touch_order_on_item_change
  after insert or update or delete on public.order_items
  for each row execute function public.touch_order_on_item_change();
