/* duelsim — the powerup rulebook under load.
   Every powerup applied alone, all of them stacked together, and a thousand
   random builds: the sheet must stay playable every single time. */
const path = require('path');
const PU = require(path.join(__dirname, '..', 'shared', 'duel-powerups.js'));

let fails = 0;
function T(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (cond || !detail ? '' : '  [' + detail + ']'));
  if (!cond) fails++;
}

/* ---- the catalog itself ---- */
T('the catalog is stamped', typeof PU.CATALOG === 'string' && PU.CATALOG.length > 0, PU.CATALOG);
T('at least 50 powerups', PU.POWERUPS.length >= 50, String(PU.POWERUPS.length));

const ids = PU.POWERUPS.map(p => p.id);
T('every id is unique', new Set(ids).size === ids.length);
const names = PU.POWERUPS.map(p => p.name);
T('every name is unique', new Set(names).size === names.length);
T('every powerup says what it does',
  PU.POWERUPS.every(p => typeof p.text === 'string' && p.text.length > 4));
T('every powerup can apply', PU.POWERUPS.every(p => typeof p.apply === 'function'));

/* ---- a sheet is sane ---- */
function sane(s, label) {
  const checks = [
    ['hp', s.hp >= 10],
    ['damage', s.damage >= 1],
    ['fireRate', s.fireRate >= 0.5 && s.fireRate <= 12],
    ['magSize', s.magSize >= 1 && Number.isInteger(s.magSize)],
    ['reloadTime', s.reloadTime >= 0.15 && s.reloadTime <= 3],
    ['bulletSpeed', s.bulletSpeed >= 6 && s.bulletSpeed <= 90],
    ['bulletSize', s.bulletSize >= 0.03 && s.bulletSize <= 0.9],
    ['bulletCount', s.bulletCount >= 1 && s.bulletCount <= 9],
    ['moveSpeed', s.moveSpeed >= 2.5 && s.moveSpeed <= 14],
    ['scale', s.scale >= 0.45 && s.scale <= 2.2],
    ['no NaN anywhere', Object.keys(s).every(k => typeof s[k] !== 'number' || Number.isFinite(s[k]))]
  ];
  const bad = checks.filter(c => !c[1]).map(c => c[0]);
  T(label + ' stays sane', bad.length === 0, bad.join(','));
}

/* every powerup alone */
let soloBad = [];
PU.POWERUPS.forEach(p => {
  const s = PU.statsFor([p.id]);
  const ok = s.hp >= 10 && s.damage >= 1 && s.fireRate >= 0.5 &&
    Object.keys(s).every(k => typeof s[k] !== 'number' || Number.isFinite(s[k]));
  if (!ok) soloBad.push(p.id);
});
T('each powerup alone leaves a playable sheet', soloBad.length === 0, soloBad.join(','));

/* every powerup at once — the maximum build must still function */
sane(PU.statsFor(ids), 'all ' + ids.length + ' stacked');

/* a thousand random 8-pick builds */
const rng = PU.seededRng(1234);
let randomBad = 0;
for (let i = 0; i < 1000; i++) {
  const picks = [];
  for (let j = 0; j < 8; j++) picks.push(ids[Math.floor(rng() * ids.length)]);
  const s = PU.statsFor(picks);
  const ok = s.hp >= 10 && s.damage >= 1 && s.fireRate >= 0.5 && s.moveSpeed >= 2.5 &&
    Object.keys(s).every(k => typeof s[k] !== 'number' || Number.isFinite(s[k]));
  if (!ok) randomBad++;
}
T('1000 random 8-pick builds all stay playable', randomBad === 0, String(randomBad));

/* ---- dealing ---- */
const d1 = PU.deal([], PU.seededRng(7));
T('a deal is three cards', d1.length === 3, d1.join(','));
T('the three are distinct', new Set(d1).size === 3);
T('deals are deterministic under a seed',
  JSON.stringify(PU.deal([], PU.seededRng(7))) === JSON.stringify(d1));
T('deals replay identically for both players',
  JSON.stringify(PU.deal(['heavy'], PU.seededRng(42))) === JSON.stringify(PU.deal(['heavy'], PU.seededRng(42))));

const owned = ids.slice(0, ids.length - 2);
const d2 = PU.deal(owned, PU.seededRng(9));
T('a deal never offers what you own', d2.every(id => !owned.includes(id)));
T('a nearly-exhausted pool deals what is left', d2.length === 2, String(d2.length));

/* base stats don't leak between calls */
const a = PU.statsFor(['heavy']);
const b = PU.statsFor([]);
T('sheets are independent', a.damage > b.damage && b.damage === PU.baseStats().damage);

console.log(fails ? 'DUELSIM FAILED: ' + fails : 'DUELSIM GREEN');
process.exit(fails ? 1 : 0);
