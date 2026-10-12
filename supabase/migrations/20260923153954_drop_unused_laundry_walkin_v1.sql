-- The first walk-in laundry function, replaced by create_laundry_walkin_v2 in
-- August 2026 and called by nothing since: not the merchant app, not the
-- customer app, not any other database function.
--
-- It was still callable by anyone holding a shop's access code, without
-- signing in, and could write orders into that shop. An unused door is still
-- a door. The v2 function the app uses is untouched.
drop function if exists public.create_laundry_walkin(uuid, text, text, text, text, text, text, numeric, numeric, text, jsonb);
