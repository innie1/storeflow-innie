-- A walk-in laundry bundle may have no phone number.
--
-- The counter stopped demanding one: a walk-in who will not give a number has
-- to be recordable, or the attendant goes back to the paper book. But this
-- function still refused such a bundle ("Customer phone number is required"),
-- so it stayed on the one phone that took it in - never backed up, never seen
-- by another device in the shop.
--
-- Now:
--   - no number is accepted, and stored as NULL rather than '' so that no
--     lookup keyed on a phone can ever match it. NULL equals nothing; ''
--     equals every other blank;
--   - a number that IS given must still have at least 7 digits. A mistyped
--     number sends somebody's clothes updates to a stranger;
--   - a given number is stored trimmed, as before.
--
-- Checked before writing this, so the blank number does not open anything:
--   - get_guest_order_by_code demands at least 10 digits before it looks;
--   - get_customer_loyalty_balance and the other phone lookups compare with
--     "=", which a NULL never satisfies;
--   - store_ratings.customer_phone is NOT NULL, so a no-phone order cannot
--     add anonymous ratings;
--   - no trigger on orders and no scheduled function reads the phone;
--   - both apps already treat an order's phone as possibly missing.
--
-- Patched in place rather than restated: the live function has been edited by
-- several migrations, and copying 200 lines by hand to change three is how a
-- line goes missing. Each line changed here must be found exactly once, or
-- nothing changes at all. CREATE OR REPLACE keeps the existing grants.

do $migration$
declare
  v_def text := pg_get_functiondef(
    'public.create_laundry_walkin_v2(text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb)'::regprocedure
  );
  v_edit record;
begin
  for v_edit in
    select * from (values
      ($$v_instructions text := '';$$,
       $$v_instructions text := '';
  v_phone text;$$),
      ($$if nullif(trim(coalesce(p_customer_phone,'')),'') is null then raise exception 'Customer phone number is required'; end if;$$,
       $$v_phone := nullif(trim(coalesce(p_customer_phone,'')),'');$$),
      ($$if length(regexp_replace(p_customer_phone, '[^0-9]', '', 'g')) < 7 then$$,
       $$if v_phone is not null and length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 7 then$$),
      ($$v_store.id, trim(p_customer_name), trim(p_customer_phone), v_tag, 'Accepted',$$,
       $$v_store.id, trim(p_customer_name), v_phone, v_tag, 'Accepted',$$)
    ) as edits(anchor, replacement)
  loop
    if (length(v_def) - length(replace(v_def, v_edit.anchor, ''))) / length(v_edit.anchor) <> 1 then
      raise exception 'create_laundry_walkin_v2 is not the version this migration expects. Missing or repeated: %', v_edit.anchor;
    end if;
    v_def := replace(v_def, v_edit.anchor, v_edit.replacement);
  end loop;

  execute v_def;
end
$migration$;

-- To undo: run the same block with each anchor and replacement swapped.
