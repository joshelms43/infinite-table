/* render-settlers — sighted proof for Settlers. Drives the real page in
   headless Chrome at phone size and writes PNGs of the draft, the live board
   and HUD, a build mode, the trade sheet, the discard picker, zoom, and the
   victory screen. The game is fast-forwarded through the page's own engine
   and bots (a bot plays your seat), so every frame is a real state.

   Setup (not a repo dependency):  npm i --prefix /tmp/pp puppeteer-core
   Usage:  RENDER_OUT=/tmp/shots node tools/render-settlers.js [seed]
*/
const path = require('path');
const fs = require('fs');
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/tmp/pp/node_modules/puppeteer-core'); }

const OUT = process.env.RENDER_OUT || '/mnt/user-data/outputs';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const PAGE = 'file://' + path.join(__dirname, '..', 'settlers', 'index.html');
const W = +(process.env.W || 390), H = +(process.env.H || 844);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.evaluate(() => { localStorage.setItem('it_name', 'Josh'); });
  await page.reload();
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, 'settlers-' + name + '.png') }); console.log('wrote', name); };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await shot('menu');
  await page.click('#practicebtn'); await wait(300);
  await page.evaluate(() => { document.querySelector('.sb[data-n="3"]').click(); document.querySelector('.si[data-ms="30000"]').click(); });
  await wait(250);
  await shot('practice');
  await page.evaluate(() => { document.querySelector('.si[data-ms="custom"]').click(); const c = document.getElementById('customin'); c.value = '45'; c.dispatchEvent(new Event('input')); c.blur(); });
  await wait(250);
  await shot('practice-custom');
  await page.evaluate(() => document.querySelector('.si[data-ms="30000"]').click());
  await page.evaluate(() => document.getElementById('gobtn').click());
  await wait(900);
  await shot('draft');
  /* wait for your own pick in the draft, and show the corners you may take */
  await page.evaluate(() => { for (let i = 0; i < 400 && Settlers.setupSeat(G) !== 0; i++) { GAMEMS += 250; tickLogic(); } });
  await wait(700);
  await shot('draft-mine');

  /* fast-forward: the clock and the bots, with a bot in your seat too */
  const ff = (ms, untilFn) => page.evaluate((ms, until) => {
    const stop = until ? new Function('return ' + until) : null;
    for (let t = 0; t < ms; t += 250) {
      GAMEMS += 250;
      tickLogic();
      if (G.over) break;
      const mv = Settlers.botMove(G, 0, 'expander');
      if (mv && (G.phase !== 'play' || Math.random() < 0.08)) sendMove(mv);
      if (stop && stop()) break;
    }
  }, ms, untilFn || null);
  await ff(60000, 'G.phase === "play"');
  await wait(1500);
  await shot('go');
  await ff(30000 * 9);
  /* land on a roll so the dice and flyers are in the frame */
  await page.evaluate(() => { G.nextRollAt = GAMEMS + 250; });
  await ff(260);
  await wait(500);
  await shot('roll');
  await wait(1200);
  await shot('board');

  /* build mode: give yourself a road and show the targets */
  await page.evaluate(() => {
    const p = G.players[0];
    ['timber', 'clay', 'wool', 'grain', 'ore'].forEach(r => { if (G.bank[r] >= 2) { G.bank[r] -= 2; p.hand[r] += 2; } });
    if (G.phase !== 'play') { G.phase = 'play'; G.discard = null; G.robberBy = -1; }
    renderAll();
    document.querySelector('.act[data-k="road"]').click();
  });
  await wait(400);
  await shot('build-road');
  await page.evaluate(() => { setMode('none'); document.querySelector('.act[data-k="settle"]').click(); });
  await wait(400);
  await shot('build-settle');
  await page.evaluate(() => { setMode('none'); renderAll(); document.querySelector('.act[data-k="trade"]').click(); });
  await wait(400);
  await shot('trade-bank');
  await page.evaluate(() => { document.querySelector('.tabs button[data-tab="table"]').click(); });
  await page.evaluate(() => { document.querySelectorAll('.pm button[data-bag="og"][data-d="1"]')[0].click(); document.querySelectorAll('.pm button[data-bag="ow"][data-d="1"]')[4].click(); });
  await wait(250);
  await shot('trade-table');
  await page.evaluate(() => closeSheet());

  /* an incoming offer toast */
  await page.evaluate(() => {
    const s = 1, p = G.players[s];
    p.hand.wool += 2; G.bank.wool -= 2;
    const r = Settlers.act(G, s, { t: 'offer', give: { wool: 2 }, get: { ore: 1 } }, GAMEMS);
    afterState(r.evts);
    /* a second offer waiting behind it, for the +1 */
    const q = G.players[2]; q.hand.timber += 1; G.bank.timber -= 1;
    const r2 = Settlers.act(G, 2, { t: 'offer', give: { timber: 1 }, get: { grain: 1 } }, GAMEMS);
    afterState(r2.evts);
  });
  await wait(400);
  await shot('offer');

  /* the discard picker on a real 7 */
  await page.evaluate(() => {
    const p = G.players[0];
    ['timber', 'clay', 'wool', 'grain', 'ore'].forEach(r => { const n = Math.min(3, G.bank[r]); G.bank[r] -= n; p.hand[r] += n; });
    G.phase = 'discard';
    G.discard = { need: { 0: Math.floor(Settlers.handSize(p.hand) / 2) }, deadline: GAMEMS + 15000 };
    openDiscard(G.discard.need[0], G.discard.deadline);
    document.querySelectorAll('.pk.dk')[4].click();
    document.querySelectorAll('.pk.dk')[4].click();
  });
  await wait(600);
  await shot('discard');
  await page.evaluate(() => {
    const r = Settlers.act(G, -1, { t: 'clock', now: G.discard.deadline }, G.discard.deadline);
    GAMEMS = G.discard ? GAMEMS : G.now;
    afterState(r.evts);
    if (G.phase === 'robber' && G.robberBy !== 0) { G.robberBy = 0; setMode('robber'); renderAll(); }
  });
  await wait(500);
  await shot('robber');
  await page.evaluate(() => { if (G.phase === 'robber') { const ch = Settlers.robberPick(G, 0); sendMove({ t: 'robber', hex: ch.hex, victim: ch.victim }); } });
  await wait(900);

  /* zoomed */
  await page.evaluate(() => { CAM.zoom = 2; clampPan(); ZOOM_SETTLE = performance.now() - 1000; });
  await wait(400);
  await shot('zoom');
  await page.evaluate(() => { CAM.zoom = 1; clampPan(); ZOOM_SETTLE = performance.now() - 1000; });

  /* to the end */
  await page.evaluate(() => { GAMEMS = Math.max(GAMEMS, G.now); });
  await ff(30000 * 400, 'G.over');
  await wait(2600);
  await shot('victory');

  /* frame budget: time 120 frames of the real loop */
  const perf = await page.evaluate(() => new Promise(res => {
    const ts = []; let n = 0;
    function f(t) { ts.push(t); if (++n < 120) requestAnimationFrame(f); else res(ts); }
    requestAnimationFrame(f);
  }));
  const gaps = perf.slice(1).map((t, i) => t - perf[i]).sort((a, b) => a - b);
  console.log('frame gap median ' + gaps[gaps.length >> 1].toFixed(1) + 'ms, p95 ' + gaps[Math.floor(gaps.length * 0.95)].toFixed(1) + 'ms');
  console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
