-- ============================================================
-- Infinite Table — accounts, friends, matches, Elo  (v0.4.0)
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Then: Authentication → Sign In / Providers → enable "Anonymous".
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
alter table profiles enable row level security;
create policy "profiles are readable" on profiles for select using (true);
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id);

create table if not exists friends (
  a uuid references profiles(id) on delete cascade,
  b uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (a, b)
);
alter table friends enable row level security;
create policy "read own friendships" on friends for select using (auth.uid() = a or auth.uid() = b);
create policy "add friendship" on friends for insert with check (auth.uid() = a);

create table if not exists matches (
  id bigint generated always as identity primary key,
  played_at timestamptz default now(),
  player_ids uuid[] not null,
  player_names text[] not null default '{}',
  winner uuid,
  rounds int
);
alter table matches enable row level security;
create policy "matches are readable" on matches for select using (true);

-- Atomic Elo + stats update, called once per finished online game by the host.
create or replace function record_match(p_players uuid[], p_winner uuid, p_rounds int)
returns void language plpgsql security definer set search_path = public as $$
declare
  loser uuid; we int; le int; ea numeric; k int := 32; d int;
begin
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
