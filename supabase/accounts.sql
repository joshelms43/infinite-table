-- ============================================================
-- Infinite Table — accounts, SQL only  (M Deal, v0.11.5)
-- Paste the whole file into Supabase → SQL Editor → Run.
-- Safe to run more than once.
-- ============================================================
--
-- Why this exists:
--   Registration needs a server, because minting a user requires privileges
--   a browser must never hold. The Edge Function does that job, but Edge
--   Functions only deploy from the dashboard's Functions page or the CLI —
--   and with no terminal, that step kept not happening. This does the same
--   work from the SQL editor, which is reachable.
--
--   It sends no email. The account is written already-confirmed, so there is
--   no verification step to rate-limit, and Supabase's two-mails-an-hour
--   ceiling is never approached.
--
--   The address `name@coastline.game` is an internal primary key, not a
--   mailbox. Nothing is ever delivered to it.
--
-- What it is not:
--   This writes into `auth.users` directly, which is Supabase's own schema
--   rather than ours. That is the trade: it works without a terminal, and it
--   depends on a table shape Supabase could change. The identity insert below
--   is written to survive that; if the shape ever moves under us, sign-in
--   breaks loudly rather than quietly, and supabase/functions/register is
--   still there as the supported path.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_account(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u        text;
  em       text;
  uid      uuid;
  code     text;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i        int;
  recent   int;
  ident_ok boolean := true;
begin
  -- 1. same rules the client and the Edge Function apply
  u := lower(regexp_replace(coalesce(p_username, ''), '[^a-zA-Z0-9_]', '', 'g'));
  u := left(u, 16);
  if length(u) < 3 then
    return json_build_object('ok', false, 'err', 'username');
  end if;
  if p_password is null or length(p_password) < 6 then
    return json_build_object('ok', false, 'err', 'password');
  end if;

  em := u || '@coastline.game';

  -- 2. this function is callable by strangers, so it needs a brake.
  --    Generous enough that a table of mates never sees it.
  select count(*) into recent from auth.users where created_at > now() - interval '1 hour';
  if recent >= 40 then
    return json_build_object('ok', false, 'err', 'throttled');
  end if;

  if exists (select 1 from auth.users where email = em) then
    return json_build_object('ok', false, 'err', 'taken');
  end if;

  -- 3. mint the account, already confirmed. email_confirmed_at is what makes
  --    this a no-email signup: there is nothing left to verify.
  uid := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    json_build_object('username', u)::jsonb,
    '', '', '', ''            -- GoTrue reads these as strings; NULL makes it error
  );

  -- 4. the identity row. Its shape has changed across GoTrue versions, so a
  --    failure here must not lose the account — password sign-in reads
  --    auth.users, not this.
  begin
    insert into auth.identities (provider_id, user_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    values (uid::text, uid,
            json_build_object('sub', uid::text, 'email', em, 'email_verified', true,
                              'phone_verified', false)::jsonb,
            'email', now(), now(), now());
  exception when others then
    ident_ok := false;
  end;

  -- 5. the profile, so a fresh account is complete the moment it exists.
  --    Friend codes are unique; collisions are rare and retried.
  for i in 1..8 loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into profiles (id, name, friend_code) values (uid, left(u, 12), code);
      exit;
    exception when unique_violation then
      code := null;   -- try another
    end;
  end loop;

  return json_build_object('ok', true, 'username', u, 'identity', ident_ok);
end $$;

-- Registration happens before sign-in, so the caller is anonymous.
revoke all on function public.create_account(text, text) from public;
grant execute on function public.create_account(text, text) to anon, authenticated;


-- ============================================================
-- The bots are players too  (M Deal v0.11.7)
-- ============================================================
--
-- Bazza and Shazza hold real accounts with real ratings, so beating them
-- moves your Elo and losing to them costs you. They are seeded once with
-- fixed ids the client knows by name.
--
-- They cannot be signed into. The password hash below is bcrypt over a value
-- generated here and never stored, so no password verifies against it.
--
-- A note on farming, since solo games are rated: `record_match` already
-- refuses a second result inside 45 seconds, and a bot's Elo falls as it
-- loses — so a bot you beat repeatedly is worth less each time, and the
-- floor of 100 makes it worth almost nothing. Grinding converges rather
-- than climbing.

do $$
declare
  bots constant jsonb := '[
    {"id":"ba22a000-0000-4000-8000-000000000001","name":"Bazza", "code":"BAZZA2"},
    {"id":"5a22a000-0000-4000-8000-000000000002","name":"Shazza","code":"SHAZZA"}
  ]';
  b jsonb;
begin
  for b in select * from jsonb_array_elements(bots) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      (b->>'id')::uuid, 'authenticated', 'authenticated',
      lower(b->>'name') || '@bot.coastline.game',
      extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"],"bot":true}'::jsonb,
      json_build_object('username', lower(b->>'name'), 'bot', true)::jsonb,
      '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into profiles (id, name, friend_code)
    values ((b->>'id')::uuid, b->>'name', b->>'code')
    on conflict (id) do nothing;
  end loop;
end $$;
