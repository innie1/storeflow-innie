-- Live migration: canonical_business_types
-- One canonical business type now drives StoreFlow across UI and backend.

create or replace function public.normalize_business_type(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case regexp_replace(lower(trim(coalesce(p_type, ''))), '[^a-z0-9]+', '_', 'g')
    when '' then 'other'
    when 'retail' then 'provision'
    when 'provision' then 'provision'
    when 'provisions' then 'provision'
    when 'supermarket' then 'provision'
    when 'mini_mart' then 'provision'
    when 'minimart' then 'provision'
    when 'grocery' then 'provision'
    when 'pharmacy' then 'pharmacy'
    when 'chemist' then 'pharmacy'
    when 'clothing' then 'clothing'
    when 'fashion' then 'clothing'
    when 'food' then 'food'
    when 'food_business' then 'food'
    when 'electronics' then 'electronics'
    when 'laundry' then 'laundry'
    when 'dry_cleaning' then 'laundry'
    when 'drycleaning' then 'laundry'
    when 'gas_filling' then 'gas_filling'
    when 'gas' then 'gas_filling'
    when 'gas_refill' then 'gas_filling'
    when 'restaurant' then 'restaurant'
    when 'games' then 'games'
    when 'gaming' then 'games'
    when 'gaming_centre' then 'games'
    when 'gaming_center' then 'games'
    when 'barber' then 'barber'
    when 'barber_shop' then 'barber'
    when 'salon' then 'salon'
    when 'beauty' then 'salon'
    when 'tailoring' then 'tailoring'
    when 'tailor' then 'tailoring'
    when 'repair' then 'repair'
    when 'repair_shop' then 'repair'
    when 'printing' then 'printing'
    when 'printing_cyber_cafe' then 'printing'
    when 'cyber_cafe' then 'cyber_cafe'
    when 'cybercafe' then 'cyber_cafe'
    when 'car_wash' then 'car_wash'
    when 'carwash' then 'car_wash'
    when 'photography' then 'photography'
    when 'cleaning' then 'cleaning'
    when 'cleaning_service' then 'cleaning'
    when 'spa' then 'spa'
    when 'other' then 'other'
    else 'other'
  end;
$$;

create or replace function public.sync_store_business_type()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_candidate text;
  v_type text;
  v_data jsonb;
begin
  v_data := case when jsonb_typeof(new.data) = 'object' then new.data else '{}'::jsonb end;
  v_candidate := coalesce(nullif(v_data->>'storeType',''), nullif(v_data->'businessTemplate'->>'type',''), nullif(v_data->>'businessType',''), nullif(new.business_type,''), nullif(v_data->>'category',''), 'other');
  v_type := public.normalize_business_type(v_candidate);
  new.business_type := v_type;
  v_data := jsonb_set(v_data,'{storeType}',to_jsonb(v_type),true);
  v_data := jsonb_set(v_data,'{businessType}',to_jsonb(v_type),true);
  if jsonb_typeof(v_data->'businessTemplate')='object' then
    v_data := jsonb_set(v_data,'{businessTemplate,type}',to_jsonb(v_type),true);
  end if;
  new.data := v_data;
  return new;
end;
$$;

update public.stores s
set business_type = public.normalize_business_type(coalesce(nullif(s.data->>'storeType',''),nullif(s.data->'businessTemplate'->>'type',''),nullif(s.data->>'businessType',''),nullif(s.business_type,''),nullif(s.data->>'category',''),'other')),
    data = (case when jsonb_typeof(s.data)='object' then s.data else '{}'::jsonb end) || jsonb_build_object(
      'storeType', public.normalize_business_type(coalesce(nullif(s.data->>'storeType',''),nullif(s.data->'businessTemplate'->>'type',''),nullif(s.data->>'businessType',''),nullif(s.business_type,''),nullif(s.data->>'category',''),'other')),
      'businessType', public.normalize_business_type(coalesce(nullif(s.data->>'storeType',''),nullif(s.data->'businessTemplate'->>'type',''),nullif(s.data->>'businessType',''),nullif(s.business_type,''),nullif(s.data->>'category',''),'other'))
    );

update public.stores set data=jsonb_set(data,'{businessTemplate,type}',to_jsonb(business_type),true)
where jsonb_typeof(data->'businessTemplate')='object';

drop trigger if exists trg_00_sync_store_business_type on public.stores;
create trigger trg_00_sync_store_business_type before insert or update of business_type,data on public.stores
for each row execute function public.sync_store_business_type();

alter table public.stores drop constraint if exists stores_business_type_canonical_check;
alter table public.stores add constraint stores_business_type_canonical_check check (business_type in (
  'provision','pharmacy','clothing','food','electronics','laundry','gas_filling','restaurant','games','barber','salon','tailoring','repair','printing','cyber_cafe','car_wash','photography','cleaning','spa','other'
)) not valid;
alter table public.stores validate constraint stores_business_type_canonical_check;

alter function public.sync_service_catalog_metadata() set search_path='';
revoke all on function public.normalize_business_type(text) from public;
grant execute on function public.normalize_business_type(text) to authenticated,anon,service_role;
revoke all on function public.sync_store_business_type() from public,anon,authenticated;
