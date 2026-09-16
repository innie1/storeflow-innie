-- One phone can be reached for more than one shop.
--
-- push_subscriptions.endpoint is UNIQUE, and a browser gives a device exactly
-- one push endpoint per site, so the table could only ever hold one row per
-- phone: one phone, one shop. A merchant running two shops from one handset
-- had their order alerts silently moved to whichever shop they opened last -
-- opening the second shop rewrote the row's store_id, and the first shop's
-- orders pushed to nobody with nothing on screen to say so.
--
-- The uniqueness that was wanted all along is one row per shop per device.
--
-- Existing rows are untouched: every one of them is already unique on
-- (store_id, endpoint) by virtue of having been unique on endpoint alone, so
-- the new constraint accepts the table as it stands. Nothing is deleted and no
-- device is unsubscribed by this.

begin;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;

-- Whatever the unique index on endpoint happens to be called, if it was made
-- as an index rather than a constraint.
drop index if exists public.push_subscriptions_endpoint_key;

alter table public.push_subscriptions
  add constraint push_subscriptions_store_endpoint_key unique (store_id, endpoint);

commit;

-- To undo, if a duplicate endpoint per shop ever turns out to be a problem:
--
--   begin;
--   delete from public.push_subscriptions a
--     using public.push_subscriptions b
--    where a.endpoint = b.endpoint and a.ctid > b.ctid;   -- keeps the first row per endpoint
--   alter table public.push_subscriptions
--     drop constraint if exists push_subscriptions_store_endpoint_key;
--   alter table public.push_subscriptions
--     add constraint push_subscriptions_endpoint_key unique (endpoint);
--   commit;
--
-- Note that the rollback deletes rows: it has to, because it is going back to
-- one row per device. Read it before running it.
