-- ============================================================
-- Infinite Table — schema v2 (HARDENED)  (v0.4.1)
-- Safe to run whether or not the v1 schema was applied.
-- Paste the whole file into Supabase → SQL Editor → Run.
-- Context: anonymous sign-ins use the `authenticated` role, so
-- every policy below assumes "authenticated" includes strangers.
-- ============================================================

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default 'Player',
  friend_code text unique not null,
  elo int not null default 1000,
  games int not null default 0,
  wins int not null default 0,
  created_at timestamptz default now()
);
create table if not exists friends (
  a uuid references profiles(id) on delete cascade,
  b uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (a, b)
);
create table if not exists matches (
  id bigint generated always as identity primary key,
  played_at timestamptz default now(),
  player_ids uuid[] not null,
  player_names text[] not null default '{}',
  winner uuid,
  rounds int
);
alter table profiles enable row level security;
alter table friends enable row level security;
alter table matches enable row level security;

drop policy if exists "profiles are readable" on profiles;
drop policy if exists "insert own profile" on profiles;
drop policy if exists "update own profile" on profiles;
drop policy if exists "read own friendships" on friends;
drop policy if exists "add friendship" on friends;
drop policy if exists "matches are readable" on matches;

-- profiles: readable minus friend_code; only `name` self-editable
create policy "profiles readable" on profiles for select using (true);
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
revoke select, update on profiles from anon, authenticated;
grant select (id, name, elo, games, wins, created_at) on profiles to anon, authenticated;
grant update (name) on profiles to authenticated;
grant insert on profiles to authenticated;

-- friends: created only via add_friend (proof of code); removable
create policy "read own friendships" on friends for select using (auth.uid() = a or auth.uid() = b);
create policy "remove friendship" on friends for delete using (auth.uid() = a or auth.uid() = b);
revoke insert on friends from anon, authenticated;

-- matches: readable; written only by record_match
create policy "matches readable" on matches for select using (true);

create or replace function my_friend_code()
returns text language sql security definer set search_path = public as $$
  select friend_code from profiles where id = auth.uid();
$$;
grant execute on function my_friend_code to authenticated;

create or replace function add_friend(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare fid uuid; fname text;
begin
  select id, name into fid, fname from profiles where friend_code = upper(trim(p_code));
  if fid is null then return json_build_object('ok', false, 'err', 'not_found'); end if;
  if fid = auth.uid() then return json_build_object('ok', false, 'err', 'self'); end if;
  insert into friends(a, b) values (auth.uid(), fid) on conflict do nothing;
  return json_build_object('ok', true, 'name', fname);
end $$;
grant execute on function add_friend to authenticated;

create or replace function remove_friend(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from friends where (a = auth.uid() and b = p_id) or (b = auth.uid() and a = p_id);
$$;
grant execute on function remove_friend to authenticated;

create or replace function record_match(p_players uuid[], p_winner uuid, p_rounds int)
returns void language plpgsql security definer set search_path = public as $$
declare
  loser uuid; we int; le int; ea numeric; k int := 32; d int; recent int;
begin
  if auth.uid() is null or not (auth.uid() = any(p_players)) then
    raise exception 'caller must be a match participant';
  end if;
  if array_length(p_players, 1) < 2 or array_length(p_players, 1) > 4 then
    raise exception 'invalid player count';
  end if;
  if p_winner is null or not (p_winner = any(p_players)) then
    raise exception 'winner must be a participant';
  end if;
  select count(*) into recent from matches
    where auth.uid() = any(player_ids) and played_at > now() - interval '45 seconds';
  if recent > 0 then return; end if;

  insert into matches(player_ids, winner, rounds, player_names)
  values (
    p_players, p_winner, p_rounds,
    coalesce((select array_agg(p.name order by array_position(p_players, p.id)) from profiles p where p.id = any(p_players)), '{}')
  );
  foreach loser in array p_players loop
    if loser = p_winner or loser is null then continue; end if;
    select elo into we from profiles where id = p_winner;
    select elo into le from profiles where id = loser;
    if we is null or le is null then continue; end if;
    ea := 1.0 / (1.0 + power(10, (le - we) / 400.0));
    d := round(k * (1 - ea));
    update profiles set elo = elo + d where id = p_winner;
    update profiles set elo = greatest(100, elo - d) where id = loser;
  end loop;
  update profiles set games = games + 1 where id = any(p_players);
  update profiles set wins = wins + 1 where id = p_winner;
end $$;
grant execute on function record_match to authenticated;
