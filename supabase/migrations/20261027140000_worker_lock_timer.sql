-- The owner's lock timer for workers' phones reaches those phones.
--
-- How long a shop stays open before asking for the PIN again is kept on
-- each phone (store-session.ts). A worker cannot open Settings, so every
-- worker's phone sat on the default hour. The owner now chooses one for
-- all of them, as managerSettings.workerLockTimer, and the worker's slim
-- copy carries it - one more name on the allow-list below, and only one
-- of the five the app knows. Nothing else in the view changes.

create or replace function public.staff_shop_view(p_store public.stores, p_staff_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with d as (select coalesce(p_store.data, '{}'::jsonb) as data),
  arr as (
    select
      case when jsonb_typeof(d.data->'products') = 'array' then d.data->'products' else '[]'::jsonb end as products,
      case when jsonb_typeof(d.data->'supplies') = 'array' then d.data->'supplies' else '[]'::jsonb end as supplies,
      case when jsonb_typeof(d.data->'customers') = 'array' then d.data->'customers' else '[]'::jsonb end as customers,
      case when jsonb_typeof(d.data->'staffMembers') = 'array' then d.data->'staffMembers' else '[]'::jsonb end as staff,
      case when jsonb_typeof(d.data->'pieceWork') = 'array' then d.data->'pieceWork' else '[]'::jsonb end as piece_work,
      case when jsonb_typeof(d.data->'staffExpenseRequests') = 'array' then d.data->'staffExpenseRequests' else '[]'::jsonb end as expense_requests
    from d
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'storeName', d.data->'storeName', 'category', d.data->'category', 'retailType', d.data->'retailType',
    'businessType', d.data->'businessType', 'storeType', d.data->'storeType', 'uiMode', d.data->'uiMode',
    'simpleModeSettings', d.data->'simpleModeSettings', 'businessTemplate', d.data->'businessTemplate',
    'loyaltySettings', d.data->'loyaltySettings', 'laundryEquipment', d.data->'laundryEquipment', 'createdAt', d.data->'createdAt',
    'profile', (
      select jsonb_object_agg(e.key, e.value) from jsonb_each(case when jsonb_typeof(d.data->'profile') = 'object' then d.data->'profile' else '{}'::jsonb end) e
      where e.key in ('storeType', 'location', 'phone', 'photo', 'logoStyle', 'website', 'openingTime', 'closingTime', 'openingDate')
    ),
    'products', (
      select coalesce(jsonb_agg(p - array['costPrice', 'priceHistory', 'total_revenue', 'total_profit', 'units_sold',
        'restock_count', 'initialQuantity', 'addedAt', 'first_sale_at', 'last_sold_at', 'source', 'needsStockSetup', 'image']), '[]'::jsonb)
      from jsonb_array_elements(arr.products) p
    ),
    'supplies', (select coalesce(jsonb_agg(s - array['lastPurchaseCost']), '[]'::jsonb) from jsonb_array_elements(arr.supplies) s),
    'customers', (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', c->'id', 'name', c->'name', 'phone', c->'phone', 'address', c->'address',
        'loyaltyPoints', c->'loyaltyPoints', 'visitsCount', c->'visitsCount', 'lastPurchaseDate', c->'lastPurchaseDate'
      ))), '[]'::jsonb)
      from jsonb_array_elements(arr.customers) c
    ),
    'staffMembers', (select coalesce(jsonb_agg(m - array['pin', 'monthlySalary']), '[]'::jsonb) from jsonb_array_elements(arr.staff) m where m->>'id' = p_staff_id),
    'pieceWork', (select coalesce(jsonb_agg(w), '[]'::jsonb) from jsonb_array_elements(arr.piece_work) w where w->>'workerId' = p_staff_id),
    'staffExpenseRequests', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(arr.expense_requests) x where x->'recordedBy'->>'staffId' = p_staff_id),
    'managerSettings', jsonb_build_object(
      'staffExpenseApproval', d.data->'managerSettings'->'staffExpenseApproval',
      'staffExpenseFreeLimit', d.data->'managerSettings'->'staffExpenseFreeLimit',
      'workerLockTimer', case when d.data->'managerSettings'->>'workerLockTimer' in ('1h', '4h', '8h', '12h', 'never')
        then d.data->'managerSettings'->'workerLockTimer' end
    )
  ))
  from d, arr;
$$;
