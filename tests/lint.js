/* lint — the gate stage that catches what humans (and I) keep missing by hand.
   Three real bug classes, all of which have shipped here:
     1. a syntax slip inside an inline <script> (caught by hand every push until now)
     2. a <script src> pointing at a file that isn't there
     3. version drift — the root lobby was serving ?v=062 while the game ran 0.10.0,
        and the game's own header still claimed 0.4.1
*/
const fs = require('fs');
const path = require('path');

let fails = 0;
function T(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (cond || !detail ? '' : '  [' + detail + ']'));
  if (!cond) fails++;
}

const ROOT = path.join(__dirname, '..');
const HTML = ['index.html', 'coastline/index.html', 'mafia/index.html'];
const SHARED = fs.readdirSync(path.join(ROOT, 'shared')).filter(f => f.endsWith('.js'));

/* ---- shared modules must parse ---- */
SHARED.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, 'shared', f), 'utf8');
  let ok = true, err = '';
  try { new Function(src); } catch (e) { ok = false; err = e.message; }
  T('shared/' + f + ' parses', ok, err);
});

/* ---- every HTML file ---- */
HTML.forEach(rel => {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { T(rel + ' exists', false); return; }
  const html = fs.readFileSync(full, 'utf8');

  // 1. inline scripts parse
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  let ok = true, err = '';
  try { new Function(inline); } catch (e) { ok = false; err = e.message; }
  T(rel + ' — inline scripts parse', ok, err);

  // 2. external scripts point at real files
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  srcs.filter(s => !/^https?:/.test(s)).forEach(s => {
    const clean = s.split('?')[0];
    const target = path.resolve(path.dirname(full), clean);
    T(rel + ' — ' + clean + ' exists', fs.existsSync(target));
  });

  // 3. cache-busters agree with each other
  const vs = [...new Set([...html.matchAll(/\?v=([^"'&\s]+)/g)].map(m => m[1]))];
  T(rel + ' — cache-busters agree', vs.length <= 1, vs.join(' vs '));

  // 4. a declared version must be the version everywhere: header, badge, busters
  const decl = /Version:\s*([0-9.]+)/.exec(html);
  if (decl) {
    const v = decl[1];
    const badge = /<span class="ver">v([0-9.]+)<\/span>/.exec(html);
    if (badge) T(rel + ' — the badge matches the header', badge[1] === v, badge[1] + ' vs ' + v);
    if (vs.length) T(rel + ' — cache-busters match the header', vs[0] === v, vs[0] + ' vs ' + v);
  }
});

/* ---- the rulebook lives in exactly one place ---- */
{
  const rb = require(path.join(ROOT, 'shared', 'mdeal-rules.js'));
  T('the rulebook is stamped', typeof rb.RULEBOOK === 'string' && rb.RULEBOOK.length > 0, rb.RULEBOOK);
  T('the rulebook builds the official 106-card deck', rb.buildDeck().length === 106);

  const game = fs.readFileSync(path.join(ROOT, 'coastline', 'index.html'), 'utf8');
  T('the game reads the rulebook rather than carrying its own copy',
    !/const\s+(COLORS|PROPS|DUAL_WILDS|RENT_DUALS|ACTIONS)\s*=/.test(game));
  T('and it actually loads it', /shared\/mdeal-rules\.js/.test(game));
}

console.log(fails === 0 ? 'LINT: ALL PASS' : 'LINT FAILURES: ' + fails);
process.exit(fails ? 1 : 0);
