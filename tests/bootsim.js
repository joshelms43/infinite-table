/* bootsim — boot the page the way a browser actually does.

   Every other harness concatenates the game's scripts in whatever order suits it, which
   makes them structurally blind to the one thing a browser cares about: document order.
   That blindness shipped a fatal bug. Extracting the rulebook into a module left its
   <script src> sitting below 1,600 lines of game code that ran `Object.keys(COLORS)` at
   load — an instant ReferenceError on a real phone, and nine green stages on CI.

   So this suite executes the scripts exactly as the document declares them: external
   files read from disk in place, inline blocks in sequence, nothing reordered.
*/
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fails = 0, finished = false;
process.on('exit', () => {
  if (!finished) { console.log('FAIL — bootsim never finished: something hung'); process.exitCode = 1; }
});
const T = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || !d ? '' : '  [' + d + ']'));
  if (!c) fails++;
};

const ROOT = path.join(__dirname, '..');
const PAGES = [
  { name: 'M Deal', key: 'mdeal', wants: ['COLORS', 'ACTIONS', 'buildDeck', 'NET', 'G', 'TableKit'] },
  { name: 'Mafia', key: 'mafia', wants: ['NET', 'G', 'ROLES', 'TableKit'] },
  { name: 'Penalty', key: 'penalty', wants: ['Penalty'] },
];

const { partsFor } = require('./_document');

function stubBrowser() {
  const el = () => new Proxy({ classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, querySelectorAll: () => [] }, {
    get(t, k) { if (k in t) return t[k]; return () => {}; },
    set() { return true; },
  });
  const store = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Math, JSON, Date, Object, Array, Set, Map, Number, String, Boolean, Promise,
    isNaN, parseInt, parseFloat, RegExp, Error, TypeError, URLSearchParams,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    document: {
      querySelector: () => el(), querySelectorAll: () => [], createElement: () => el(),
      getElementById: () => el(), addEventListener: () => {},
      body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } },
      head: { appendChild() {} }, visibilityState: 'visible',
    },
    addEventListener: () => {},
    location: { reload() {}, search: '', origin: '', pathname: '', href: '' },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    navigator: {}, fetch: () => new Promise(() => {}),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

PAGES.forEach(page => {
  const parts = partsFor(page.key);
  const sandbox = stubBrowser();
  vm.createContext(sandbox);

  let broke = null, brokeAt = '';
  for (const part of parts) {
    try {
      vm.runInContext(part.code, sandbox, { filename: part.what });
    } catch (e) {
      broke = e;
      brokeAt = part.what;
      break;
    }
  }
  T(page.name + ' boots in document order', !broke, broke ? brokeAt + ': ' + broke.message : '');
  if (broke) return;

  /* `const NET = …` is a lexical global: shared across scripts, but never a property of
     window. Probing sandbox.NET reports a phantom failure — ask the context, as a browser
     would, not the object. */
  const seen = vm.runInContext(
    '({' + page.wants.map(w => w + ': (typeof ' + w + ')').join(', ') + '})', sandbox);
  page.wants.forEach(g => {
    T(page.name + ' — ' + g + ' is there once the page has loaded', seen[g] !== 'undefined', seen[g]);
  });
});

finished = true;
console.log(fails === 0 ? 'BOOTSIM: ALL PASS' : 'BOOTSIM FAILURES: ' + fails);
process.exit(fails ? 1 : 0);
