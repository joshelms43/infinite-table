-- ============================================================
-- Infinite Table — the home screen: a rating per game, bots with
-- fixed ratings, the monthly pass, and what you have equipped.
-- Paste the whole file into Supabase → SQL Editor → Run.
-- Safe to run more than once. Run it AFTER schema.sql and accounts.sql
-- (and again after either of those is ever re-run: this file replaces
-- record_match with a version that feeds the per-game ratings).
-- ============================================================
--
-- What changes:
--   * `ratings` holds one Elo per player per game. Deal's existing numbers
--     are carried over; Settlers starts everyone at 1000.
--   * The bots keep real accounts, but their ratings are FIXED — a bot is a
--     measuring stick, not a punching bag. Beat a 1200 bot often enough and
--     you settle where you belong instead of dragging it to the floor.
--   * `record_result` is the one writer: ratings, the match row, and pass XP
--     in a single call, so the 45-second brake covers all three.
--   * `record_match` (what Deal already calls) now delegates to it, so Deal
--     needs no new client code and `profiles.elo` stays its Deal rating.
--   * The pass is XP per season (a Brisbane calendar month). Unlocks are not
--     rows: an item is `season:tier`, and you own it if your XP in that
--     season reaches the tier. `set_loadout` checks exactly that.
--
-- The numbers below (30 / 30 / 60 XP, half against bots, 100 XP a tier,
-- 30 tiers, K = 32) are mirrored in shared/pass.js; tests/passsim.js fails
-- the gate if the two ever disagree.

create extension if not exists pgcrypto with schema extensions;

-- ---------- a rating per game ----------
create table if not exists ratings (
  user_id uuid not null references profiles(id) on delete cascade,
  game    text not null check (game in ('deal', 'settlers')),
  elo     int  not null default 1000,
  games   int  not null default 0,
  wins    int  not null default 0,
  fixed   boolean not null default false,
  primary key (user_id, game)
);
alter table ratings enable row level security;
drop policy if exists "ratings readable" on ratings;
create policy "ratings readable" on ratings for select using (true);
revoke insert, update, delete on ratings from anon, authenticated;
grant select on ratings to anon, authenticated;

alter table matches add column if not exists game text not null default 'deal';

-- ---------- the pass ----------
create table if not exists pass_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  season  text not null,                 -- 'YYYY-MM', Brisbane time
  xp      int  not null default 0,
  last_win_day date,                     -- for the first-win-of-the-day bonus
  primary key (user_id, season)
);
alter table pass_progress enable row level security;
drop policy if exists "pass readable" on pass_progress;
create policy "pass readable" on pass_progress for select using (true);
revoke insert, update, delete on pass_progress from anon, authenticated;
grant select on pass_progress to anon, authenticated;

-- ---------- what you have equipped ----------
alter table profiles add column if not exists loadout jsonb not null default '{}'::jsonb;
grant select (loadout) on profiles to anon, authenticated;

-- ---------- Davo joins Bazza and Shazza ----------
-- Settlers seats three bots. Same shape as the seed in accounts.sql: a real
-- account nobody can sign into.
do $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    'da70a000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'davo@bot.coastline.game',
    extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"],"bot":true}'::jsonb,
    '{"username":"davo","bot":true}'::jsonb,
    '', '', '', ''
  )
  on conflict (id) do nothing;
  insert into profiles (id, name, friend_code)
  values ('da70a000-0000-4000-8000-000000000003', 'Davo', 'DAVO22')
  on conflict (id) do nothing;
end $$;

-- ---------- the bots' fixed ratings ----------
-- Settlers: the Builder wins about half of bot-only games, the Trader and the
-- Expander about a quarter each, so they are graded in that order. Deal's
-- bots share one brain, so they share one rating.
insert into ratings (user_id, game, elo, fixed)
select v.id::uuid, v.game, v.elo, true
from (values
  ('ba22a000-0000-4000-8000-000000000001', 'settlers', 1200),
  ('5a22a000-0000-4000-8000-000000000002', 'settlers', 1100),
  ('da70a000-0000-4000-8000-000000000003', 'settlers', 1050),
  ('ba22a000-0000-4000-8000-000000000001', 'deal',     1100),
  ('5a22a000-0000-4000-8000-000000000002', 'deal',     1100),
  ('da70a000-0000-4000-8000-000000000003', 'deal',     1100)
) as v(id, game, elo)
where exists (select 1 from profiles p where p.id = v.id::uuid)
on conflict (user_id, game) do update set elo = excluded.elo, fixed = true;

-- ---------- everyone's Deal rating carries over ----------
insert into ratings (user_id, game, elo, games, wins)
select id, 'deal', elo, games, wins from profiles
on conflict (user_id, game) do nothing;
update profiles p set elo = r.elo
from ratings r where r.user_id = p.id and r.game = 'deal' and r.fixed;

-- ---------- the one writer ----------
create or replace function public.record_result(p_game text, p_players uuid[], p_winner uuid, p_rounds int)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_n int; v_recent int; v_pid uuid;
  v_we int; v_le int; v_ea numeric; v_d int; v_gain int := 0;
  v_k constant int := 32;
  v_before int; v_after int;
  v_humans int; v_season text; v_today date; v_last date;
  v_xp int; v_bonus int;
  v_my_xp int := 0; v_my_bonus int := 0; v_my_total int := 0;
begin
  if v_me is null or not (v_me = any(p_players)) then
    raise exception 'caller must be a match participant';
  end if;
  if p_game is null or p_game not in ('deal', 'settlers') then
    raise exception 'unknown game';
  end if;
  v_n := coalesce(array_length(p_players, 1), 0);
  if v_n < 2 or v_n > 4 then
    raise exception 'invalid player count';
  end if;
  if p_winner is null or not (p_winner = any(p_players)) then
    raise exception 'winner must be a participant';
  end if;
  if (select count(distinct x) from unnest(p_players) as x) <> v_n then
    raise exception 'a player is listed twice';
  end if;
  select count(*) into v_recent from matches
    where v_me = any(player_ids) and played_at > now() - interval '45 seconds';
  if v_recent > 0 then
    return json_build_object('ok', false, 'err', 'throttled');
  end if;

  -- everyone with a profile gets a row for this game the first time they play it
  insert into ratings (user_id, game)
  select p.id, p_game from profiles p where p.id = any(p_players)
  on conflict do nothing;
  select elo into v_before from ratings where user_id = v_me and game = p_game;

  insert into matches (player_ids, winner, rounds, player_names, game)
  values (
    p_players, p_winner, p_rounds,
    coalesce((select array_agg(p.name order by array_position(p_players, p.id)) from profiles p where p.id = any(p_players)), '{}'),
    p_game
  );

  -- Elo: the winner against each loser, every pairing judged on the ratings
  -- they sat down with. A fixed rating (a bot) takes part and never moves.
  select elo into v_we from ratings where user_id = p_winner and game = p_game;
  if v_we is not null then
    foreach v_pid in array p_players loop
      if v_pid = p_winner then continue; end if;
      select elo into v_le from ratings where user_id = v_pid and game = p_game;
      if v_le is null then continue; end if;
      v_ea := 1.0 / (1.0 + power(10, (v_le - v_we) / 400.0));
      v_d := round(v_k * (1 - v_ea));
      v_gain := v_gain + v_d;
      update ratings set elo = greatest(100, elo - v_d)
        where user_id = v_pid and game = p_game and not fixed;
    end loop;
    update ratings set elo = elo + v_gain
      where user_id = p_winner and game = p_game and not fixed;
  end if;
  update ratings set games = games + 1 where user_id = any(p_players) and game = p_game;
  update ratings set wins = wins + 1 where user_id = p_winner and game = p_game;
  update profiles set games = games + 1 where id = any(p_players);
  update profiles set wins = wins + 1 where id = p_winner;
  -- profiles.elo is the Deal rating: Deal's own screens read it
  if p_game = 'deal' then
    update profiles p set elo = r.elo
    from ratings r where r.user_id = p.id and r.game = 'deal' and p.id = any(p_players);
  end if;

  -- pass XP for every person at the table (never the bots): 30 for finishing,
  -- 30 more for the win, halved when the only opponents were bots, and 60 on
  -- top for the first win of the Brisbane day.
  v_today := (now() at time zone 'Australia/Brisbane')::date;
  v_season := greatest(to_char(v_today, 'YYYY-MM'), '2026-12');   -- the first pass opens early
  select count(*) into v_humans from ratings
    where user_id = any(p_players) and game = p_game and not fixed;
  foreach v_pid in array p_players loop
    if not exists (select 1 from ratings where user_id = v_pid and game = p_game and not fixed) then
      continue;
    end if;
    v_xp := 30 + case when v_pid = p_winner then 30 else 0 end;
    if v_humans < 2 then v_xp := v_xp / 2; end if;
    v_bonus := 0;
    if v_pid = p_winner then
      select max(last_win_day) into v_last from pass_progress where user_id = v_pid;
      if v_last is null or v_last < v_today then v_bonus := 60; end if;
    end if;
    insert into pass_progress (user_id, season, xp, last_win_day)
    values (v_pid, v_season, v_xp + v_bonus, case when v_pid = p_winner then v_today end)
    on conflict (user_id, season) do update
      set xp = pass_progress.xp + excluded.xp,
          last_win_day = coalesce(excluded.last_win_day, pass_progress.last_win_day);
    if v_pid = v_me then
      v_my_xp := v_xp; v_my_bonus := v_bonus;
    end if;
  end loop;

  select elo into v_after from ratings where user_id = v_me and game = p_game;
  select xp into v_my_total from pass_progress where user_id = v_me and season = v_season;
  return json_build_object(
    'ok', true, 'game', p_game,
    'before', v_before, 'after', v_after, 'delta', coalesce(v_after, 0) - coalesce(v_before, 0),
    'xp', v_my_xp, 'bonus', v_my_bonus, 'xp_total', coalesce(v_my_total, 0), 'season', v_season
  );
end $$;
revoke all on function public.record_result(text, uuid[], uuid, int) from public;
grant execute on function public.record_result(text, uuid[], uuid, int) to authenticated;

-- Deal already calls this; it now feeds the Deal rating and the pass.
create or replace function public.record_match(p_players uuid[], p_winner uuid, p_rounds int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.record_result('deal', p_players, p_winner, p_rounds);
end $$;
grant execute on function public.record_match(uuid[], uuid, int) to authenticated;

-- ---------- equipping ----------
-- A loadout is {slot: 'season:tier'}. A slot left out wears the default.
-- An item is yours if your XP in its season reaches its tier (100 a tier).
create or replace function public.set_loadout(p jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_k text; v_v text; v_season text; v_tier int; v_have int;
  v_slots constant text[] := array['avatar','frame','banner','title','s_color','s_dice','s_island','s_robber','d_felt','d_back'];
begin
  if v_me is null then
    raise exception 'sign in first';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    return json_build_object('ok', false, 'err', 'shape');
  end if;
  for v_k, v_v in select key, value #>> '{}' from jsonb_each(p) loop
    if not (v_k = any(v_slots)) then
      return json_build_object('ok', false, 'err', 'slot', 'slot', v_k);
    end if;
    if v_v is null or v_v !~ '^[0-9]{4}-[0-9]{2}:[0-9]{1,2}$' then
      return json_build_object('ok', false, 'err', 'item', 'item', v_v);
    end if;
    v_season := split_part(v_v, ':', 1);
    v_tier := split_part(v_v, ':', 2)::int;
    if v_tier < 1 or v_tier > 30 then
      return json_build_object('ok', false, 'err', 'item', 'item', v_v);
    end if;
    select xp into v_have from pass_progress where user_id = v_me and season = v_season;
    if coalesce(v_have, 0) < v_tier * 100 then
      return json_build_object('ok', false, 'err', 'locked', 'item', v_v);
    end if;
  end loop;
  update profiles set loadout = p where id = v_me;
  return json_build_object('ok', true);
end $$;
revoke all on function public.set_loadout(jsonb) from public;
grant execute on function public.set_loadout(jsonb) to authenticated;
