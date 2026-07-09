const { JSDOM } = require('jsdom');
const fs = require('fs');
const errors = [];
const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'..','coastline','index.html'),'utf8'), { runScripts:'dangerously', pretendToBeVisual:true, url:'https://localhost/' });
const win = dom.window;
win.addEventListener('error', e => errors.push((e.message||'?')+':'+(e.lineno||'?')));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const T = (n,c)=>console.log((c?'PASS':'FAIL')+' — '+n) || (c?0:process.exitCode=1);

(async ()=>{
  await sleep(1200);
  win.eval('window.__G=G; window.__MODE=MODE;');
  const G = win.__G, MODE = win.__MODE;

  // ---- PAY MODE: human owes AI, picks from own board ----
  const me = G.players[0];
  me.bank = [{id:60001,t:'money',v:2},{id:60002,t:'money',v:3}];
  me.props = {}; me.bldg = {};
  win.addProp(me, {id:60003,t:'prop',color:'brown',name:'x',v:1}, 'brown');
  let paid = false;
  win.requestPayment(0, 4, 1, ()=>{ paid = true; });
  await sleep(100);
  T('pay mode engaged (no sheet)', MODE.type==='pay' && !win.document.querySelector('#overlay.show'));
  // tap two bank notes via their real onclicks
  const notes = [...win.document.querySelectorAll('#mybank .note')];
  T('bank notes are tappable', notes.length===2 && notes[0].getAttribute('onclick'));
  notes[0].click(); notes[1].click();
  await sleep(50);
  T('meter reflects $5M selected', win.document.querySelector('#prompttext').textContent.includes('$5M of $4M'));
  win.hudGo();  // Pay
  await sleep(50);
  T('payment completed via board picks', paid && MODE.type===null && win.bankTotal(G.players[1])>=4);

  // ---- BOARD-PICK SWIPE: POV opens, tap their real card ----
  G.turn = 0; G.playsLeft = 3; G.over = false;
  G.players[1].props = {}; G.players[1].bldg = {}; G.players[1].hand = [];
  win.addProp(G.players[1], {id:60010,t:'prop',color:'sage',name:'tgt',v:2}, 'sage');
  const swipe = {id:60011,t:'action',kind:'swipe',v:3};
  me.hand.push(swipe); win.renderAll();
  win.viewOppSelect(1, 'swipe', swipe);
  await sleep(50);
  T('POV opens for targeting', MODE.type==='povpick' && win.document.querySelector('#pov.show'));
  const pickable = win.document.querySelector('#pov .tcard.pickable');
  T('their card is pickable on their board', !!pickable);
  pickable.click();
  await sleep(1200); // No Deal chain settle (AI has empty hand: none)
  T('swipe executed from board pick', win.countIn(me,'sage')===1 && win.countIn(G.players[1],'sage')===0);
  T('POV closed after pick', MODE.type===null && !win.document.querySelector('#pov.show'));

  // ---- DISCARD MODE: pick from hand ----
  G.turn = 0;
  while(me.hand.length < 9) me.hand.push({id:60100+me.hand.length, t:'money', v:1});
  win.renderAll();
  win.discardPrompt();
  await sleep(50);
  T('discard mode engaged', MODE.type==='discard' && MODE.need===me.hand.length-7);
  const need = MODE.need;
  const ids = me.hand.slice(0,need).map(c=>c.id);
  ids.forEach(id=>win.discardToggle(id));
  T('discard selection counted', MODE.sel.size===need);
  const before = me.hand.length;
  win.hudGo();
  await sleep(800);
  T('discard confirmed from hand picks', me.hand.length===before-need);

  T('zero window errors across all flows', errors.length===0);
  errors.forEach(e=>console.log('  *',e));
  process.exit(process.exitCode||0);
})();
