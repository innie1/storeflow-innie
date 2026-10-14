-- A refused sync is an answer, not a hiccup.
--
-- The store merge refused a phone's changes it could not tell from another
-- phone's with SQLSTATE 40001, serialization_failure. PostgREST treats that
-- code as a transient failure and retries the same request itself - and this
-- refusal is not transient: the same proposal is refused the same way every
-- time. One owner signing in with a held sync set five requests retrying
-- inside the database at about a hundred tries a second between them, for
-- over half an hour, until every other request to the project - the shop's
-- orders, its staff list, a worker's join - timed out with a 504.
--
-- The refusals now raise P0001 (raise_exception): answered at once, never
-- retried. The app recognises them by their words ("Another device
-- changed ..."), not by the code, so nothing on the phone changes.
--
-- The three functions are rewritten from their live definitions with only
-- the code swapped, so nothing else about them can drift in the copy.
do $$
declare
  fn record;
  def text;
begin
  for fn in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('commit_store_snapshot', 'merge_inventory_snapshot', 'merge_records_by_id')
  loop
    def := pg_get_functiondef(fn.oid);
    def := regexp_replace(def, 'errcode\s*=\s*''40001''', 'errcode = ''P0001''', 'g');
    if def ~ '40001' then
      raise exception 'Unexpected 40001 left in %', fn.proname;
    end if;
    execute def;
  end loop;
end;
$$;
