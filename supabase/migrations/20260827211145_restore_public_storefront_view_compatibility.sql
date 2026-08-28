-- Live migration: restore_public_storefront_view_compatibility
-- stores_public must remain callable by currently deployed anonymous storefront clients
-- until they are all migrated to the scoped storefront RPC.
alter view public.stores_public reset (security_invoker);
