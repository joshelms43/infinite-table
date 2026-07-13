/* revivesim — M Deal's own connection code, under test at last.

   kitsim proves the platform module in isolation. netsim starts from a table that is
   already connected. Between them sat NET.connect() and NET.revive() — the code that
   recovers your game when iOS suspends the socket mid-session — with no coverage at all.
   It is the code most likely to run on a bad night, and it was the least examined.
*/
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fails = 0, finished = false;
process.on('exit', () => {
  if (!finished) { console.log('FAIL — the suite never finished: something hung'); process.exitCode = 1; }
});
process.on('unhandledRejection', (e) => {
  console.log('FAIL — unhandled rejection: ' + (e && e.message)); process.exit(1);
});
const T = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) fails++; };

const html = fs.readFileSync(path.join(__dirname, '..', 'coastline', 'index.html'), 'utf8');
const gameCode = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
  + '\n;globalThis.__B = { get NET(){ return NET; }, get G(){ return G; }, get MYSEAT(){ return MYSEAT; } };';
const kitCode = fs.readFileSync(path.join(__dirname, '..', 'shared', 'tablekit.js'), 'utf8');

/* a Supabase that does exactly what the script says, and keeps the receipts */
function fakeSDK(script) {
  return {
    createClient: function () {
      return {
        channel: function (name, cfg) {
          const handlers = {};
          const ch = {
            state: 'closed', name, cfg, sent: [], meta: null,
            on: (type, filter, cb) => { handlers[type + ':' + (filter.event || '')] = cb; return ch; },
            subscribe: (cb) => {
              setTimeout(() => {
                if (script.status === 'never') return;
                if (script.status === 'SUBSCRIBED') ch.state = 'joined';
                cb(script.status);
              }, 1);
              return ch;
            },
            send: (m) => ch.sent.push(m),
            track: (m) => { ch.meta = m; },
            presenceState: () => script.presence || {},
            unsubscribe: () => { ch.state = 'closed'; },
            fire: (type, ev, payload) => { const h = handlers[type + ':' + ev]; if (h) h(payload); },
          };
          script.channel = ch;
          script.channels = (script.channels || 0) + 1;
          return ch;
        },
      };
    },
  };
}

function makeGame(script) {
  const el = () => new Proxy({ classList: { add() {}, remove() {}, toggle() {} }, style: {} }, {
    get(t, k) { if (k in t) return t[k]; return () => {}; },
    set() { return true; },
  });
  const store = {};
  const sandbox = {
    console, Math, JSON, Date, Object, Array, Set, Map, Number, String, Boolean, Promise,
    isNaN, parseInt, parseFloat, RegExp, Error, TypeError,
    setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
    document: {
      querySelector: () => el(), querySelectorAll: () => [], createElement: () => el(),
      getElementById: () => el(), addEventListener: () => {}, body: { appendChild() {} },
      visibilityState: 'visible',
    },
    addEventListener: () => {},
    location: { reload() {}, search: '', origin: '', pathname: '' },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    navigator: {},
    supabase: fakeSDK(script),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(kitCode, sandbox, { filename: 'tablekit.js' });
  vm.runInContext(gameCode, sandbox, { filename: 'coastline.js' });
  return sandbox;
}

(async function () {
  /* ===== a healthy connect goes through the platform ===== */
  const script = { status: 'SUBSCRIBED' };
  const g = makeGame(script);
  const NET = g.__B.NET;

  const ok = await NET.connect('WXYZ', true);
  T('connect reaches the table', ok === true && !!NET.tx && NET.code === 'WXYZ');
  T('the room is namespaced per game', script.channel.name === 'room-WXYZ');
  T('identity comes from the platform, not a private copy', typeof NET.pkey === 'string' && NET.pkey.length >= 6);
  T('presence is keyed by that identity', script.channel.cfg.config.presence.key === NET.pkey);
  T('the socket reports itself alive', NET.tx.alive() === true);

  let heard = null;
  const orig = NET.onMessage.bind(NET);
  NET.onMessage = (t, m) => { heard = t; orig(t, m); };
  script.channel.fire('broadcast', 'nack', { payload: { seat: 0 } });
  T('broadcasts land in the game\'s own handler', heard === 'nack');

  /* ===== revive on a living line: a nudge, not a rebuild ===== */
  NET.mode = 'host';
  NET.hostKey = NET.pkey;
  NET.roster = [{ key: NET.pkey, name: 'Josh' }, { key: 'ck', name: 'Mick' }];
  NET._meta = { key: NET.pkey, name: 'Josh', host: true };
  const before = script.channel;
  const channelsBefore = script.channels;
  await NET.revive();
  T('a living line is nudged, never rebuilt',
    script.channels === channelsBefore && script.channel === before && script.channel.meta.name === 'Josh');

  /* ===== the zombie: iOS suspended the socket while the server kept smiling ===== */
  script.channel.state = 'closed';
  before.sent.length = 0;
  await NET.revive();
  T('a dead socket is rebuilt on the same room',
    script.channel !== before && script.channels === channelsBefore + 1
    && NET.tx.alive() === true && NET.code === 'WXYZ');
  const said = script.channel.sent.map(m => m.event);
  T('the returning host re-announces the table it still owns',
    said.includes('start') && said.includes('state'));
  T('and re-tracks its presence so the others see it', !!script.channel.meta && script.channel.meta.host === true);

  /* ===== a returning player asks to be let back in ===== */
  const s2 = { status: 'SUBSCRIBED' };
  const g2 = makeGame(s2);
  const N2 = g2.__B.NET;
  await N2.connect('ABCD', false);
  N2.mode = 'client';
  N2._meta = { key: N2.pkey, name: 'Mick' };
  s2.channel.state = 'closed';
  await N2.revive();
  T('a returning player says hello rather than sitting mute',
    s2.channel.sent.map(m => m.event).includes('hello'));

  /* ===== the failures that used to be silent ===== */
  const s3 = { status: 'CHANNEL_ERROR' };
  const N3 = makeGame(s3).__B.NET;
  const bad = await N3.connect('EFGH', true);
  T('a broken line returns false instead of hanging forever', bad === false && !N3.tx);

  const s4 = { status: 'SUBSCRIBED' };
  const g4 = makeGame(s4);
  const N4 = g4.__B.NET;
  await N4.connect('IJKL', true);
  N4.mode = 'host';
  N4.teardown(true);
  T('teardown hangs up the line as well as stopping the clocks', s4.channel.state === 'closed');

  /* ===== revive refuses to fire when there is nothing to revive ===== */
  const s5 = { status: 'SUBSCRIBED' };
  const N5 = makeGame(s5).__B.NET;
  N5.mode = 'off';
  await N5.revive();
  T('revive is a no-op with no table to return to', !s5.channels);

  finished = true;
  console.log(fails === 0 ? 'REVIVESIM: ALL PASS' : 'REVIVESIM FAILURES: ' + fails);
  process.exit(fails ? 1 : 0);
})();
