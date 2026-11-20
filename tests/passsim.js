/* passsim — the pass, the ratings maths and the cosmetics catalog.
   Pins: every track is thirty complete items; ids, seasons (Brisbane months)
   and tiers; what a game pays; Elo with fixed bots; owning and equipping.
   And the co-pin: the numbers in shared/pass.js are the numbers in
   supabase/home.sql — XP, tier size, K, the slots, the bots and their
   ratings — so the screen can never promise what the database won't pay.
   (The SQL itself runs for real in tools/sql-check.sh.) Mutation-proven. */
const fs = require('fs');
const path = require('path');
const SRC_PATH = path.join(__dirname, '..', 'shared', 'pass.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'home.sql'), 'utf8');
const P = require(SRC_PATH);
const S = require(path.join(__dirname, '..', 'shared', 'settlers-rules.js'));

let fails = 0;
const T = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || d == null ? '' : '  [' + d + ']')); if (!c) fails++; };
const HEX = /^#[0-9A-Fa-f]{6}$/;
const BRIS = (y, m, d, h, min) => Date.UTC(y, m - 1, d, h - 10, min || 0);   /* a Brisbane wall-clock time, as ms */

const PINS = {};
const pin = (n, f) => { PINS[n] = f; };

pin('the home screen offers exactly Settlers and Deal', M =>
  M.GAME_ORDER.join() === 'settlers,deal' && Object.keys(M.GAMES).sort().join() === 'deal,settlers' &&
  M.GAMES.deal.name === 'Deal' && M.GAMES.deal.path === 'coastline' && M.GAMES.settlers.path === 'settlers');
pin('every track is thirty items, each in a real slot, each named once', M =>
  Object.keys(M.TRACKS).every(season => {
    const t = M.TRACKS[season];
    return /^\d{4}-\d{2}$/.test(season) && t.name && t.items.length === 30 &&
      t.items.every(i => M.SLOTS[i.slot] && i.name) && new Set(t.items.map(i => i.name)).size === 30;
  }));
pin('every item carries what its slot needs to be drawn', M =>
  Object.keys(M.TRACKS).every(season => M.TRACKS[season].items.every(i => {
    if (i.slot === 'avatar') return !!M.ART[i.art] && HEX.test(i.bg) && HEX.test(i.fg);
    if (i.slot === 'frame' || i.slot === 'banner') return typeof i.css === 'string' && i.css.length > 8;
    if (i.slot === 'title') return typeof i.text === 'string' && i.text.length >= 3 && i.text.length <= 16;
    if (i.slot === 's_color') return HEX.test(i.fill) && HEX.test(i.edge);
    if (i.slot === 's_dice') return [i.a, i.b].every(d => d && HEX.test(d.bg) && HEX.test(d.pip) && d.bg !== d.pip);
    if (i.slot === 's_island') return ['timber', 'clay', 'wool', 'grain', 'ore', 'desert'].every(k => i.terr[k] && HEX.test(i.terr[k].fill) && HEX.test(i.terr[k].hi) && HEX.test(i.terr[k].ink)) &&
      i.ocean.length === 3 && i.ocean.every(c => HEX.test(c)) && HEX.test(i.sand) && HEX.test(i.token);
    if (i.slot === 's_robber') return i.kind === 'gull' || i.kind === 'storm';
    if (i.slot === 'd_felt') return HEX.test(i.felt) && HEX.test(i.hi) && HEX.test(i.night);
    if (i.slot === 'd_back') return typeof i.css === 'string' && /gradient/.test(i.css) && HEX.test(i.ink);
    return false;
  })));
pin('a month spreads its rewards: both games and the account all get plenty', M =>
  Object.keys(M.TRACKS).every(season => {
    const n = { account: 0, settlers: 0, deal: 0 };
    M.TRACKS[season].items.forEach(i => { n[M.SLOTS[i.slot].scope]++; });
    const last = M.TRACKS[season].items[29];
    return n.account >= 8 && n.settlers >= 8 && n.deal >= 6 && (last.slot === 's_island' || last.slot === 'd_back' || last.slot === 'd_felt');
  }));
pin('an item id is season:tier, and nothing else resolves', M => {
  const a = M.item('2026-12:1'), z = M.item('2026-12:30');
  return a && a.tier === 1 && a.season === '2026-12' && a.id === '2026-12:1' && a.slot === 'avatar' && z && z.tier === 30 &&
    M.item('2026-12:0') === null && M.item('2026-12:31') === null && M.item('1999-01:1') === null &&
    M.item('gold') === null && M.item(null) === null && M.item('2026-12:1; drop') === null;
});
pin('a season is a Brisbane calendar month, and the first pass opens early', M =>
  M.seasonOf(BRIS(2026, 11, 21, 9)) === '2026-12' && M.seasonOf(BRIS(2026, 12, 1, 0)) === '2026-12' &&
  M.seasonOf(BRIS(2026, 12, 31, 23, 59)) === '2026-12' && M.seasonOf(BRIS(2027, 1, 1, 0)) === '2027-01' &&
  M.seasonOf(BRIS(2027, 1, 31, 23, 59)) === '2027-01' && M.seasonOf(BRIS(2027, 2, 1, 0, 1)) === '2027-02' &&
  M.seasonName('2026-12') === 'December' && M.seasonName('2027-01') === 'January');
pin('100 XP a tier, thirty tiers, and no more', M =>
  M.tierOf(0) === 0 && M.tierOf(99) === 0 && M.tierOf(100) === 1 && M.tierOf(1260) === 12 && M.tierOf(2999) === 29 &&
  M.tierOf(3000) === 30 && M.tierOf(99999) === 30 && M.tierOf(undefined) === 0 &&
  Math.abs(M.tierProgress(1260) - 0.6) < 1e-9 && M.tierProgress(3000) === 1 && M.tierProgress(5000) === 1);
pin('a game pays 30, a win 30 more, half against bots, 60 for the day’s first win', M =>
  M.gameXp(false, 1, false) === 15 && M.gameXp(true, 1, false) === 30 && M.gameXp(true, 1, true) === 90 &&
  M.gameXp(false, 2, false) === 30 && M.gameXp(true, 2, false) === 60 && M.gameXp(true, 4, true) === 120 &&
  M.gameXp(false, 3, true) === 30);
pin('Elo: a win against three bots pays each pairing, and the bots never move', M => {
  const r = M.eloResult([{ elo: 1000 }, { elo: 1200, fixed: true }, { elo: 1100, fixed: true }, { elo: 1050, fixed: true }], 0);
  return r.join() === '1062,1200,1100,1050';
});
pin('Elo: losing to a bot costs you and pays it nothing', M =>
  M.eloResult([{ elo: 1062 }, { elo: 1200, fixed: true }, { elo: 1100, fixed: true }], 1).join() === '1052,1200,1100');
pin('Elo: two people trade 16 at level ratings; nobody falls through 100', M =>
  M.eloResult([{ elo: 1000 }, { elo: 1000 }], 0).join() === '1016,984' &&
  M.eloResult([{ elo: 1000 }, { elo: 104 }], 0)[1] === 104 && M.eloResult([{ elo: 105 }, { elo: 100 }], 0)[1] === 100);
pin('you own a tier once your XP in its season reaches it, and keep it', M => {
  const prog = { '2026-12': 315 };
  return M.owns(prog, '2026-12:3') && !M.owns(prog, '2026-12:4') && !M.owns(prog, '2027-01:1') && !M.owns({}, '2026-12:1') &&
    !M.owns(prog, '2026-12:0') && !M.owns(prog, 'junk') && M.owned(prog).map(i => i.tier).join() === '1,2,3' &&
    M.owns({ '2026-12': 3000, '2027-03': 0 }, '2026-12:30');
});
pin('equipping: owned tiers in known slots only — the answers the database gives', M => {
  const prog = { '2026-12': 315 };
  return M.checkLoadout({ avatar: '2026-12:1', s_color: '2026-12:3' }, prog).ok &&
    M.checkLoadout({ avatar: '2026-12:4' }, prog).err === 'locked' && M.checkLoadout({ hat: '2026-12:1' }, prog).err === 'slot' &&
    M.checkLoadout({ avatar: 'gold' }, prog).err === 'item' && M.checkLoadout({ avatar: '2026-12:31' }, prog).err === 'item' &&
    M.checkLoadout({ avatar: '2025-01:1' }, prog).err === 'locked' && M.checkLoadout({}, prog).ok && M.checkLoadout(null, prog).err === 'shape';
});
pin('an item only shows in the slot it belongs to', M =>
  M.wearing({ avatar: '2026-12:1' }, 'avatar').name === 'Pelican' && M.wearing({ avatar: '2026-12:2' }, 'avatar') === null &&
  M.wearing({ s_dice: '2026-12:2' }, 's_dice').name === 'Driftwood' && M.wearing({}, 'avatar') === null && M.wearing(null, 'title') === null);
pin('the bots: three graded for Settlers, strongest first, one per personality', M =>
  M.SETTLERS_BOTS.join() === 'bazza,shazza,davo' &&
  M.SETTLERS_BOTS.map(k => M.BOTS[k].kind).join() === 'builder,trader,expander' &&
  M.BOTS.bazza.rating.settlers > M.BOTS.shazza.rating.settlers && M.BOTS.shazza.rating.settlers > M.BOTS.davo.rating.settlers &&
  Object.keys(S.PERSONAS).every(k => M.botByKind(k)) && M.botById(M.BOTS.davo.id).name === 'Davo' && M.botById('nobody') === null);
pin('an avatar is the equipped art, or the first letter of the name — never raw markup', M => {
  const a = M.avatarHtml({ avatar: '2026-12:1', frame: '2026-12:7' }, 'Josh', 40), b = M.avatarHtml({}, 'josh', 40), c = M.avatarHtml({}, '<img>', 40);
  return /<svg/.test(a) && /outline:3px dashed/.test(a) && />J<\/span>$/.test(b) && !/<img>/.test(c);
});

Object.keys(PINS).forEach(n => { let ok = false, err = null; try { ok = !!PINS[n](P); } catch (e) { err = e.message; } T(n, ok, err); });

/* ---- the co-pin: pass.js and home.sql say the same thing ---- */
const has = s => SQL.indexOf(s) >= 0;
T('SQL pays the XP the screen promises (30 + 30, halved against bots, 60 daily)',
  P.XP.finish === 30 && P.XP.win === 30 && P.XP.dailyWin === 60 &&
  has('v_xp := 30 + case when v_pid = p_winner then 30 else 0 end;') && has('if v_humans < 2 then v_xp := v_xp / 2; end if;') && has('v_bonus := 60;'));
T('SQL sizes a tier the way the screen does (100 XP, thirty tiers)',
  P.XP.perTier === 100 && P.XP.tiers === 30 && has('< v_tier * 100') && has('v_tier < 1 or v_tier > 30'));
T('SQL plays Elo with the same K, start and floor',
  has('v_k constant int := ' + P.ELO.k + ';') && has('elo     int  not null default ' + P.ELO.start) && has('greatest(' + P.ELO.floor + ', elo - v_d)'));
T('SQL opens the first pass early, the same month the screen does', has("greatest(to_char(v_today, 'YYYY-MM'), '" + P.FIRST_SEASON + "')") && has("at time zone 'Australia/Brisbane'"));
T('SQL knows the same games', has("check (game in ('deal', 'settlers'))") && has("p_game not in ('deal', 'settlers')"));
T('SQL accepts exactly the slots the catalog has', has("array['" + P.SLOT_ORDER.join("','") + "']") && P.SLOT_ORDER.slice().sort().join() === Object.keys(P.SLOTS).sort().join());
T('SQL seeds every bot at the rating the lobby shows', Object.keys(P.BOTS).every(k => Object.keys(P.BOTS[k].rating).every(g =>
  new RegExp("\\('" + P.BOTS[k].id + "',\\s*'" + g + "',\\s*" + P.BOTS[k].rating[g] + "\\)").test(SQL))));
T('the bot ids are the ones identity.js already uses', (() => {
  const idsrc = fs.readFileSync(path.join(__dirname, '..', 'shared', 'identity.js'), 'utf8');
  return idsrc.indexOf(P.BOTS.bazza.id) >= 0 && idsrc.indexOf(P.BOTS.shazza.id) >= 0;
})());

/* ---- mutation proofs ---- */
function mutant(from, to) {
  if (SRC.split(from).length !== 2) throw new Error('mutation anchor not unique: ' + from);
  const mod = { exports: {} };
  new Function('module', 'globalThis', 'window', SRC.replace(from, to))(mod, {}, undefined);
  return mod.exports;
}
[
  ['Elo: a win against three bots pays each pairing, and the bots never move', 'if (!s.fixed) out[i] = Math.max(ELO.floor, s.elo - d);', 'out[i] = Math.max(ELO.floor, s.elo - d);'],
  ['Elo: losing to a bot costs you and pays it nothing', 'if (!seats[winner].fixed) out[winner] = we + gain;', 'out[winner] = we + gain;'],
  ['Elo: two people trade 16 at level ratings; nobody falls through 100', 'Math.max(ELO.floor, s.elo - d)', 's.elo - d'],
  ['you own a tier once your XP in its season reaches it, and keep it', ') >= tier * XP.perTier;', ') > tier * XP.perTier - XP.perTier;'],
  ['equipping: owned tiers in known slots only — the answers the database gives', "if (!owns(progress, v)) return { ok: false, err: 'locked', item: v };", ''],
  ['an item only shows in the slot it belongs to', 'return it && it.slot === slot ? it : null;', 'return it;'],
  ['a season is a Brisbane calendar month, and the first pass opens early', '+ 10 * 3600 * 1000', '+ 0'],
  ['a game pays 30, a win 30 more, half against bots, 60 for the day’s first win', 'if (humans < 2) xp = Math.floor(xp / 2);', ''],
  ['100 XP a tier, thirty tiers, and no more', 'Math.min(XP.tiers, Math.floor((xp || 0) / XP.perTier))', 'Math.floor((xp || 0) / XP.perTier)'],
].forEach(([name, from, to]) => {
  let bit = false, err = null;
  try { const M = mutant(from, to); let ok; try { ok = !!PINS[name](M); } catch (e) { ok = false; } bit = !ok; } catch (e) { err = e.message; }
  T('mutation bites: ' + name, bit, err);
});

console.log(fails === 0 ? 'PASSSIM: ALL PASS' : 'PASSSIM FAILURES: ' + fails);
process.exit(fails ? 1 : 0);
