/* render-home — sighted proof for the home screen. Drives the real page in
   headless Chrome at phone size with a signed-in sample account (no network:
   the account layer is filled in by hand) and writes PNGs of every tab, the
   sign-in sheet and a guest's view; then Settlers wearing pass cosmetics.

   Setup (not a repo dependency):  npm i --prefix /tmp/pp puppeteer-core
   Usage:  RENDER_OUT=/tmp/shots node tools/render-home.js
*/
const path = require('path');
const fs = require('fs');
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/tmp/pp/node_modules/puppeteer-core'); }
const OUT = process.env.RENDER_OUT || '/mnt/user-data/outputs';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ROOT = path.join(__dirname, '..');
const W = +(process.env.W || 390), H = +(process.env.H || 844);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  /* no backend here: the page boots as a guest and the sample account is set by hand */
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (/shared\/config\.js/.test(r.url())) return r.respond({ contentType: 'application/javascript', body: "const SUPABASE_URL='', SUPABASE_ANON='';" });
    if (/^https?:/.test(r.url()) && !/fonts\.g/.test(r.url())) return r.abort();
    r.continue();
  });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shot = async (name, full) => { await page.screenshot({ path: path.join(OUT, 'home-' + name + '.png'), fullPage: !!full }); console.log('wrote', name); };
  await page.goto('file://' + path.join(ROOT, 'home', 'index.html'));
  await wait(500);
  await shot('guest');
  await page.evaluate(() => {
    ID.user = { id: 'me', email: 'josh@coastline.game' };
    ID.profile = { id: 'me', name: 'Josh', elo: 1240, games: 31, wins: 17, friend_code: 'K7Q2MX' };
    ID.friends = [{ id: 'f1', name: 'Sam', elo: 1180 }, { id: 'f2', name: 'Kat', elo: 1090 }, { id: 'f3', name: 'Mia', elo: 1010 }];
    H.ratings = { me: { deal: { elo: 1240, games: 31, wins: 17 }, settlers: { elo: 1105, games: 14, wins: 6 } },
      f1: { deal: { elo: 1180 }, settlers: { elo: 1166 } }, f2: { deal: { elo: 1090 }, settlers: { elo: 1012 } }, f3: { deal: { elo: 1010 }, settlers: { elo: 987 } } };
    H.progress = { '2026-12': 1260 };
    H.loadouts = { f1: { avatar: '2026-12:10' }, f2: { avatar: '2026-12:1', frame: '2026-12:7' } };
    H.loadout = {}; H.loaded = true;
    localStorage.setItem('it_room', JSON.stringify({ code: '7KQ2', ts: Date.now() }));
    render();
  });
  await wait(300);
  await shot('home');
  await page.evaluate(() => { H.loadout = { avatar: '2026-12:1', frame: '2026-12:7', title: '2026-12:4', s_color: '2026-12:5' }; render(); });
  await wait(200);
  await shot('home-equipped');
  await page.evaluate(() => { tab('play'); });
  await wait(200); await shot('play-settlers');
  await page.evaluate(() => { H.customOn = true; H.bots = 3; render(); });
  await wait(200); await shot('play-settlers-custom');
  await page.evaluate(() => { H.game = 'deal'; H.mode = 'bots'; render(); });
  await wait(200); await shot('play-deal');
  await page.evaluate(() => { H.mode = 'friends'; render(); });
  await wait(200); await shot('play-deal-friends');
  await page.evaluate(() => { H.game = 'settlers'; H.mode = 'bots'; H.customOn = false; tab('friends'); });
  await wait(200); await shot('friends');
  await page.evaluate(() => { tab('profile'); });
  await wait(300); await shot('profile', true);
  for (const [i, y] of [[2, 900], [3, 1900]]) { await page.evaluate(y => { document.getElementById('view').scrollTop = y; }, y); await wait(200); await shot('profile-' + i); }
  await page.evaluate(() => { H.tab = 'home'; ID.user = null; ID.profile = null; render(); openAuth(); });
  await wait(400); await shot('signin');

  /* Settlers, launched from the home screen and wearing the pass */
  await page.evaluate(() => { localStorage.setItem('it_loadout', JSON.stringify({ s_color: '2026-12:5', s_dice: '2026-12:19', s_island: '2026-12:30', s_robber: '2026-12:8' })); localStorage.setItem('it_name', 'Josh'); });
  await page.goto('file://' + path.join(ROOT, 'settlers', 'index.html') + '?bots=3&interval=30000&from=home');
  await wait(700);
  await page.evaluate(() => {
    for (let t = 0; t < 400000 && G.rollN < 6; t += 250) { GAMEMS += 250; tickLogic(); const mv = Settlers.botMove(G, 0, 'expander'); if (mv && (G.phase !== 'play' || Math.random() < 0.08)) sendMove(mv); }
  });
  await wait(1800);
  await shot('settlers-tropics');
  await page.evaluate(() => { localStorage.setItem('it_loadout', JSON.stringify({ s_color: '2026-12:14', s_dice: '2026-12:2', s_island: '2026-12:15', s_robber: '2026-12:20' })); });
  await page.reload(); await wait(700);
  await page.evaluate(() => {
    for (let t = 0; t < 400000 && G.rollN < 6; t += 250) { GAMEMS += 250; tickLogic(); const mv = Settlers.botMove(G, 0, 'expander'); if (mv && (G.phase !== 'play' || Math.random() < 0.08)) sendMove(mv); }
  });
  await wait(1800);
  await shot('settlers-dusk');
  console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
