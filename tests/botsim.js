/* botsim — the rating path at an online table with bots in it.

   That the bots play was checked and is settled: driving a real host+client
   pair, Bazza and Shazza each stepped through their turns and the two ends
   stayed in agreement. What that exercise did surface is worth recording,
   because both findings looked like bugs and neither was:

     - Sampling G.turn never catches a bot mid-turn. setTimeout is synchronous
       in this harness, so a bot seat plays and ends inside the same call
       stack and the turn appears to jump 0 -> 2. The bots were fine; the
       observation was wrong.
     - Driving turns in a tight loop stalls on seat 0, because finishEnd
       refuses a second advance of the same turn inside 800ms (v0.10.10's
       double-advance guard). Real time, not a bug.

   What remains worth pinning is the part that is new and quiet: whether an
   online table full of bots resolves to the right accounts, so the rating
   lands on the right rows.
*/
const vm = require('vm');
const path = require('path');
const { sourceFor, BRIDGE } = require('./_document');
const gameCode = sourceFor('mdeal', BRIDGE);

let fails = 0;
const T = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || !d ? '' : '  [' + d + ']'));
  if (!c) fails++;
};

function makeContext(name) {
  const el = () => new Proxy({ classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } }, style: {} }, {
    get(t, k) { if (k in t) return t[k]; return () => {}; },
    set() { return true; }
  });
  const sandbox = {
    performance: performance,
    console, Math, JSON, Date, Object, Array, Set, Map, Number, String, Boolean,
    Promise, isNaN, parseInt, parseFloat, RegExp, Error, TypeError,
    document: { querySelector: () => el(), querySelectorAll: () => [], createElement: () => el(),
                getElementById: () => el(), addEventListener: () => {}, body: { appendChild() {} } },
    addEventListener: () => {},
    location: { reload() {}, search: '', origin: '', pathname: '' },
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    navigator: {}, URLSearchParams,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(gameCode, sandbox, { filename: name });
  return sandbox;
}

const host = makeContext('host.js');
const client = makeContext('client.js');
const ctxs = [host, client];

function wire(ctx, idx) {
  ctx.__B.NET.tx = {
    send(type, payload) {
      const p = JSON.stringify(payload);
      ctxs.forEach((other, j) => { if (j !== idx) other.__B.NET.onMessage(type, JSON.parse(p)); });
    },
    track() {}, presence() { return {}; },
  };
}
wire(host, 0); wire(client, 1);

/* ---------- 1. the lobby seats the bots the pool advertises ---------- */
{
  const N = host.__B.NET;
  N.mode = 'lobby-host'; N.pkey = 'hk'; N.bots = [];
  N.lobbySeats = () => [{ key: 'hk', name: 'Josh', host: true, joined: 1 }];
  N.renderLobby = () => {};

  N.addBot(); N.addBot();
  const names = N.bots.map(b => b.name);
  T('adding two bots seats Bazza then Shazza', JSON.stringify(names) === '["Bazza","Shazza"]', JSON.stringify(names));
  T('each bot carries a key derived from its name',
    JSON.stringify(N.bots.map(b => b.key)) === '["bot-bazza","bot-shazza"]', JSON.stringify(N.bots.map(b => b.key)));
  T('and is flagged as AI', N.bots.every(b => b.isAI === true));

  N.addBot();
  T('a third bot is Davo, from the same pool', N.bots[2] && N.bots[2].name === 'Davo', N.bots[2] && N.bots[2].name);

  N.removeBot('bot-davo');
  T('and a bot can be removed again', N.bots.length === 2 && !N.bots.some(b => b.key === 'bot-davo'));

  const seats = N.tableSeats();
  T('the table is the humans plus the bots, in that order',
    JSON.stringify(seats.map(s => s.name)) === '["Josh","Bazza","Shazza"]', JSON.stringify(seats.map(s => s.name)));
  T('the lobby refuses a sixth seat', (() => {
    N.lobbySeats = () => [1,2,3].map((n,i) => ({ key: 'h' + n, name: 'H' + n, joined: i }));
    const before = N.bots.length; N.addBot(); return N.bots.length === before;
  })());
}

/* ---------- 2. a real game: two humans with two bots between them ---------- */
const roster = [
  { key: 'hk',         name: 'Josh',   uid: 'aaaaaaaa-0000-4000-8000-000000000009', isAI: false },
  { key: 'bot-bazza',  name: 'Bazza',  uid: null, isAI: true },
  { key: 'ck',         name: 'Mick',   uid: 'bbbbbbbb-0000-4000-8000-000000000009', isAI: false },
  { key: 'bot-shazza', name: 'Shazza', uid: null, isAI: true },
];
client.__B.NET.pkey = 'ck'; client.__B.NET.mode = 'joining';
host.__B.NET.pkey = 'hk';   host.__B.NET.mode = 'lobby-host'; host.__B.NET.bots = [];

host.__B.NET.tx.send('start', { roster, rules: { v: 1, firstTurnAttack: false, clock: { mode: 'off' } } });
host.__B.NET.onStart({ roster }, true);

T('the host seated four players', host.__B.G.players.length === 4, String(host.__B.G.players.length));
T('the client seated the same four', client.__B.G.players.length === 4, String(client.__B.G.players.length));
T('the client knows which seats are bots',
  JSON.stringify(client.__B.G.players.map(p => !!p.isAI)) === '[false,true,false,true]',
  JSON.stringify(client.__B.G.players.map(p => !!p.isAI)));
T('the client sits in its own seat', client.__B.MYSEAT === 2, String(client.__B.MYSEAT));

/* ---------- 3. the table resolves to the right accounts ---------- */
{
  const ID = host.ID || vm.runInContext('typeof ID!=="undefined" ? ID : null', host);
  T('the identity module rode in with the page', !!ID);
  if (ID) {
    ID.user = { id: 'aaaaaaaa-0000-4000-8000-000000000009' };
    host.__B.NET.roster = roster;
    const seats = ID.seatUids();
    T('all four seats resolve to accounts', seats.filter(Boolean).length === 4, JSON.stringify(seats));
    T('the bots resolve to their seeded ids',
      seats[1] === ID.BOT_UIDS.bazza && seats[3] === ID.BOT_UIDS.shazza, JSON.stringify([seats[1], seats[3]]));
    T('the humans keep the uids the roster carried',
      seats[0] === roster[0].uid && seats[2] === roster[2].uid);

    const davo = [...roster.slice(0, 3), { key: 'bot-davo', name: 'Davo', uid: null, isAI: true }];
    host.__B.NET.roster = davo;
    T('an unseeded bot resolves to nothing rather than a wrong account',
      ID.seatUids()[3] === null);
    host.__B.NET.roster = roster;
  }
}

/* ---------- 4. the rating screen actually fills in ---------- */
/* Static checks prove the markup exists and the hooks are wired. They do not
   prove the screen says anything. This runs paintElo against the real page. */
const { JSDOM } = require('jsdom');
const { htmlFor } = require('./_document');

(async () => {
  const dom = new JSDOM(htmlFor('mdeal'), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://it.test/coastline/' });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 700));

  const $ = q => w.document.querySelector(q);
  const scr = $('#eloscreen');
  T('the rating screen is in the built page', !!scr);

  if (scr) {
    w.eval('ID.profile = { id:"me", elo:1000, friend_code:"ABC123" }; ID.user = { id:"me" };');

    w.eval('paintElo({ rated:true, won:true, before:1000, after:1031, delta:31 })');
    /* Sampled before the animation finishes: the number must still be on its
       way. Checking only the final value cannot tell a count from a snap. */
    await new Promise(r => setTimeout(r, 120));
    const midway = $('#elonum').textContent;
    T('the number starts at the old rating and travels', midway !== '1031' && +midway >= 1000 && +midway <= 1031, midway);
    await new Promise(r => setTimeout(r, 1400));
    T('a win opens the screen', scr.classList.contains('show'));
    T('and lands on the new rating', $('#elonum').textContent === '1031', $('#elonum').textContent);
    T('and shows the gain, signed', $('#elodelta').textContent === '+31', $('#elodelta').textContent);
    T('coloured as a gain', $('#elodelta').className.indexOf('up') >= 0, $('#elodelta').className);
    T('the delta animation ran', $('#elodelta').className.indexOf('in') >= 0);
    T('and the verdict reads as a win', $('#eloverdict').textContent === 'You win', $('#eloverdict').textContent);

    w.eval('closeElo(); ELOCLOSED = false; ELOSHOWN = false;');
    T('it can be dismissed', !scr.classList.contains('show'));

    w.eval('paintElo({ rated:true, won:false, before:1000, after:982, delta:-18 })');
    await new Promise(r => setTimeout(r, 1400));
    T('a loss lands on the lower rating', $('#elonum').textContent === '982', $('#elonum').textContent);
    T('and shows the loss', $('#elodelta').textContent === '-18', $('#elodelta').textContent);
    T('coloured as a loss', $('#elodelta').className.indexOf('down') >= 0, $('#elodelta').className);
    T('and the verdict does not claim a win', $('#eloverdict').textContent !== 'You win', $('#eloverdict').textContent);

    w.eval('closeElo(); ELOCLOSED = false; ELOSHOWN = false;');
    w.eval('paintElo({ rated:false, why:"toobig", before:1000 })');
    await new Promise(r => setTimeout(r, 200));
    T('an unrated game still explains itself', scr.classList.contains('show') &&
      /too many/i.test($('#elosub').textContent), $('#elosub').textContent);
    T('and shows no change', $('#elodelta').textContent === '±0', $('#elodelta').textContent);
    T('and holds the rating steady', $('#elonum').textContent === '1000', $('#elonum').textContent);

    w.eval('closeElo(); ELOCLOSED = false; ELOSHOWN = false;');
    w.eval('paintElo({ rated:false, why:"noaccounts", names:["Bazza","Shazza"], before:1000, after:1000, delta:0, won:true })');
    await new Promise(r => setTimeout(r, 200));
    const msg = $('#elosub').textContent;
    T('an unmoved rating names the players missing accounts', /Bazza and Shazza/.test(msg), msg);
    T('and names the file that fixes it', /accounts\.sql/.test(msg), msg);
    T('and still calls the win a win', $('#eloverdict').textContent === 'You win', $('#eloverdict').textContent);

    w.eval('closeElo(); ELOCLOSED = false; ELOSHOWN = false;');
    w.eval('ID.user = null; ELOSHOWN = false; showElo(0)');
    await new Promise(r => setTimeout(r, 200));
    T('a guest is never shown it', !scr.classList.contains('show'));

    /* ---- the order, against a backend that takes its time ----
       On a phone the write and the read back are real round trips. The screen
       used to wait for them, so it arrived after the results or after Play
       Again had been pressed — working, and never seen. */
    const win = w.document.querySelector('#winscreen');
    w.eval(`
      ID.user = { id:'me' };
      ID.profile = { id:'me', elo:1000, friend_code:'ABC123' };
      ID.sb = {
        rpc: () => new Promise(r => setTimeout(() => r({ data:null, error:null }), 900)),
        from: () => ({ select: () => ({
          eq: () => ({ maybeSingle: () => new Promise(r => setTimeout(() => r({ data:{ id:'me', name:'Josh', elo:1031, games:1, wins:1 } }), 600)) }),
          in: (c, ids) => Promise.resolve({ data: ids.map(id => ({ id })) }),
        }) }),
      };
      MYSEAT = 0;
      G.players = [{name:'You'},{name:'Bazza',isAI:true},{name:'Shazza',isAI:true}];
      G.turnCount = 9;
      ELOSHOWN = false; ELOCLOSED = false;
      WINREVEAL = () => { document.querySelector('#winscreen').classList.add('show'); };
      window.__opened = showElo(0);
    `);
    await new Promise(r => setTimeout(r, 120));
    T('the rating screen is up before the network answers', scr.classList.contains('show'));
    T('showing the rating tells the caller to hold the results', w.__opened === true);
    T('and it opens on the rating you walked in with', $('#elonum').textContent === '1000', $('#elonum').textContent);
    T('the results are still hidden behind it', !win.classList.contains('show'));

    const settled = async (want, ms) => {   // the state, not the clock
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if ($('#elonum').textContent === want) return true;
        await new Promise(r => setTimeout(r, 25));
      }
      return $('#elonum').textContent === want;
    };
    T('once the result lands the number moves', await settled('1031', 5000), $('#elonum').textContent);
    T('and the change is the real one, not zero', $('#elodelta').textContent === '+31', $('#elodelta').textContent);
    T('the results still wait until it is dismissed', !win.classList.contains('show'));

    w.eval('closeElo(); ELOCLOSED = false; ELOSHOWN = false;');
    await new Promise(r => setTimeout(r, 250));
    T('dismissing the rating reveals the results', win.classList.contains('show'));

    /* a result that arrives after the player has moved on must not reopen */
    w.eval(`
      document.querySelector('#winscreen').classList.remove('show');
      ELOCLOSED = true;
      WINREVEAL = () => { document.querySelector('#winscreen').classList.add('show'); };
      paintElo({ rated:true, won:true, before:1000, after:1031, delta:31 });
    `);
    await new Promise(r => setTimeout(r, 150));
    T('a late result does not reopen over the results', !scr.classList.contains('show'));
    T('and hands the player straight to them', win.classList.contains('show'));
  }

  /* ---------- 5. the account gate ----------
     M Deal is rated, so every way into a game needs an account. A guest gets
     the sign-in sheet and no table. */
  {
    const home = w.document.querySelector('#home');
    const guest = () => w.eval('ID.user = null; ID.ready = true; ID.sheetOpen = false; ID.gateWhy = null; GAME_STARTED = false; NET.mode = "off"; PENDING_ENTRY = null; document.querySelector("#home").classList.add("show");');

    guest();
    w.eval('playSolo()');
    await new Promise(r => setTimeout(r, 150));
    T('a guest tapping Play Solo does not get a table', w.eval('GAME_STARTED') === false);
    T('the home screen stays up', home.classList.contains('show'));
    T('and the sign-in sheet opens', w.eval('ID.sheetOpen') === true);
    T('saying why it opened', /rated/i.test(w.eval('ID.gateWhy || ""')), w.eval('ID.gateWhy || ""'));
    T('and the intent is remembered', w.eval('typeof PENDING_ENTRY') === 'function');

    /* signing in continues what was interrupted */
    w.eval('ID.user = { id:"me" }; ID.profile = { id:"me", elo:1000, friend_code:"ABC123" }; accountReady();');
    await new Promise(r => setTimeout(r, 500));
    T('signing in starts the game that was asked for', w.eval('GAME_STARTED') === true);
    T('and the intent is not left behind to fire twice', w.eval('PENDING_ENTRY') === null);

    /* a signed-in player is never stopped */
    w.eval('GAME_STARTED = false; NET.mode = "off"; document.querySelector("#home").classList.add("show");');
    w.eval('playSolo()');
    await new Promise(r => setTimeout(r, 150));
    T('a signed-in player goes straight to the table', w.eval('GAME_STARTED') === true);
    T('and the home screen gets out of the way', !home.classList.contains('show'));

    /* the online doors */
    guest();
    w.eval('window.__hosted = false; NET._hostGame = async () => { window.__hosted = true; };');
    w.eval('NET.hostGame()');
    await new Promise(r => setTimeout(r, 150));
    T('a guest cannot host', w.__hosted === false);
    T('and is asked to sign in', w.eval('ID.sheetOpen') === true);

    guest();
    /* the host attempt above left the in-flight flag set; a fresh door must not
       inherit it — see NET._busy() */
    w.eval('window.__joined = false; NET._joinGame = async () => { window.__joined = true; };');
    w.eval('NET.joinGame()');
    await new Promise(r => setTimeout(r, 150));
    T('a guest cannot join a room', w.__joined === false);
    T('and signing in then joins it', await (async () => {
      w.eval('ID.user = { id:"me" }; accountReady();');
      const t0 = Date.now();                       // wait on the state, not a guess
      while (Date.now() - t0 < 3000) {
        if (w.__joined === true) return true;
        await new Promise(r => setTimeout(r, 30));
      }
      console.log('  DIAG joined=' + w.__joined + ' pending=' + w.eval('typeof PENDING_ENTRY') + ' connecting=' + w.eval('NET._connecting'));
      return false;
    })());

    /* The resume must not re-enter the gated door. It used to, and with auth
       still settling that recursed until the stack blew — a hang on a slow
       phone, which is exactly when it would happen. */
    w.eval('ID.user = null; ID.ready = false; ID.sheetOpen = false; PENDING_ENTRY = null; window.__joined = false; NET._connecting = false;');
    let blew = false;
    try { w.eval('NET.joinGame()'); } catch (e) { blew = /stack|recursion/i.test(String(e && e.message)); }
    await new Promise(r => setTimeout(r, 200));
    T('a gated entry while auth is settling does not recurse', !blew);
    w.eval('ID.ready = true; ID.user = null;');
    await new Promise(r => setTimeout(r, 3400));
    T('and it settles on the sign-in sheet rather than spinning', w.eval('ID.sheetOpen') === true);

    /* auth that has not answered yet must not lock out someone who is signed in */
    w.eval('ID.user = null; ID.ready = false; ID.sheetOpen = false; GAME_STARTED = false; NET.mode = "off"; PENDING_ENTRY = null;');
    w.eval('playSolo()');
    await new Promise(r => setTimeout(r, 120));
    T('a slow session does not refuse immediately', w.eval('ID.sheetOpen') === false);
    w.eval('ID.user = { id:"me" }; ID.ready = true;');
    await new Promise(r => setTimeout(r, 400));
    T('and once it lands the game starts', w.eval('GAME_STARTED') === true);
  }

  dom.window.close();
  console.log(fails ? 'BOTSIM: ' + fails + ' FAILED' : 'BOTSIM: ALL PASS');
  process.exitCode = fails ? 1 : 0;
})();
