/* _document — one definition of "the program under test".

   Seven harnesses had seven ways of loading the game: some concatenated the inline blocks,
   some prepended the rulebook, one prepended the platform layer too, and jsdom quietly
   fetched none of it. The differences between them were exactly where a bug could hide —
   and one did: a load order that was fatal in a browser and invisible to all nine stages
   (v0.10.7).

   So the document decides now, not the harness. Scripts come out in the order the page
   declares them, external files read from disk in place, nothing reordered by convenience.
   Anything that wants to run the game asks here.
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = {
  mdeal: 'coastline/index.html',
  mafia: 'mafia/index.html',
  penalty: 'penalty/index.html',
  penaltylab: 'penalty/lab/index.html',
  pool: 'pool/index.html',
  lobby: 'index.html',
};

function fileFor(page) {
  return path.join(ROOT, PAGES[page] || page);
}

/* Every script the page runs, in document order: [{ what, code }] */
function partsFor(page) {
  const full = fileFor(page);
  const html = fs.readFileSync(full, 'utf8');
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  const parts = [];
  let m;
  while ((m = re.exec(html))) {
    const src = (/src="([^"]+)"/.exec(m[1] || '') || [])[1];
    if (!src) { parts.push({ what: 'inline', code: m[2] }); continue; }
    if (/^https?:/.test(src)) continue;                       // a CDN is not ours to test
    const p = path.resolve(path.dirname(full), src.split('?')[0]);
    parts.push({ what: src, code: fs.readFileSync(p, 'utf8') });
  }
  return parts;
}

/* The whole program as one string, still in document order. */
function sourceFor(page, extra) {
  return partsFor(page).map(p => p.code).join('\n') + (extra ? '\n' + extra : '');
}

/* For jsdom, which will not fetch <script src>: inline each one exactly where it sat,
   so the document the browser sees is the document the test sees. */
function htmlFor(page) {
  const full = fileFor(page);
  const html = fs.readFileSync(full, 'utf8');
  return html.replace(/<script([^>]*)><\/script>/g, (tag, attrs) => {
    const src = (/src="([^"]+)"/.exec(attrs || '') || [])[1];
    if (!src || /^https?:/.test(src)) return tag;
    const p = path.resolve(path.dirname(full), src.split('?')[0]);
    return '<script>' + fs.readFileSync(p, 'utf8') + '</script>';
  });
}

/* The bridge every sandboxed harness needs: `const NET = …` is a lexical global, shared
   across scripts but never a property of window, so a vm context cannot reach it without
   being handed a door. */
const BRIDGE = '\n;globalThis.__B = { get NET(){ return NET; }, get G(){ return G; },'
  + ' get MYSEAT(){ return MYSEAT; }, get RULES(){ return typeof RULES!=="undefined" ? RULES : null; },'
  + ' get MYROLE(){ return typeof MYROLE!=="undefined" ? MYROLE : null; },'
  + ' get LASTINVEST(){ return typeof LASTINVEST!=="undefined" ? LASTINVEST : null; } };';

module.exports = { ROOT, PAGES, fileFor, partsFor, sourceFor, htmlFor, BRIDGE };
