-- The customer app cannot safely select from stores_public because the view is
-- a security-invoker view over the protected stores table. Expose a bounded,
-- allowlisted discovery list through the existing storefront resolver.

create or replace function public.list_public_storefronts(
  p_limit integer default 100,
  p_offset integer default 0,
  p_query text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000);
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_result jsonb;
begin
  if v_query is not null and length(v_query) > 120 then
    raise exception 'Search query is too long' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(public.get_public_storefront(candidate.id::text) order by candidate.business_name, candidate.id), '[]'::jsonb)
  into v_result
  from (
    select s.id, s.business_name
    from public.stores s
    where lower(coalesce(s.subscription_status, 'active')) not in ('inactive', 'cancelled')
      and lower(coalesce(s.data->'marketplaceSettings'->>'temporarilyHidden', 'false')) <> 'true'
      and (
        v_query is null
        or s.business_name ilike '%' || v_query || '%'
        or s.store_id ilike '%' || v_query || '%'
        or s.access_code ilike '%' || v_query || '%'
      )
    order by s.business_name, s.id
    limit v_limit
    offset v_offset
  ) candidate;

  return v_result;
end;
$$;

revoke all on function public.list_public_storefronts(integer, integer, text) from public;
grant execute on function public.list_public_storefronts(integer, integer, text) to anon, authenticated;
