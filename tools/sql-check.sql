-- exercised by tools/sql-check.sh against a throwaway Postgres
do $$
declare
  alice uuid; bob uuid; r json; n int; ok boolean;
  bazza  constant uuid := 'ba22a000-0000-4000-8000-000000000001';
  shazza constant uuid := '5a22a000-0000-4000-8000-000000000002';
  davo   constant uuid := 'da70a000-0000-4000-8000-000000000003';
begin
  -- the bots are graded and fixed
  assert (select elo from ratings where user_id = bazza and game = 'settlers' and fixed) = 1200, 'bazza settlers 1200';
  assert (select elo from ratings where user_id = shazza and game = 'settlers' and fixed) = 1100, 'shazza settlers 1100';
  assert (select elo from ratings where user_id = davo and game = 'settlers' and fixed) = 1050, 'davo settlers 1050';
  assert (select count(*) from ratings where game = 'deal' and fixed and elo = 1100) = 3, 'deal bots 1100';
  assert (select count(*) from profiles where name = 'Davo') = 1, 'davo seeded once';

  perform create_account('alice', 'secret1'); perform create_account('bobby', 'secret2');
  select id into alice from profiles where name = 'alice'; select id into bob from profiles where name = 'bobby';

  -- a win against three bots: +24 +20 +18, bots unmoved, half XP plus the daily bonus
  perform set_config('test.uid', alice::text, false);
  r := record_result('settlers', array[alice, bazza, shazza, davo], alice, 60);
  assert (r->>'ok')::boolean and (r->>'before')::int = 1000 and (r->>'after')::int = 1062 and (r->>'delta')::int = 62, 'win vs 3 bots: ' || r::text;
  assert (r->>'xp')::int = 30 and (r->>'bonus')::int = 60 and (r->>'xp_total')::int = 90 and r->>'season' >= '2026-12', 'xp: ' || r::text;
  assert (select elo from ratings where user_id = bazza and game = 'settlers') = 1200, 'bot rating is fixed';
  assert (select elo from profiles where id = alice) = 1000, 'settlers does not touch the Deal rating';

  -- the brake
  r := record_result('settlers', array[alice, bazza], alice, 5);
  assert r->>'err' = 'throttled' and (select elo from ratings where user_id = alice and game = 'settlers') = 1062, 'throttled';

  -- a loss: -10, quarter... half of 30 XP, no bonus
  update matches set played_at = played_at - interval '2 minutes';
  r := record_result('settlers', array[alice, bazza, shazza], bazza, 70);
  assert (r->>'after')::int = 1052 and (r->>'xp')::int = 15 and (r->>'bonus')::int = 0 and (r->>'xp_total')::int = 105, 'loss: ' || r::text;

  -- a second win the same day: no second bonus
  update matches set played_at = played_at - interval '2 minutes';
  r := record_result('settlers', array[alice, bazza], alice, 40);
  assert (r->>'after')::int = 1074 and (r->>'bonus')::int = 0 and (r->>'xp_total')::int = 135, 'second win: ' || r::text;

  -- Deal, through the call Deal already makes, against a person: full XP, mirrored to profiles.elo
  update matches set played_at = played_at - interval '2 minutes';
  perform record_match(array[alice, bob], alice, 9);
  assert (select elo from ratings where user_id = alice and game = 'deal') = 1016 and (select elo from ratings where user_id = bob and game = 'deal') = 984, 'deal elo';
  assert (select elo from profiles where id = alice) = 1016 and (select elo from profiles where id = bob) = 984, 'profiles.elo mirrors deal';
  assert (select xp from pass_progress where user_id = alice) = 195 and (select xp from pass_progress where user_id = bob) = 30, 'xp vs a person';
  assert (select game from matches order by id desc limit 1) = 'deal' and (select count(*) from matches) = 4, 'matches carry the game';
  assert (select games from ratings where user_id = alice and game = 'settlers') = 3 and (select wins from ratings where user_id = alice and game = 'settlers') = 2, 'games and wins per game';

  -- tomorrow's first win pays the bonus again
  update matches set played_at = played_at - interval '2 minutes';
  update pass_progress set last_win_day = last_win_day - 1 where user_id = alice;
  r := record_result('deal', array[alice, bob], alice, 9);
  assert (r->>'bonus')::int = 60 and (r->>'xp')::int = 60, 'next-day bonus: ' || r::text;

  -- loadout: owned tiers only, known slots only
  r := set_loadout('{"avatar":"2026-12:1","s_color":"2026-12:3"}');
  assert (r->>'ok')::boolean and (select loadout->>'s_color' from profiles where id = alice) = '2026-12:3', 'equip owned: ' || r::text;
  r := set_loadout('{"avatar":"2026-12:4"}');
  assert r->>'err' = 'locked' and (select loadout->>'avatar' from profiles where id = alice) = '2026-12:1', 'locked tier refused: ' || r::text;
  assert set_loadout('{"hat":"2026-12:1"}')->>'err' = 'slot', 'unknown slot';
  assert set_loadout('{"avatar":"gold"}')->>'err' = 'item', 'junk item';
  assert set_loadout('{"avatar":"2026-12:31"}')->>'err' = 'item', 'tier out of range';
  assert set_loadout('{"avatar":"2025-01:1"}')->>'err' = 'locked', 'a season never played';
  r := set_loadout('{}');
  assert (r->>'ok')::boolean and (select loadout from profiles where id = alice) = '{}'::jsonb, 'back to defaults';

  -- bad calls raise
  ok := false; begin perform record_result('settlers', array[bob, bazza], bob, 1); exception when others then ok := true; end;
  assert ok, 'a stranger cannot record';
  ok := false; begin perform record_result('pool', array[alice, bob], alice, 1); exception when others then ok := true; end;
  assert ok, 'unknown game';
  ok := false; begin perform record_result('deal', array[alice, alice], alice, 1); exception when others then ok := true; end;
  assert ok, 'duplicate players';
  ok := false; begin perform record_result('deal', array[alice, bob], bazza, 1); exception when others then ok := true; end;
  assert ok, 'winner must be seated';
  perform set_config('test.uid', '', false);
  ok := false; begin perform set_loadout('{}'); exception when others then ok := true; end;
  assert ok, 'guests cannot equip';
end $$;

-- the tables cannot be written from a browser
set role authenticated;
do $$
declare ok boolean;
begin
  ok := false; begin update ratings set elo = 3000; exception when insufficient_privilege then ok := true; end;
  assert ok, 'ratings are read-only';
  ok := false; begin insert into pass_progress(user_id, season, xp) select id, '2026-12', 3000 from profiles limit 1; exception when insufficient_privilege then ok := true; end;
  assert ok, 'pass is read-only';
  ok := false; begin update profiles set loadout = '{"avatar":"2026-12:30"}'; exception when insufficient_privilege then ok := true; end;
  assert ok, 'loadout only through set_loadout';
  perform count(*) from ratings; perform loadout from profiles limit 1; perform count(*) from pass_progress;
end $$;
reset role;
select 'SQL-CHECK: ALL PASS' as result;
