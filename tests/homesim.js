/* homesim — the home screen, driven through its own buttons, and the two
   games as they are launched from it.

   A real DOM (jsdom) with the page's scripts in document order and a small
   in-memory Supabase behind it. Pins: only Deal and Settlers are offered; a
   rating sits beside its name everywhere; the one lobby builds the right
   launch link for every way of playing; Deal's tables ask a guest to sign in
   and then carry on; friends, challenges and room codes; the pass track,
   equipping and what happens when the database says no; and a database that
   has not been updated yet degrades instead of lying. Then Settlers: launched
   from home it skips its menu, wears what is equipped, and reports a rated
   result when — and only when — someone is signed in. Then Deal: launched
   from home it hides its own menu and wears the equipped table. */
const { JSDOM, VirtualConsole } = require('jsdom');
const { htmlFor } = require('./_document');
const Pass = require('../shared/pass.js');

let fails = 0, finished = false;
process.on('exit', () => { if (!finished) { console.log('FAIL — homesim never finished: something hung'); process.exitCode = 1; } });
const T = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (c || d == null ? '' : '  [' + d + ']')); if (!c) fails++; };
const tick = (ms) => new Promise(r => setTimeout(r, ms || 0));
const NOW = Date.UTC(2026, 11, 10, 2, 0);            /* 10 December 2026, midday in Brisbane */
const SEASON = Pass.seasonOf(NOW);
const ME = '11111111-1111-4111-8111-111111111111', F1 = '22222222-2222-4222-8222-222222222222', F2 = '33333333-3333-4333-8333-333333333333';

/* ---------- an in-memory Supabase ---------- */
function fakeSupabase(db) {
  const session = () => (db.session ? { user: { id: ME, email: 'josh@coastline.game' } } : null);
  function table(name) {
    const q = { _f: [] };
    const run = () => {
      if (db.missing && (name === 'ratings' || name === 'pass_progress')) return { data: null, error: { code: '42P01', message: 'relation "' + name + '" does not exist' } };
      let rows = (db[name] || []).slice();
      q._f.forEach(f => { rows = rows.filter(f); });
      if (name === 'profiles' && db.missing) rows = rows.map(r => { const c = Object.assign({}, r); delete c.loadout; return c; });
      return { data: rows, error: null };
    };
    q.select = () => q;
    q.eq = (k, v) => { q._f.push(r => r[k] === v); return q; };
    q.in = (k, vs) => { q._f.push(r => vs.indexOf(r[k]) >= 0); return q; };
    q.or = () => { q._f.push(r => r.a === ME || r.b === ME); return q; };
    q.maybeSingle = async () => { const r = run(); return { data: r.data ? r.data[0] || null : null, error: r.error }; };
    q.update = (patch) => ({ eq: async (k, v) => { (db[name] || []).forEach(r => { if (r[k] === v) Object.assign(r, patch); }); return { error: null }; } });
    q.insert = async (row) => { (db[name] = db[name] || []).push(row); return { error: null }; };
    q.then = (res, rej) => Promise.resolve(run()).then(res, rej);
    return q;
  }
  return {
    auth: {
      getSession: async () => ({ data: { session: session() } }),
      signInWithPassword: async ({ email, password }) => {
        if (email === 'josh@coastline.game' && password === 'secret1') { db.session = true; return { data: { user: session().user, session: session() }, error: null }; }
        return { data: {}, error: { message: 'Invalid login credentials' } };
      },
      signOut: async () => { db.session = false; return {}; },
    },
    from: table,
    rpc: async (fn, args) => {
      db.rpcs.push([fn, args]);
      if (fn === 'my_friend_code') return { data: 'K7Q2MX', error: null };
      if (fn === 'set_loadout') {
        if (db.refuseLoadout) return { data: { ok: false, err: 'locked' }, error: null };
        db.profiles.filter(p => p.id === ME)[0].loadout = args.p; return { data: { ok: true }, error: null };
      }
      if (fn === 'remove_friend') { db.friends = db.friends.filter(f => f.b !== args.p_id); return { data: null, error: null }; }
      if (fn === 'add_friend') return { data: { ok: false, err: 'not_found' }, error: null };
      return { data: null, error: null };
    },
    channel: () => { const ch = { on: () => ch, subscribe: (cb) => { if (cb) cb('SUBSCRIBED'); return ch; }, send: () => {} }; return ch; },
    removeChannel: () => {},
  };
}
function freshDb(over) {
  return Object.assign({
    session: false, missing: false, refuseLoadout: false, rpcs: [],
    profiles: [
      { id: ME, name: 'Josh', elo: 1240, games: 31, wins: 17, loadout: {} },
      { id: F1, name: 'Sam', elo: 1180, games: 9, wins: 4, loadout: { avatar: SEASON + ':10' } },
      { id: F2, name: 'Kat', elo: 1090, games: 3, wins: 1, loadout: {} },
    ],
    friends: [{ a: ME, b: F1 }, { a: ME, b: F2 }],
    ratings: [
      { user_id: ME, game: 'deal', elo: 1240, games: 31, wins: 17, fixed: false },
      { user_id: ME, game: 'settlers', elo: 1105, games: 14, wins: 6, fixed: false },
      { user_id: F1, game: 'settlers', elo: 1166, games: 5, wins: 2, fixed: false },
      { user_id: F1, game: 'deal', elo: 1180, games: 9, wins: 4, fixed: false },
    ],
    pass_progress: [{ user_id: ME, season: SEASON, xp: 1260 }],
  }, over || {});
}

function boot(page, url, db, store) {
  const errors = [];
  const vcon = new VirtualConsole();
  vcon.on('jsdomError', e => { if (!/Not implemented/.test(String(e && e.message))) errors.push(String(e && e.message)); });
  const dom = new JSDOM(htmlFor(page), {
    url, runScripts: 'dangerously', pretendToBeVisual: false, virtualConsole: vcon,
    beforeParse(w) {
      const RealDate = w.Date;
      w.Date.now = () => NOW;
      Object.keys(store || {}).forEach(k => w.localStorage.setItem(k, typeof store[k] === 'string' ? store[k] : JSON.stringify(store[k])));
      w.supabase = { createClient: () => fakeSupabase(db) };
      w.performance.now = () => w.__clock || 1000;
      w.requestAnimationFrame = () => 0;
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.navigator.vibrate = () => true;
      w.Element.prototype.scrollIntoView = function () {};
      w.addEventListener('error', e => errors.push(String(e.message || e.error)));
    },
  });
  return { w: dom.window, errors };
}
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const type = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

(async () => {
  /* ================= a guest ================= */
  {
    const db = freshDb();
    const { w, errors } = boot('home', 'https://infinite-table.test/home/', db);
    const $ = s => w.document.querySelector(s), $$ = s => Array.from(w.document.querySelectorAll(s));
    const went = []; w.eval('NAV = function (u) { window.__went.push(u); }'); w.__went = went;
    await tick(30);
    T('the home screen boots for a guest with no errors', errors.length === 0 && !!$('#me'), errors.join(' | '));
    T('it offers exactly two games: Settlers and Deal', $$('.gcard').length === 2 && $$('.gcard .gn').map(text).join('|') === 'Settlers|Deal');
    T('no other game is linked from anywhere on it', !/pool|duel|lastcard|headlands|mafia|penalty/i.test($('#view').innerHTML + $('#tabs').innerHTML));
    T('each game wears its art: the island and the card fan', !!$('.gcard.settlers svg.hexart') && $$('.gcard.deal .fcard').length === 4);
    T('a guest sees no ratings, no pass and no friends — and a way to sign in', $$('.rt').length === 0 && !$('.passbar') && !/Friends/.test(text($('#wrap'))) && !!$('[data-act="signin"]'));
    T('four tabs: Home, Play, Friends, Profile', $$('#tabs button').map(text).join() === 'Home,Play,Friends,Profile' && $('#tabs button.on').dataset.tab === 'home');

    /* the one lobby: Settlers against bots, as a guest */
    click(w, $('.big'));
    T('Play opens the lobby for the chosen game', $('#tabs button.on').dataset.tab === 'play' && text($('h1')) === 'Settlers');
    T('the table shows each bot with its rating beside its name', $$('.row .n1').slice(1).map(text).join('|') === 'Bazza1200|Shazza1100' && text($('.lbl .pill')) === 'Unrated');
    click(w, $('.pickbots[data-v="3"]'));
    T('three bots seats Davo too', $$('.row .n1').map(text).join('|').endsWith('Davo1050'));
    click(w, $('#startbtn'));
    T('Start launches Settlers with the choices made here', went[0] === '../settlers/?bots=3&interval=60000&from=home', went[0]);
    click(w, $('.pickroll[data-v="custom"]'));
    type(w, $('#customin'), '3');
    const tooFast = $('#startbtn').classList.contains('off') && $('#customin').classList.contains('bad');
    type(w, $('#customin'), '45');
    click(w, $('#startbtn'));
    T('a custom roll clock is carried through, and a bad one can’t start', tooFast && went[1] === '../settlers/?bots=3&interval=45000&from=home', went[1]);
    T('the lobby remembers your choices', JSON.parse(w.localStorage.getItem('it_home')).bots === 3 && JSON.parse(w.localStorage.getItem('it_home')).custom === 45);
    click(w, $('.pickmode[data-v="friends"]'));
    T('Settlers with friends says Coming Soon rather than pretending', text($('.soon')) === 'Coming Soon' && !$('#startbtn'));

    /* Deal is rated: a guest is asked to sign in, and then carries on */
    click(w, $('.pickgame[data-v="deal"]')); click(w, $('.pickmode[data-v="bots"]'));
    T('Deal’s table seats Bazza and Shazza at their ratings', $$('.row .n1').slice(1).map(text).join('|') === 'Bazza1100|Shazza1100');
    const before = went.length;
    click(w, $('#startbtn'));
    T('starting Deal as a guest opens sign-in instead of the table', went.length === before && $('#sheetwrap').classList.contains('show') && !!$('#acctuser'));
    $('#acctuser').value = 'josh'; $('#acctpass').value = 'wrong';
    click(w, $('[data-act="dosignin"]')); await tick(30);
    T('a wrong password says so and keeps what you typed', /wrong username or password/i.test(text($('#sheet .err'))) && $('#acctuser').value === 'josh' && went.length === before);
    $('#acctpass').value = 'secret1';
    click(w, $('[data-act="dosignin"]')); await tick(60);
    T('signing in carries on to the table you asked for', went[before] === '../coastline/?solo=1&from=home' && !$('#sheetwrap').classList.contains('show'), went[before]);
    T('no page errors as a guest', errors.length === 0, errors.join(' | '));
  }

  /* ================= signed in ================= */
  {
    const db = freshDb({ session: true });
    const { w, errors } = boot('home', 'https://infinite-table.test/home/', db, { it_room: { code: '7KQ2', ts: NOW } });
    const $ = s => w.document.querySelector(s), $$ = s => Array.from(w.document.querySelectorAll(s));
    const went = []; w.__went = went; w.eval('NAV = function (u) { window.__went.push(u); }');
    await tick(80);
    T('signed in: your name, and the month’s pass with its tier', text($('#me .nm')) === 'Josh' && text($('.passbar')) === 'December Pass · Tier 12' && $('.passbar .bar i').style.width === '60%', text($('#me')));
    T('your rating sits beside each game’s name', text($('.gcard.settlers .gn')) === 'Settlers1105' && text($('.gcard.deal .gn')) === 'Deal1240' &&
      $('.gcard.settlers .gn .rt').parentNode === $('.gcard.settlers .gn'));
    T('friends show with the rating for the chosen game beside the name', $$('#wrap .row .n1').filter(e => /Sam|Kat/.test(text(e))).map(text).join('|') === 'Sam1166|Kat1000');
    click(w, $('.gcard.deal'));
    T('choosing Deal switches the ratings and the Play button', text($('.big')) === 'Play Deal' && $$('#wrap .row .n1').some(e => text(e) === 'Sam1180') && $('.gcard.deal').classList.contains('on'));
    T('Your Games lists a table you can walk back to', /Deal · Room 7KQ2/.test(text($('#wrap'))) && $('[data-act="nav"]').dataset.url === '../coastline/?join=7KQ2&from=home');
    T('a friend wears their own avatar', /<svg/.test($$('#wrap .row').filter(r => /Sam/.test(text(r)))[0].querySelector('.av').innerHTML));

    /* challenge a friend */
    click(w, $$('[data-act="challenge"]')[0]);
    T('Challenge asks which game, and Settlers is honest about not being ready', /Challenge Sam/.test(text($('#sheet h3'))) && !!$('#sheet .btn.off'));
    click(w, $('[data-act="challengedeal"]'));
    T('challenging to Deal hosts a room and invites them', went[0] === '../coastline/?invite=' + F1 + '&from=home', went[0]);

    /* rooms */
    w.tab('play'); click(w, $('.pickgame[data-v="deal"]')); click(w, $('.pickmode[data-v="friends"]'));
    click(w, $('[data-act="host"]'));
    type(w, $('#joinin'), 'ab'); click(w, $('[data-act="join"]'));
    const n = went.length;
    type(w, $('#joinin'), 'abcd'); click(w, $('[data-act="join"]'));
    T('Host A Room and Join both go straight to the table', went[1] === '../coastline/?host=1&from=home' && n === 2 && went[2] === '../coastline/?join=ABCD&from=home', went.slice(1).join(' '));

    /* friends tab */
    w.tab('friends');
    T('Friends shows your code and everyone with a Challenge button', text($('.codebox b')) === 'K7Q2MX' && $$('[data-act="challenge"]').length === 2 && !!$('#friendcode'));
    click(w, $$('[data-act="unfriend"]')[1]); await tick(40);
    T('removing a friend removes them', $$('[data-act="challenge"]').length === 1 && db.rpcs.some(r => r[0] === 'remove_friend' && r[1].p_id === F2));

    /* profile: ratings, the pass, equipping */
    w.tab('profile');
    T('Profile lists a rating and record per game', $$('.stat').map(text).join('|') === 'Settlers11056 W · 8 L|Deal124017 W · 14 L', $$('.stat').map(text).join('|'));
    T('the pass shows all thirty tiers, twelve of them unlocked', $$('.tile').length === 30 && $$('.tile.locked').length === 18 && /Coastline/.test(text($('.passhead'))) && /60 \/ 100 XP/.test(text($('.passhead'))));
    const tile = id => $('.tile[data-id="' + SEASON + ':' + id + '"]');
    click(w, tile(5)); await tick(20);
    T('tapping an unlocked item equips it: on screen, on this device, in the database',
      tile(5).classList.contains('worn') && JSON.parse(w.localStorage.getItem('it_loadout')).s_color === SEASON + ':5' &&
      db.profiles[0].loadout.s_color === SEASON + ':5');
    click(w, tile(1)); await tick(20);
    T('equipping an avatar changes the one you wear', /<svg/.test($('.hero .av').innerHTML) && db.profiles[0].loadout.avatar === SEASON + ':1');
    click(w, tile(5)); await tick(20);
    T('tapping it again takes it off', !tile(5).classList.contains('worn') && db.profiles[0].loadout.s_color === undefined && db.profiles[0].loadout.avatar === SEASON + ':1');
    const calls = db.rpcs.filter(r => r[0] === 'set_loadout').length;
    click(w, tile(20)); await tick(20);
    T('a locked item can’t be equipped and nothing is sent', !tile(20).classList.contains('worn') && db.rpcs.filter(r => r[0] === 'set_loadout').length === calls && /Unlocks At Tier 20/.test(text($('#toasts'))));
    db.refuseLoadout = true;
    click(w, tile(3)); await tick(30);
    T('if the database refuses, the screen goes back to the truth', !tile(3).classList.contains('worn') && JSON.parse(w.localStorage.getItem('it_loadout')).d_felt === undefined && /Could Not Save/.test(text($('#toasts'))));
    click(w, $('[data-act="signout"]')); await tick(60);
    T('signing out clears what this device was wearing', w.localStorage.getItem('it_loadout') === '{}' && !!$('[data-act="signin"]') && $$('.rt').length === 0);
    T('no page errors signed in', errors.length === 0, errors.join(' | '));
  }

  /* ================= the database has not been updated yet ================= */
  {
    const db = freshDb({ session: true, missing: true });
    const { w, errors } = boot('home', 'https://infinite-table.test/home/?game=deal', db);
    const $ = s => w.document.querySelector(s);
    await tick(80);
    T('before home.sql is run: the Deal rating still shows, from where Deal keeps it', text($('.gcard.deal .gn')) === 'Deal1240' && $('.gcard.deal').classList.contains('on'));
    T('and the pass stays out of sight rather than showing a made-up zero', !$('.passbar') && (w.tab('profile'), !$('.tile')) && errors.length === 0, errors.join(' | '));
  }

  /* ================= Settlers, launched from home ================= */
  const wearing = { s_color: SEASON + ':5', s_dice: SEASON + ':19', s_island: SEASON + ':30', s_robber: SEASON + ':8' };
  async function settlers(db, store, url) {
    const b = boot('settlers', url || 'https://infinite-table.test/settlers/?bots=3&interval=45000&from=home', db, store);
    await tick(30);
    return b;
  }
  function playOut(w) {
    w.eval('var __n = 0; while (!G.over && __n++ < 400000) { GAMEMS += 250; tickLogic(); var __m = Settlers.botMove(G, 0, "builder"); if (__m && !G.over) sendMove(__m); }');
    for (let i = 0; i < 80; i++) { w.__clock = (w.__clock || 1000) + 100; w.frame(w.__clock); }
  }
  {
    const db = freshDb({ session: true });
    const { w, errors } = await settlers(db, { it_loadout: wearing, it_name: 'Josh' });
    const $ = id => w.document.getElementById(id), ev = c => w.eval(c);
    T('from home, Settlers skips its menu and deals the table that was chosen',
      ev('!!G') && ev('G.players.length') === 4 && ev('G.interval') === 45000 && $('menu').classList.contains('hidden') && !$('hud').classList.contains('hidden'));
    T('the bots sit strongest first, as the lobby showed', ev('KINDS.slice(1).join()') === 'builder,trader,expander' && ev('NAMES.join()') === 'Josh,Bazza,Shazza,Davo');
    T('you wear your colour, dice, island and robber', ev('PCOL[0]') === '#18B3A4' && ev('SKIN.dice.a.pip') === '#5CF2C8' && ev('TERR.timber.fill') === '#2FA36B' &&
      ev('SKIN.ocean[0]') === '#3FD3D8' && ev('SKIN.robber') === 'gull' && ev('PCOL[1]') === '#2F6FE0');
    playOut(w);
    await tick(30);
    const rec = db.rpcs.filter(r => r[0] === 'record_result');
    const bots = ['bazza', 'shazza', 'davo'].map(k => Pass.BOTS[k].id);
    T('a finished game is reported once: Settlers, you and the three bots, the winner, the rolls',
      rec.length === 1 && rec[0][1].p_game === 'settlers' && rec[0][1].p_players.join() === [ME].concat(bots).join() &&
      rec[0][1].p_winner === [ME].concat(bots)[ev('G.winner')] && rec[0][1].p_rounds === ev('G.rollN'), JSON.stringify(rec));
    T('the victory screen offers Home, not the old menu', !$('victory').classList.contains('hidden') && $('vmenu').textContent === 'Home' && $('vagain').textContent === 'Play Again');
    ev('RESULT = { ok: true, before: 1105, after: 1167, delta: 62, xp: 30, bonus: 60 }; drawRated();');
    T('and shows what the database said changed: the rating and the XP', /Rating\s*1167\s*\+62\s*\+90 XP/.test($('vrated').textContent) && !$('vrated').classList.contains('hidden'), $('vrated').textContent);
    ev('RESULT = { ok: true, before: 1105, after: 1095, delta: -10, xp: 15, bonus: 0 }; drawRated();');
    T('a loss reads as a loss', /1095\s*−10\s*\+15 XP/.test($('vrated').textContent) && !!w.document.querySelector('#vrated i.down'));
    T('no page errors in Settlers from home', errors.length === 0, errors.join(' | '));
  }
  {
    const db = freshDb({ session: false });
    const { w, errors } = await settlers(db, {});
    playOut(w);
    await tick(30);
    T('a guest’s game is unrated: nothing is sent, nothing is claimed', db.rpcs.filter(r => r[0] === 'record_result').length === 0 && w.document.getElementById('vrated').classList.contains('hidden') &&
      w.eval('PCOL[0]') === '#E2483D' && w.eval('SKIN.robber') === 'pawn' && errors.length === 0, errors.join(' | '));
  }
  {
    const { w } = await settlers(freshDb(), {}, 'https://infinite-table.test/settlers/');
    T('opened directly, Settlers still shows its own menu (until the home screen takes over the front door)', w.eval('G === null') && !w.document.getElementById('menu').classList.contains('hidden'));
    const bad = await settlers(freshDb(), {}, 'https://infinite-table.test/settlers/?bots=9&interval=1&from=home');
    T('a nonsense launch link starts nothing', bad.w.eval('G === null'));
  }

  /* ================= Deal, launched from home ================= */
  {
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'coastline', 'index.html'), 'utf8');
    T('Deal is called Deal', /<title>Deal — Infinite Table<\/title>/.test(src) && !/>M <span class="wave">DEAL/.test(src) && /title:'Deal'/.test(src));
    T('from home, Deal hides its own menu and keeps only the table', /classList\.add\('fromhome'\)/.test(src) &&
      /\.fromhome #homemain > \.homebtn:not\(#homeprimary\):not\(#rejoinbtn\), \.fromhome #onlinepanel, \.fromhome #profmini\{display:none!important\}/.test(src));
    T('and its way back is the home screen', /bl\.href = '\.\.\/home\/\?game=deal'/.test(src));
    T('Deal wears the equipped table and card back', /Pass\.equipped\('d_felt'\)/.test(src) && /setProperty\('--felt-green', felt\.felt\)/.test(src) && /\.cardback\{background:' \+ back\.css/.test(src) &&
      /shared\/pass\.js/.test(src));
    T('Deal still takes the launch links the lobby sends', ["q.get('solo')", "q.get('host')", "qp.get('join')", "qp.get('invite')"].every(s => src.indexOf(s) >= 0));
  }

  finished = true;
  console.log(fails === 0 ? 'HOMESIM: ALL PASS' : 'HOMESIM FAILURES: ' + fails);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL — homesim threw: ' + (e && e.stack || e)); process.exit(1); });
