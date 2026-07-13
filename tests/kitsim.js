/* kitsim — the seam that has broken every time, finally under test.

   Every production bug this platform has shipped lived in the connection code, and the
   wire simulators never touched it: they stub NET.tx and start from a connected table.
   So: a fake Supabase, and assertions for each real failure.

     · a credential global that never existed  → every phone stranded (Mafia v0.2.2)
     · subscribe with no timeout               → silent hang forever on any channel error
     · a socket suspended by iOS               → snapshot freezes, host migrated away from
*/
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fails = 0;
let finished = false;

/* An unresolved promise empties Node's event loop and exits 0 — silently, mid-suite,
   and the gate's && chain reads that as success. The very bug class this file exists to
   catch, living in the file itself. Never again: nothing counts unless we reach the end. */
process.on('exit', () => {
  if (!finished) {
    console.log('FAIL — the suite never finished: something hung and Node exited quietly');
    process.exitCode = 1;
  }
});
process.on('unhandledRejection', (e) => {
  console.log('FAIL — unhandled rejection: ' + (e && e.message));
  process.exit(1);
});

function T(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (cond || !detail ? '' : '  [' + detail + ']'));
  if (!cond) fails++;
}

/* ---- a Supabase that does exactly what we tell it to ---- */
function fakeSDK(script) {
  return {
    createClient: function (url, key) {
      script.client = { url: url, key: key };
      return {
        channel: function (name, cfg) {
          const handlers = {};
          const ch = {
            state: 'closed',
            name: name,
            cfg: cfg,
            sent: [],
            meta: null,
            on: function (type, filter, cb) { handlers[type + ':' + (filter.event || '')] = cb; return ch; },
            subscribe: function (cb) {
              setTimeout(function () {
                if (script.status === 'never') return;           // the line that never answers
                if (script.status === 'SUBSCRIBED') ch.state = 'joined';
                cb(script.status);
              }, 1);
              return ch;
            },
            send: function (m) { ch.sent.push(m); },
            track: function (m) { ch.meta = m; },
            presenceState: function () { return script.presence || {}; },
            unsubscribe: function () { ch.state = 'closed'; },
            fire: function (type, ev, payload) {
              const h = handlers[type + ':' + ev];
              if (h) h(payload);
            },
          };
          script.channel = ch;
          return ch;
        },
      };
    },
  };
}

/* ---- tablekit in a sandbox, with a browser that barely exists ---- */
function loadKit(globals) {
  const store = {};
  const sandbox = {
    console, setTimeout, clearTimeout, Math, JSON, Date, Promise, Object, Array, String, Number,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: { createElement: () => ({}), head: { appendChild() {} } },
  };
  Object.assign(sandbox, globals || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'tablekit.js'), 'utf8'), sandbox, { filename: 'tablekit.js' });
  return sandbox;
}

(async function () {
  /* ===== credentials: the bug that stranded every phone ===== */
  {
    const kit = loadKit({}).TableKit;                       // no config globals at all
    const c = kit.credentials();
    T('credentials survive a missing config entirely',
      typeof c.anon === 'string' && c.anon.length > 40 && /^https:\/\//.test(c.url));
  }
  {
    // Mafia asked for SUPABASE_ANON_KEY — a global that never existed. It does now.
    const kit = loadKit({ SUPABASE_URL: 'https://x.test', SUPABASE_ANON_KEY: 'wrong-name-key' }).TableKit;
    const c = kit.credentials();
    T('credentials accept either global name that has ever existed',
      c.url === 'https://x.test' && c.key !== '' && c.anon === 'wrong-name-key');
  }
  {
    const kit = loadKit({ SUPABASE_URL: 'https://y.test', SUPABASE_ANON: 'right-name-key' }).TableKit;
    T('the real config still wins', kit.credentials().anon === 'right-name-key');
  }

  /* ===== identity and codes ===== */
  {
    const kit = loadKit({}).TableKit;
    const a = kit.pkey(), b = kit.pkey();
    T('the player key is stable within a session', a === b && a.length >= 6);
    const codes = Array.from({ length: 40 }, () => kit.roomCode());
    T('room codes are four unambiguous letters',
      codes.every(c => c.length === 4 && !/[IO01]/.test(c)));
  }

  /* ===== join: the happy path ===== */
  {
    const script = { status: 'SUBSCRIBED' };
    const box = loadKit({ supabase: fakeSDK(script) });
    const kit = box.TableKit;
    let gotMsg = null, presenceHits = 0;
    const tx = await kit.join({
      prefix: 'room', code: 'ABCD',
      events: ['state', 'intent'],
      onMessage: (ev, p) => { gotMsg = { ev, p }; },
      onPresence: () => { presenceHits++; },
      meta: { key: 'me', name: 'Josh' },
    });
    T('join resolves a tx once the channel is up', !!tx && tx.alive() === true);
    T('the room name is namespaced by game', script.channel.name === 'room-ABCD');
    T('presence is keyed by the player key', script.channel.cfg.config.presence.key === tx.key);
    T('meta is tracked on the way in', script.channel.meta && script.channel.meta.name === 'Josh');

    script.channel.fire('broadcast', 'state', { payload: { turn: 2 } });
    T('broadcasts route to onMessage with their event name',
      gotMsg && gotMsg.ev === 'state' && gotMsg.p.turn === 2);

    script.channel.fire('presence', 'sync');
    script.channel.fire('presence', 'join');
    script.channel.fire('presence', 'leave');
    T('all three presence events reach onPresence', presenceHits === 3);

    tx.send('intent', { k: 'bank' });
    T('tx.send speaks broadcast', script.channel.sent.length === 1 && script.channel.sent[0].event === 'intent');

    /* ===== the zombie: iOS suspends the socket, the server keeps smiling ===== */
    script.channel.state = 'closed';
    T('tx.alive() sees through a suspended socket', tx.alive() === false);
    tx.close();
    T('closing hangs up the line', script.channel.state === 'closed');
  }

  /* ===== join: the failures that used to hang forever ===== */
  {
    const script = { status: 'CHANNEL_ERROR' };
    const kit = loadKit({ supabase: fakeSDK(script) }).TableKit;
    let threw = null;
    try { await kit.join({ prefix: 'room', code: 'EFGH', events: [] }); }
    catch (e) { threw = e; }
    T('a channel error throws a sentence instead of hanging',
      !!threw && /could not reach the table/i.test(threw.message));
  }
  {
    const script = { status: 'never' };                     // the line that never answers
    const kit = loadKit({ supabase: fakeSDK(script) }).TableKit;
    let threw = null;
    const t0 = Date.now();
    try { await kit.join({ prefix: 'room', code: 'IJKL', events: [], timeoutMs: 40 }); }
    catch (e) { threw = e; }
    T('a silent line times out rather than hanging forever',
      !!threw && Date.now() - t0 < 2000);
  }

  /* ===== presence snapshots arrive keyed, duplicated and unordered ===== */
  {
    const kit = loadKit({}).TableKit;
    const snap = {
      a: [{ key: 'ck', name: 'Mick' }, { key: 'ck', name: 'Mick' }],   // duplicated
      b: [{ key: 'hk', name: 'Josh', host: true }],
      c: [{ key: 'zk', name: 'Kaz' }],
    };
    const seats = kit.seatsFrom(snap);
    T('seatsFrom dedupes and seats the host first',
      seats.length === 3 && seats[0].key === 'hk' && seats.filter(s => s.key === 'ck').length === 1);
    T('seatsFrom caps a full table', kit.seatsFrom(snap, 2).length === 2);
    T('seatsFrom survives a garbage snapshot', kit.seatsFrom(null).length === 0);
  }

  finished = true;
  console.log(fails === 0 ? 'KITSIM: ALL PASS' : 'KITSIM FAILURES: ' + fails);
  process.exit(fails ? 1 : 0);
})();
