/* identitysim — the accounts stage.

   Two bugs paid for this file.

   1. Sign-up kept dying against Supabase's built-in SMTP, which allows two
      confirmation mails an hour. The fix is structural rather than careful:
      nothing in the codebase may call an auth method that sends mail. The
      account is minted by the admin API, already confirmed, so there is no
      verification step left to rate-limit. If `signUp` or a magic link ever
      comes back — as a fallback, as a convenience, as a one-line patch — the
      ceiling comes back with it, and this stage fails first.

   2. Every failure looked the same. An Edge Function that had never been
      deployed and a mistyped password both printed "SIGN UP: FAILED", so the
      one thing worth knowing was the one thing the screen would not say.
      The fault map below is pinned cause by cause.

   Accounts are scoped to M Deal for now: the lobby stays guest-first.
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let fails = 0;
const T = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (cond || !detail ? '' : '  [' + detail + ']'));
  if (!cond) fails++;
};

/* ---------- 1. no code path may send an email ---------- */
/* Each of these makes Supabase deliver mail, and each is rate-limited to two
   per hour on the built-in SMTP. None of them belongs in this project. */
const MAILERS = [
  ['auth.signUp(', /\.signUp\s*\(/],
  ['signInWithOtp', /signInWithOtp/],
  ['inviteUserByEmail', /inviteUserByEmail/],
  ['resetPasswordForEmail', /resetPasswordForEmail/],
  ['auth.resend(', /auth\s*\.\s*resend\s*\(/],
  ['generateLink', /generateLink/],
];

/* Comments discuss these calls by name — this file does, at length. Strip them
   first, so the pin fires on a call and not on a sentence about one. */
function codeOf(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');    // line comments, sparing https://
}

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'tests') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|ts|html)$/.test(e.name)) out.push(full);
    }
  };
  walk(ROOT);
  return out;
}

const FILES = sourceFiles();
T('there are source files to scan', FILES.length > 5, String(FILES.length));

MAILERS.forEach(([label, re]) => {
  const hits = FILES.filter(f => re.test(codeOf(fs.readFileSync(f, 'utf8'))))
    .map(f => path.relative(ROOT, f));
  T('nothing calls ' + label + ' — it would mail, and mail is capped at 2/hr', hits.length === 0, hits.join(', '));
});

/* ---------- 2. the Edge Function is the only way an account is minted ---------- */
{
  const fn = path.join(ROOT, 'supabase', 'functions', 'register', 'index.ts');
  T('the register function exists', fs.existsSync(fn));
  // codeOf again: the function's own comments explain email_confirm at length.
  const src = codeOf(fs.existsSync(fn) ? fs.readFileSync(fn, 'utf8') : '');

  T('it mints accounts through the admin API', /admin\.createUser/.test(src));
  T('it pre-confirms them, so no verification mail is ever sent',
    /email_confirm:\s*true/.test(src));
  T('it answers a GET, so the client can tell "not deployed" from "broken"',
    /req\.method\s*===\s*"GET"/.test(src));
  T('it distinguishes a taken username with a 409', /409/.test(src) && /taken/.test(src));
  T('it mints the profile row server-side, where RLS cannot silently refuse',
    /from\("profiles"\)\s*\.insert/.test(src));
  T('it retries friend-code collisions rather than failing the signup',
    /friend_code/.test(src) && /attempt/.test(src));
}

/* ---------- 2b. the SQL path, which installs without a terminal ---------- */
{
  const f = path.join(ROOT, 'supabase', 'accounts.sql');
  T('the SQL account path exists', fs.existsSync(f));
  const sql = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  const code = sql.replace(/^\s*--.*$/gm, '');

  T('it writes the account already confirmed, so nothing is ever mailed',
    /email_confirmed_at/.test(code));
  T('it hashes the password rather than storing it',
    /crypt\s*\(\s*p_password/.test(code) && /gen_salt/.test(code));
  T('it never stores the password in the clear',
    !/encrypted_password[^,]*p_password\s*[,)]/.test(code));
  T('it runs as definer, since anon cannot write auth.users',
    /security\s+definer/.test(code));
  T('and is reachable by anon, because registration precedes sign-in',
    /grant\s+execute[\s\S]{0,120}to\s+anon/.test(code));
  T('it leaves GoTrue string columns non-null',
    /confirmation_token/.test(code) && /recovery_token/.test(code));
  T('it brakes on abuse, being callable by strangers', /throttled/.test(code));
  T('it survives an identity-table shape change rather than losing the account',
    /exception\s+when\s+others/.test(code));
  T('it is safe to run twice', /create\s+or\s+replace\s+function/.test(code));
}

/* ---------- 3. accounts are scoped to M Deal ---------- */
{
  const lobby = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const mdeal = fs.readFileSync(path.join(ROOT, 'coastline', 'index.html'), 'utf8');

  T('M Deal loads the identity module', /shared\/identity\.js/.test(mdeal));
  T('M Deal has somewhere to sign in from', /id="profmini"/.test(mdeal));

  T('the lobby does not load the identity module', !/shared\/identity\.js/.test(lobby));
  T('and calls nothing on it', !/\bID\./.test(lobby));
  T('and carries none of its orphaned chrome',
    !/profmini|lobbystats|invitetoast/.test(lobby));
}

/* ---------- 4. every failure says which failure it was ---------- */
{
  const src = fs.readFileSync(path.join(ROOT, 'shared', 'identity.js'), 'utf8');
  const ctx = vm.createContext({ console, SUPABASE_URL: 'https://x.test', SUPABASE_ANON: 'anon' });
  vm.runInContext(src + '\n;globalThis.__ID = ID;', ctx);
  const ID = ctx.__ID;

  T('the identity module loads', !!ID && typeof ID._authFault === 'function');

  const cases = [
    ['a function that was never deployed', 404, null, /OFFLINE/, /not deployed/],
    ['a rejected anon key', 401, null, /REJECTED/, /JWT|anon key/],
    ['a duplicate username', 409, { err: 'taken' }, /TAKEN/, /already registered/],
    ['a missing service-role key', 500, { err: 'serverconfig' }, /NOT CONFIGURED/, /service-role/],
    ['being rate limited', 429, null, /TOO MANY/, /rate limited/],
    ['no network at all', 0, null, /NO CONNECTION/, /could not reach/],
    ['the abuse brake', 200, { err: 'throttled' }, /TOO MANY SIGNUPS/, /last hour/],
    ['neither backend installed', 404, { err: 'nobackend' }, /NOT INSTALLED/, /accounts\.sql/],
  ];
  const seen = new Set();
  cases.forEach(([name, status, out, banner, why]) => {
    const [msg, reason] = ID._authFault(status, out);
    T(name + ' says so on screen', banner.test(msg), msg);
    T(name + ' says why in the sheet', why.test(reason), reason);
    seen.add(msg);
  });
  T('and no two causes print the same message', seen.size === cases.length,
    seen.size + ' distinct of ' + cases.length);
}

/* ---------- 4b. the bots hold real accounts ---------- */
{
  const idsrc = fs.readFileSync(path.join(ROOT, 'shared', 'identity.js'), 'utf8');
  const sql   = fs.readFileSync(path.join(ROOT, 'supabase', 'accounts.sql'), 'utf8');
  const mdeal = fs.readFileSync(path.join(ROOT, 'coastline', 'index.html'), 'utf8');

  /* The ids exist in exactly two places and must agree. Drift between them
     would not throw — it would quietly rate a stranger, or nobody. */
  const ctx = vm.createContext({ console, SUPABASE_URL: '', SUPABASE_ANON: '' });
  vm.runInContext(idsrc + '\n;globalThis.__ID = ID;', ctx);
  const ID = ctx.__ID;

  const names = Object.keys(ID.BOT_UIDS || {});
  T('the client knows both bots', names.length === 2 && names.indexOf('bazza') >= 0 && names.indexOf('shazza') >= 0, names.join(','));
  names.forEach(n => {
    const uid = ID.BOT_UIDS[n];
    T('the ' + n + ' id is a real uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uid), uid);
    T('and accounts.sql seeds that exact id', sql.indexOf(uid) >= 0, uid);
  });
  T('the two bots do not share an id', new Set(Object.values(ID.BOT_UIDS)).size === 2);
  T('the seed names them the way the client looks them up',
    /"name"\s*:\s*"Bazza"/.test(sql) && /"name"\s*:\s*"Shazza"/.test(sql));
  T('bots get an unguessable password, so nobody signs in as one',
    /gen_random_bytes/.test(sql));
  T('and seeding twice does not duplicate them', (sql.match(/on conflict \(id\) do nothing/g) || []).length >= 2);

  /* Shaz is Shazza now, everywhere she is seated. */
  T('Shazza is the solo opponent', /name:'Shazza'/.test(mdeal));
  T('and is in the online bot pool', /botNames:\s*\[[^\]]*'Shazza'/.test(mdeal));
  T('no seat still says Shaz', !/'Shaz'/.test(mdeal), (/.{0,30}'Shaz'.{0,30}/.exec(mdeal) || [''])[0]);
  T('Bazza is still seated', /name:'Bazza'/.test(mdeal) && /botNames:\s*\[\s*'Bazza'/.test(mdeal));

  /* Solo results must reach the ladder — the old call sites refused unless hosting. */
  T('the win path records without requiring a host', /if\(typeof ID!=='undefined'\) ID\.recordMatch\(G\.players\.indexOf\(p\)\)/.test(mdeal));
  T('the last-standing path too', /if\(typeof ID!=='undefined'\) ID\.recordMatch\(alive\[0\]\)/.test(mdeal));

  /* seatUids is the only thing that turns a table into a list of accounts. */
  function seats(ctxExtra) {
    const c = vm.createContext(Object.assign({ console, SUPABASE_URL: '', SUPABASE_ANON: '' }, ctxExtra));
    vm.runInContext(idsrc + '\n;globalThis.__ID = ID;', c);
    return c.__ID;
  }
  const BZ = ID.BOT_UIDS.bazza, SZ = ID.BOT_UIDS.shazza, ME = 'aaaaaaaa-0000-4000-8000-000000000009';

  {   // solo: no roster at all
    const i2 = seats({ MYSEAT: 0, G: { players: [{ name: 'You' }, { name: 'Bazza', isAI: true }, { name: 'Shazza', isAI: true }] } });
    i2.user = { id: ME };
    const got = i2.seatUids();
    T('solo resolves me and both bots by seat', JSON.stringify(got) === JSON.stringify([ME, BZ, SZ]), JSON.stringify(got));
  }
  {   // online: roster carries uids for humans, names for bots
    const i2 = seats({ NET: { roster: [{ uid: ME }, { name: 'Bazza', isAI: true }, { uid: 'bbbbbbbb-0000-4000-8000-000000000009' }] } });
    i2.user = { id: ME };
    const got = i2.seatUids();
    T('online resolves a bot sitting between two humans', got[1] === BZ && got[0] === ME, JSON.stringify(got));
  }
  {   // an unseeded bot has no account and must not be invented
    const i2 = seats({ MYSEAT: 0, G: { players: [{ name: 'You' }, { name: 'Davo', isAI: true }] } });
    i2.user = { id: ME };
    T('a bot without an account resolves to nothing', i2.seatUids()[1] === null);
  }
}

/* ---------- 5. registration routes correctly and never falls back to mail ---------- */
{
  const src = fs.readFileSync(path.join(ROOT, 'shared', 'identity.js'), 'utf8');

  /* One rig, driven by what the two backends are pretending to be. */
  function rig({ rpc, edge }) {
    const state = { banners: [], fetched: 0, rpcCalls: [], signUpCalled: false, signedInWith: null };
    const fields = { '#acctuser': { value: 'josh' }, '#acctpass': { value: 'hunter2' } };
    const sb = {
      rpc: (name, args) => { state.rpcCalls.push([name, args]); return Promise.resolve(rpc); },
      auth: {
        signUp: () => { state.signUpCalled = true; return Promise.resolve({ error: null, data: {} }); },
        signInWithPassword: (a) => {
          state.signedInWith = a;
          return Promise.resolve({ data: { session: null }, error: { message: 'stop here' } });
        },
      },
    };
    const ctx = vm.createContext({
      console: { error() {}, log() {} },
      SUPABASE_URL: 'https://x.test', SUPABASE_ANON: 'anon',
      $: (q) => fields[q],
      banner: (t) => state.banners.push(t),
      fetch: () => { state.fetched++; return edge(); },
    });
    vm.runInContext(src + '\n;globalThis.__ID = ID;', ctx);
    const ID = ctx.__ID;
    ID.ensureSB = async () => sb;
    ID.renderProfile = () => {};
    ID.renderProfileSheet = () => {};
    state.ID = ID;
    return state;
  }

  const MISSING = { error: { code: 'PGRST202', message: 'Could not find the function public.create_account' } };
  const E404 = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('html')) });
  const E200 = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, username: 'josh' }) });

  return (async () => {
    /* a. SQL installed: it answers, and the Edge Function is never needed */
    {
      const r = rig({ rpc: { data: { ok: true, username: 'josh' }, error: null }, edge: E404 });
      await r.ID._register();
      T('the SQL function is tried first', r.rpcCalls.length === 1 && r.rpcCalls[0][0] === 'create_account');
      T('and it is passed the sanitised username and password',
        r.rpcCalls[0][1] && r.rpcCalls[0][1].p_username === 'josh' && r.rpcCalls[0][1].p_password === 'hunter2');
      T('with SQL installed the Edge Function is never called', r.fetched === 0, String(r.fetched));
      T('and the new account signs in as username@coastline.game',
        r.signedInWith && r.signedInWith.email === 'josh@coastline.game');
      T('no mailing call on the SQL happy path', r.signUpCalled === false);
    }

    /* b. SQL absent, Edge Function present: fall through cleanly */
    {
      const r = rig({ rpc: MISSING, edge: E200 });
      await r.ID._register();
      T('a missing SQL function falls through to the Edge Function', r.fetched === 1, String(r.fetched));
      T('and the account still signs in',
        r.signedInWith && r.signedInWith.email === 'josh@coastline.game');
      T('no mailing call on the Edge fallback', r.signUpCalled === false);
    }

    /* c. neither installed: say which one to install */
    {
      const r = rig({ rpc: MISSING, edge: E404 });
      await r.ID._register();
      T('with neither backend installed it says so', /NOT INSTALLED/.test(r.banners.join('|')), r.banners.join('|'));
      T('and points at the file that fixes it',
        /accounts\.sql/.test(r.ID.lastError || ''), r.ID.lastError);
      T('and does not quietly fall back to a mailing signup', r.signUpCalled === false);
      T('and never reaches the sign-in call', r.signedInWith === null);
    }

    /* d. SQL answers with a refusal: report it, do not retry against the Edge */
    {
      const r = rig({ rpc: { data: { ok: false, err: 'taken' }, error: null }, edge: E200 });
      await r.ID._register();
      T('a username taken in SQL is reported as taken', /TAKEN/.test(r.banners.join('|')), r.banners.join('|'));
      T('and a refusal is not retried against the other backend', r.fetched === 0, String(r.fetched));
    }

    /* e. the abuse brake reaches the screen */
    {
      const r = rig({ rpc: { data: { ok: false, err: 'throttled' }, error: null }, edge: E200 });
      await r.ID._register();
      T('the SQL abuse brake reaches the screen', /TOO MANY SIGNUPS/.test(r.banners.join('|')), r.banners.join('|'));
    }

    /* ---------- 6. what actually reaches the ladder ---------- */
    {
      const idsrc = fs.readFileSync(path.join(ROOT, 'shared', 'identity.js'), 'utf8');
      const ME = 'aaaaaaaa-0000-4000-8000-000000000009';

      function table(extra) {
        const calls = [];
        const sb = {
          rpc: (n, a) => { calls.push([n, a]); return Promise.resolve({ data: null, error: null }); },
          from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
        };
        const c = vm.createContext(Object.assign({ console: { error() {}, log() {} }, SUPABASE_URL: '', SUPABASE_ANON: '' }, extra));
        vm.runInContext(idsrc + '\n;globalThis.__ID = ID;', c);
        const I = c.__ID;
        I.sb = sb; I.renderProfile = () => {};
        return { I, calls };
      }
      const solo3 = { MYSEAT: 0, G: { turnCount: 11, players: [{ name: 'You' }, { name: 'Bazza', isAI: true }, { name: 'Shazza', isAI: true }] } };
      const BZ = 'ba22a000-0000-4000-8000-000000000001', SZ = '5a22a000-0000-4000-8000-000000000002';

      {
        const t = table(solo3); t.I.user = { id: ME };
        await t.I.recordMatch(0);
        T('a solo win reaches the ladder', t.calls.length === 1 && t.calls[0][0] === 'record_match');
        T('and carries all three accounts, me first',
          JSON.stringify(t.calls[0][1].p_players) === JSON.stringify([ME, BZ, SZ]), JSON.stringify(t.calls[0][1] && t.calls[0][1].p_players));
        T('and names me the winner', t.calls[0][1].p_winner === ME);
      }
      {
        const t = table(solo3); t.I.user = { id: ME };
        await t.I.recordMatch(1);
        T('a bot win is recorded against the bot', t.calls.length === 1 && t.calls[0][1].p_winner === BZ);
      }
      {
        const t = table(solo3); t.I.user = null;
        await t.I.recordMatch(0);
        T('a guest stays unrated', t.calls.length === 0);
      }
      {
        const t = table({ MYSEAT: 0, NET: { mode: 'client', roster: [{ uid: ME }, { name: 'Bazza', isAI: true }] }, G: { turnCount: 4, players: [] } });
        t.I.user = { id: ME };
        await t.I.recordMatch(0);
        T('a client does not record — the host does', t.calls.length === 0);
      }
      {
        const t = table({ MYSEAT: 0, G: { turnCount: 4, players: [{ name: 'You' }, { name: 'Davo', isAI: true }] } });
        t.I.user = { id: ME };
        await t.I.recordMatch(0);
        T('a table of one real account does not record', t.calls.length === 0);
      }
      {
        const five = [{ uid: ME }, { name: 'Bazza', isAI: true }, { name: 'Shazza', isAI: true },
                      { uid: 'bbbbbbbb-0000-4000-8000-000000000001' }, { uid: 'cccccccc-0000-4000-8000-000000000002' }];
        const t = table({ MYSEAT: 0, NET: { mode: 'host', roster: five }, G: { turnCount: 9, players: [] } });
        t.I.user = { id: ME };
        await t.I.recordMatch(0);
        T('a five-seat table stays off the ladder rather than throwing', t.calls.length === 0);
      }
      {
        /* A guest hosting for signed-in mates: two real accounts are on the
           table and neither is mine. Without the guest guard this reaches
           this.user.id on a null and survives only by being caught. */
        const t = table({ MYSEAT: 0, NET: { mode: 'host', roster: [{ uid: null }, { uid: 'eeeeeeee-0000-4000-8000-000000000004' }, { uid: 'ffffffff-0000-4000-8000-000000000005' }] }, G: { turnCount: 9, players: [] } });
        t.I.user = null;
        await t.I.recordMatch(1);
        T('a guest host does not record a game between other people', t.calls.length === 0);
      }
      {
        const t = table({ MYSEAT: 0, NET: { mode: 'host', roster: [{ uid: 'dddddddd-0000-4000-8000-000000000003' }, { name: 'Bazza', isAI: true }] }, G: { turnCount: 9, players: [] } });
        t.I.user = { id: ME };
        await t.I.recordMatch(0);
        T('a game I am not seated in is not recorded', t.calls.length === 0);
      }
    }

    /* ---------- 7. the rating the end-of-game screen shows ---------- */
    {
      const idsrc = fs.readFileSync(path.join(ROOT, 'shared', 'identity.js'), 'utf8');
      const ME = 'aaaaaaaa-0000-4000-8000-000000000009';
      const solo3 = () => ({ MYSEAT: 0, G: { turnCount: 11, players: [{ name: 'You' }, { name: 'Bazza', isAI: true }, { name: 'Shazza', isAI: true }] } });

      /* elos: the sequence the profile row reports on each successive read. */
      function ratingRig(extra, elos, startElo) {
        const st = { rpc: 0, reads: 0, lookups: 0 };
        const sb = {
          rpc: () => { st.rpc++; return Promise.resolve({ data: null, error: null }); },
          from: () => ({ select: () => ({
            eq: () => ({ maybeSingle: () => {
              const e = elos[Math.min(st.reads++, elos.length - 1)];
              return Promise.resolve({ data: { id: ME, name: 'Josh', elo: e, games: 1, wins: 1 } });
            } }),
            in: (col, ids) => { st.lookups++; return Promise.resolve({ data: ids.filter(id => !(extra.__noProfile || []).includes(id)).map(id => ({ id })) }); },
          }) }),
        };
        const c = vm.createContext(Object.assign({
          console: { error() {}, log() {} }, SUPABASE_URL: '', SUPABASE_ANON: '',
          setTimeout: (fn) => { fn(); return 0; },
        }, extra));
        vm.runInContext(idsrc + '\n;globalThis.__ID = ID;', c);
        const I = c.__ID;
        I.sb = sb; I.user = { id: ME }; I.profile = { id: ME, elo: startElo, friend_code: 'ABC123' };
        I.renderProfile = () => {};
        return { I, st };
      }

      {   // solo win: we write, then read what landed
        const r = ratingRig(solo3(), [1031], 1000);
        const out = await r.I.settleRating(0);
        T('a rated solo win reports the change', out.rated === true && out.delta === 31, JSON.stringify(out));
        T('and knows I won', out.won === true);
        T('and wrote the result exactly once', r.st.rpc === 1, String(r.st.rpc));
        T('and shows the figure the database returned, not a guess',
          out.before === 1000 && out.after === 1031);
      }
      {   // a loss reads back as a loss
        const r = ratingRig(solo3(), [982], 1000);
        const out = await r.I.settleRating(1);
        T('a loss reports a negative change', out.delta === -18 && out.won === false, JSON.stringify(out));
      }
      {   // a client writes nothing and waits for the host's write to land
        const r = ratingRig({ MYSEAT: 0, NET: { mode: 'client', roster: [{ uid: ME }, { name: 'Bazza', isAI: true }] }, G: { turnCount: 4, players: [] } }, [1000, 1000, 1017], 1000);
        const out = await r.I.settleRating(0);
        T('a client records nothing', r.st.rpc === 0);
        T('but still reports its change, once the host write lands',
          out.rated === true && out.delta === 17, JSON.stringify(out));
        T('and it took more than one read to see it', r.st.reads >= 3, String(r.st.reads));
      }
      {   // the host never wrote: give up rather than poll forever
        const r = ratingRig({ MYSEAT: 0, NET: { mode: 'client', roster: [{ uid: ME }, { name: 'Bazza', isAI: true }] }, G: { turnCount: 4, players: [] } }, [1000], 1000);
        const out = await r.I.settleRating(0);
        T('an unmoved rating settles at zero rather than hanging', out.delta === 0);
        T('and the polling is bounded', r.st.reads <= 12, String(r.st.reads));
      }
      {   // the exact bug: bots seated in the client, absent from the database
        const cfg = solo3();
        cfg.__noProfile = ['ba22a000-0000-4000-8000-000000000001', '5a22a000-0000-4000-8000-000000000002'];
        const r = ratingRig(cfg, [1000], 1000);
        const out = await r.I.settleRating(0);
        T('a win that moved nothing is not reported as rated',
          out.rated === false && out.why === 'noaccounts', JSON.stringify(out));
        T('and it names the players that have no rows',
          JSON.stringify(out.names) === '["Bazza","Shazza"]', JSON.stringify(out.names));
        T('and still records that I won', out.won === true);
        T('the match was still submitted — the game counted', r.st.rpc === 1);
      }
      {   // a genuine zero on a fully seeded table is not misreported
        const r = ratingRig(solo3(), [1000], 1000);
        const out = await r.I.settleRating(0);
        T('a zero change with every account present stays rated',
          out.rated === true && out.delta === 0, JSON.stringify(out));
        T('and the lookup only runs when something looks wrong', r.st.lookups === 1, String(r.st.lookups));
      }
      {   // the happy path must not pay for the diagnosis
        const r = ratingRig(solo3(), [1031], 1000);
        await r.I.settleRating(0);
        T('a normal win never runs the diagnostic query', r.st.lookups === 0, String(r.st.lookups));
      }
      {   // a guest has nothing to report
        const r = ratingRig(solo3(), [1000], 1000); r.I.user = null;
        const out = await r.I.settleRating(0);
        T('a guest is told it was unrated', out.rated === false && out.why === 'guest', JSON.stringify(out));
        T('and nothing was written for them', r.st.rpc === 0);
      }
      {   // five at the table is over the ladder cap
        const five = [{ uid: ME }, { name: 'Bazza', isAI: true }, { name: 'Shazza', isAI: true },
                      { uid: 'bbbbbbbb-0000-4000-8000-000000000001' }, { uid: 'cccccccc-0000-4000-8000-000000000002' }];
        const r = ratingRig({ MYSEAT: 0, NET: { mode: 'host', roster: five }, G: { turnCount: 9, players: [] } }, [1000], 1000);
        const out = await r.I.settleRating(0);
        T('a five-seat table says why it did not count', out.rated === false && out.why === 'toobig', JSON.stringify(out));
      }
      {   // watching someone else's game
        const r = ratingRig({ MYSEAT: 0, NET: { mode: 'host', roster: [{ uid: 'dddddddd-0000-4000-8000-000000000003' }, { name: 'Bazza', isAI: true }] }, G: { turnCount: 9, players: [] } }, [1000], 1000);
        const out = await r.I.settleRating(0);
        T('a game I am not seated in says so', out.rated === false && out.why === 'watching', JSON.stringify(out));
      }
    }

    /* ---------- 8. the screen that shows it ---------- */
    {
      const mdeal = fs.readFileSync(path.join(ROOT, 'coastline', 'index.html'), 'utf8');
      T('the rating screen exists', /id="eloscreen"/.test(mdeal));
      T('with a number, a delta and a verdict',
        /id="elonum"/.test(mdeal) && /id="elodelta"/.test(mdeal) && /id="eloverdict"/.test(mdeal));
      T('it can be dismissed', /function closeElo\(/.test(mdeal) && /id="eloclose"/.test(mdeal));
      T('guests never see it', /if\(typeof ID === 'undefined' \|\| !ID\.user \|\| ELOSHOWN\) return;/.test(mdeal));
      T('it fires once per game, not once per page', /ELOSHOWN = true/.test(mdeal) && (mdeal.match(/ELOSHOWN = false/g) || []).length >= 2);

      /* all three endings, or the screen is missing exactly where it matters */
      const hooks = (mdeal.match(/showElo\(/g) || []).length;
      T('every ending reaches it — local win, client win, last standing', hooks >= 4, 'showElo references: ' + hooks);
      T('the local win passes the winning seat', /showElo\(G\.players\.indexOf\(p\)\)/.test(mdeal));
      T('the client win passes the winning seat', /showElo\(G\.players\.indexOf\(w\)\)/.test(mdeal));
      T('the last-standing ending passes the survivor', /showElo\(alive\[0\]\)/.test(mdeal));

      T('the number is counted across rather than snapped', /requestAnimationFrame\(tick\)/.test(mdeal));
      T('an unmoved rating names the file that fixes it', /accounts\.sql/.test(mdeal) && /noaccounts/.test(mdeal));
      T('and does not call a win unrated just because nothing moved',
        /\(r && r\.won\) \? 'You win' : 'Unrated'/.test(mdeal));
      T('the client does no Elo arithmetic of its own',
        !/32\s*\*\s*\(1\s*-/.test(mdeal) && !/eloDelta\(/.test(mdeal));
    }

    console.log(fails ? 'IDENTITY: ' + fails + ' FAILED' : 'IDENTITY: ALL PASS');
    process.exitCode = fails ? 1 : 0;
  })();
}
