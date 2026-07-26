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

/* ---------- 5. a failed registration reports, and does not fall back to mail ---------- */
{
  const src = fs.readFileSync(path.join(ROOT, 'shared', 'identity.js'), 'utf8');
  const banners = [];
  const fields = { '#acctuser': { value: 'josh' }, '#acctpass': { value: 'hunter2' } };
  let signUpCalled = false, signedInWith = null;

  const sb = {
    auth: {
      signUp: () => { signUpCalled = true; return Promise.resolve({ error: null, data: {} }); },
      signInWithPassword: (a) => { signedInWith = a; return Promise.resolve({ data: { session: null }, error: { message: 'x' } }); },
    },
  };

  const ctx = vm.createContext({
    console: { error() {}, log() {} },
    SUPABASE_URL: 'https://x.test',
    SUPABASE_ANON: 'anon',
    $: (q) => fields[q],
    banner: (t) => banners.push(t),
    fetch: () => Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('html')) }),
  });
  vm.runInContext(src + '\n;globalThis.__ID = ID;', ctx);
  const ID = ctx.__ID;
  ID.ensureSB = async () => sb;
  ID.renderProfile = () => {};
  ID.renderProfileSheet = () => {};

  return (async () => {
    await ID._register();

    T('a 404 from the register function is reported as offline, not as a bad password',
      /OFFLINE/.test(banners.join('|')), banners.join('|'));
    T('and the reason is kept for the profile sheet',
      /not deployed/.test(ID.lastError || ''), ID.lastError);
    T('and it does not quietly fall back to a mailing signup', signUpCalled === false);
    T('and it never reached the sign-in call', signedInWith === null);

    /* the happy path addresses the account by its synthetic, never-delivered address */
    banners.length = 0;
    ctx.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, username: 'josh' }) });
    await ID._register();
    T('a created account signs in as username@coastline.game',
      signedInWith && signedInWith.email === 'josh@coastline.game',
      signedInWith && signedInWith.email);
    T('still no mailing call on the happy path', signUpCalled === false);

    console.log(fails ? 'IDENTITY: ' + fails + ' FAILED' : 'IDENTITY: ALL PASS');
    process.exitCode = fails ? 1 : 0;
  })();
}
