-- Live migration: finalize_storefront_view_security
-- Anonymous storefront access now goes through get_public_storefront(text),
-- so the sanitized view can obey underlying table privileges/RLS.
alter view public.stores_public set (security_invoker=true);
