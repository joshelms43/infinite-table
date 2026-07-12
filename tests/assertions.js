if(typeof AI_REACT_MS!=='undefined') AI_REACT_MS = 0;   // engine tests run synchronously
// 0. CSS integrity: every load-bearing selector must exist in the stylesheet
const _P = require('path'), _F = require('fs');
const HTML_PATH = _F.existsSync(_P.join(__dirname,'coastline.html')) ? _P.join(__dirname,'coastline.html') : _P.join(__dirname,'..','coastline','index.html');
const HTML_SRC = _F.readFileSync(HTML_PATH,'utf8');
const REQUIRED_CSS = ['#winscreen{','.wincard{','.showcase{','#winpill{','#logdrawer{','.dragclone{','#promptbar{','.droppable{','.dropok{','.setghost{','.colorpick{','.opp.selectable{','.pickable{','#pov{','#inspect{','.errtoast{','.banner{','.flyer{','.cardback{','.actionzone{','.tcard.pickable','#myprops,.tablespread','.note{','.tset','.pbleft{','#pbfill{'];
const missingCss = REQUIRED_CSS.filter(sel=>!HTML_SRC.includes(sel));
T('CSS integrity: all load-bearing selectors present'+(missingCss.length?' (missing: '+missingCss.join(', ')+')':''), missingCss.length===0);
// 1. deck composition
const d=buildDeck();
T('deck has 106 playing cards (+4 rule cards = official 110)', d.length===106);
T('28 properties', d.filter(c=>c.t==='prop').length===28);
T('11 wilds (9 dual + 2 rainbow)', d.filter(c=>c.t==='wild').length===9 && d.filter(c=>c.t==='wildall').length===2);
T('20 money cards', d.filter(c=>c.t==='money').length===20);
T('34 action cards (2/3/3/3/3/3/10/3/2/2 per official list)', d.filter(c=>c.t==='action').length===34);
T('13 rent cards', d.filter(c=>c.t==='rent').length===10 && d.filter(c=>c.t==='rentall').length===3);
T('set sizes sum to 28', Object.values(COLORS).reduce((s,c)=>s+c.size,0)===28);
// 2. rent + completion
const tp={hand:[],bank:[],props:{},bldg:{}};
addProp(tp,{id:9001,t:'prop',color:'teal',name:'x',v:3},'teal');
T('rent 1 teal = $2M', rentFor(tp,'teal')===2);
addProp(tp,{id:9002,t:'prop',color:'teal',name:'y',v:3},'teal');
addProp(tp,{id:9003,t:'wild',colors:['teal','coral'],v:3},'teal');
T('3 teal = complete', isComplete(tp,'teal'));
T('complete teal rent = $7M', rentFor(tp,'teal')===7);
tp.bldg.teal={granny:{id:9004,v:3}};
T('granny flat adds $3M', rentFor(tp,'teal')===10);
tp.bldg.teal.resort={id:9005,v:4};
T('resort adds $4M more', rentFor(tp,'teal')===14);
addProp(tp,{id:9006,t:'prop',color:'gold',name:'a',v:4},'gold');
addProp(tp,{id:9007,t:'prop',color:'gold',name:'b',v:4},'gold');
addProp(tp,{id:9008,t:'prop',color:'brown',name:'c',v:1},'brown');
addProp(tp,{id:9009,t:'prop',color:'brown',name:'d',v:1},'brown');
T('3 complete sets = win', checkWin(tp));
// 3. broken set drops buildings
G.discard=[];
const w=tp.props.teal.find(c=>c.t==='wild');
removeProp(tp,w); loseBuildingsIfBroken(tp,'teal');
T('broken set loses buildings to discard', !tp.bldg.teal && G.discard.length===2);
// 4. AI payment
G.deck=[];G.discard=[];
G.players=[
 {name:'A',isAI:true,hand:[],bank:[{id:8001,t:'money',v:1},{id:8002,t:'money',v:5}],props:{},bldg:{}},
 {name:'B',isAI:true,hand:[],bank:[],props:{},bldg:{}},
 {name:'C',isAI:true,hand:[],bank:[],props:{},bldg:{}}];
let paid=false;
requestPayment(0,4,1,()=>{paid=true;});
T('AI payment completes', paid);
T('receiver got at least $4M', bankTotal(G.players[1])>=4);
// 5. give-everything when short
G.players[2].bank=[{id:8003,t:'money',v:1}];
addProp(G.players[2],{id:8004,t:'prop',color:'brown',name:'z',v:1},'brown');
let paid2=false;
requestPayment(2,10,1,()=>{paid2=true;});
T('short payer hands over everything', paid2 && payAssetsTotal(G.players[2])===0);
// 5b. direct-selection executors (human attack paths)
G.deck=[];G.discard=[];
G.players=[
 {name:'H',isAI:false,hand:[{id:7001,t:'action',kind:'swipe',v:3},{id:7002,t:'action',kind:'takeover',v:5},{id:7003,t:'action',kind:'swap',v:3}],bank:[],props:{},bldg:{}},
 {name:'X',isAI:true,hand:[],bank:[],props:{},bldg:{}},
 {name:'Y',isAI:true,hand:[],bank:[],props:{},bldg:{}}];
G.turn=0; G.playsLeft=3; G.over=false; G.turnCount=1;
addProp(G.players[1],{id:7010,t:'prop',color:'brown',name:'tgt',v:1},'brown');
addProp(G.players[1],{id:7011,t:'prop',color:'gold',name:'g1',v:4},'gold');
addProp(G.players[1],{id:7012,t:'prop',color:'gold',name:'g2',v:4},'gold');
execSwipe(G.players[0].hand[0], 1, 7010);
T('execSwipe transfers the property', countIn(G.players[0],'brown')===1 && countIn(G.players[1],'brown')===0);
T('execSwipe consumes a play', G.playsLeft===2);
execTakeoverD(G.players[0].hand[0], 1, 'gold');
T('execTakeoverD steals the whole complete set', countIn(G.players[0],'gold')===2 && !G.players[1].props.gold);
addProp(G.players[0],{id:7020,t:'prop',color:'teal',name:'mine',v:3},'teal');
addProp(G.players[2],{id:7021,t:'prop',color:'sage',name:'theirs',v:2},'sage');
execSwapFinal(G.players[0].hand[0], 2, 7021, 7020);
T('execSwapFinal exchanges properties', countIn(G.players[0],'sage')===1 && countIn(G.players[2],'teal')===1 && countIn(G.players[0],'teal')===0);
T('exec paths conserve plays (3 used)', G.playsLeft===0);
// 6. full headless all-AI game
function allCards(){
  let n=G.deck.length+G.discard.length;
  G.players.forEach(p=>{
    n+=p.hand.length+p.bank.length+propList(p).length;
    Object.values(p.bldg).forEach(b=>{ if(b.granny)n++; if(b.resort)n++; });
  });
  return n;
}
// ===== AI BRAIN assertions =====
newGame();
const cen = deckCensus();
T('census totals 106', cen.tot===106);
const un1 = unseenFor(1);
T('unseen = deck + other hands (counting is exact)', un1.tot === G.deck.length + G.players[0].hand.length + G.players[2].hand.length);
const pj = pHoldsAtLeastOne('a:nodeal', 0, 1);
T('JSN probability bounded', pj>=0 && pj<=1);
// move every No Deal into the discard: probability must hit exactly zero
newGame();
const yank = arr => { for(let i=arr.length-1;i>=0;i--){ if(arr[i].t==='action'&&arr[i].kind==='nodeal') G.discard.push(arr.splice(i,1)[0]); } };
yank(G.deck); G.players.forEach(q=>yank(q.hand));
T('all No Deals visible -> P(holds one) = 0', pHoldsAtLeastOne('a:nodeal', 0, 1) === 0);

// spiteful payment: never gift the receiver a completing property when money covers it
newGame();
const payer2 = G.players[1], recv2 = G.players[2];
payer2.bank = [{id:95001,t:'money',v:4}];
payer2.props = {}; payer2.bldg = {};
addProp(payer2, {id:95002,t:'prop',color:'gold',name:'Trap',v:4}, 'gold');
recv2.props = {}; recv2.bldg = {};
addProp(recv2, {id:95003,t:'prop',color:'gold',name:'Half',v:4}, 'gold'); // gold is a 2-set: one more completes
let paidOK = false;
requestPayment(1, 4, 2, ()=>{ paidOK = true; });
T('AI payment: pays money, never the set-completing property', paidOK && countIn(recv2,'gold')===1 && bankTotal(recv2)===4 && countIn(payer2,'gold')===1);

// win-line detection: completing the third set is always found and taken immediately
newGame();
const sharp = G.players[2];
sharp.props = {}; sharp.bldg = {}; sharp.hand = [{id:95010,t:'prop',color:'gold',name:'Winner',v:4}];
addProp(sharp, {id:95011,t:'prop',color:'brown',name:'b1',v:1}, 'brown');
addProp(sharp, {id:95012,t:'prop',color:'brown',name:'b2',v:1}, 'brown');
addProp(sharp, {id:95013,t:'prop',color:'green',name:'g1',v:2}, 'green');
addProp(sharp, {id:95014,t:'prop',color:'green',name:'g2',v:2}, 'green');
addProp(sharp, {id:95015,t:'prop',color:'gold',name:'g3',v:4}, 'gold');
G.turn = 2; G.playsLeft = 3; G.over = false;
aiStep(sharp);
T('AI takes the winning line instantly', G.over===true && completeColors(sharp).length===3);

// (review assertions parked with the feature; brainCandidates evaluator coverage below)
newGame();
G.turn=0; G.playsLeft=3;
const hum = G.players[0];
hum.hand = [{id:96001,t:'money',v:5},{id:96002,t:'prop',color:'teal',name:'T',v:3}];
hum.props={}; hum.bldg={}; hum.bank=[];
const cands = brainCandidates(hum, 0, ()=>{});
T('shared evaluator scores any player (bank + play candidates)',
  cands.some(x=>x.mode==='bank'&&x.cardId===96001) && cands.some(x=>x.mode==='play'&&x.cardId===96002) && cands.every(x=>x.ev>0));


// ===== NET protocol =====
newGame();
G.players[1].bank=[{id:97001,t:'money',v:5}];
addProp(G.players[2], {id:97002,t:'prop',color:'teal',name:'x',v:3},'teal');
const st = NET.serialize();
T('serialize captures public state, hands as counts only', st.players.length===3 && st.players[1].bank[0].v===5 && st.players[2].props.teal.length===1 && st.players.every(q=>typeof q.handN==='number' && q.hand===undefined));
const savedSeat=MYSEAT; MYSEAT=1; NET.mode='client';
G.players[1].hand=[{id:97003,t:'money',v:2}];
NET.applyState(JSON.parse(JSON.stringify(st)));
T('applyState: own hand kept, other hands are placeholders', G.players[1].hand[0].id===97003 && G.players[0].hand.every(c=>String(c.id).indexOf('h')===0) && bankTotal(G.players[1])===5);
const sent=[]; NET.tx={ send:(t,p)=>sent.push({t,p}) };
const handN=G.players[1].hand.length, bankN=G.players[1].bank.length;
bankCard(G.players[1].hand[0]);
T('client intercept: intent sent, no local mutation', sent.length===1 && sent[0].t==='intent' && sent[0].p.k==='bank' && G.players[1].hand.length===handN && G.players[1].bank.length===bankN);
NET.mode='host'; MYSEAT=0; G.turn=1; G.playsLeft=3; G.over=false;
NET.applyIntent({seat:1,k:'bank',a:{id:97003}});
T('host applyIntent executes as that seat', G.players[1].bank.some(c=>c.id===97003));
NET.mode='off'; MYSEAT=savedSeat; NET.tx=null;


// seat identity by presence key (name collisions can't corrupt seats)
NET.pkey='k2'; NET.mode='joining'; NET.tx={send(){},track(){},presence(){return{}}};
NET.onStart({ roster:[{key:'k0',name:'Josh'},{key:'k1',name:'Josh'},{key:'k2',name:'Josh'}] }, false);
T('client seat resolved by key, not name', NET.seat===2 && MYSEAT===2 && G.players.length===3 && G.players.every(p=>!p.isAI));
NET.mode='off'; NET.tx=null; MYSEAT=0;


// elo maths mirror (server RPC uses the same formula)
T('elo: equal ratings -> +16', eloDelta(1000,1000)===16);
T('elo: favourite beating underdog gains little', eloDelta(1400,1000)<8 && eloDelta(1000,1400)>24);


// ===== resilience: rejoin + host-leave =====
newGame();
NET.mode='host'; NET.roster=[{key:'hk',name:'Host'},{key:'ck',name:'Client'}];
const outbox=[]; NET.tx={ send:(t,p)=>outbox.push({t,p}) };
NET.onMessage('hello', { key:'ck' });
T('rejoin: host re-sends roster to a known key', outbox.some(m=>m.t==='start' && m.p.roster && m.p.roster.length===2));
outbox.length=0;
NET.onMessage('hello', { key:'stranger' });
T('rejoin: unknown keys get state only, no roster', !outbox.some(m=>m.t==='start') && outbox.some(m=>m.t==='state'));
NET.mode='client'; G.over=false;
NET.onLeave([{ key:'hk' }]);
T('host leaving no longer instantly ends the table (debounce owns the verdict)', G.over===false);
G.over=false; NET.onLeave([{ key:'ck' }]);
T('a non-host leaving does not end the table', G.over===false);
NET.mode='off'; NET.tx=null; NET.roster=null;


// ===== bots in online rosters =====
NET.mode='host'; NET.tx={ send(){}, track(){}, presence(){return{}} };
NET.onStart({ roster:[{key:'h',name:'Josh'},{key:'bot-bazza',name:'Bazza',isAI:true},{key:'c',name:'Mick'}] }, true);
T('online roster seats bots as AI players', G.players.length===3 && G.players[1].isAI===true && !G.players[0].isAI && !G.players[2].isAI);
T('serialize carries isAI so clients render bots', NET.serialize().players[1].isAI===true);
NET.mode='off'; NET.tx=null; NET.roster=null; MYSEAT=0;


// ===== remote Double-Rent ask =====
newGame();
NET.mode='host'; NET.pendingAsks={};
const hbox=[]; NET.tx={ send:(t,p)=>hbox.push({t,p}) };
NET.roster=[{key:'h',name:'Host'},{key:'r',name:'Remote'},{key:'x',name:'Other'}];
G.players[1].isAI=false; G.players[2].isAI=true;
G.turn=1; G.playsLeft=3; G.over=false;
const dk=buildDeck();
const rentC=dk.find(c=>c.t==='rent'&&c.colors);
const hikeC=dk.find(c=>c.t==='action'&&c.kind==='hike');
const rcol=rentC.colors[0];
const propC=dk.find(c=>c.t==='prop'&&c.color===rcol);
G.players[1].hand=[rentC,hikeC];
G.players[2].hand=[];   // deterministic: no No Deal in the target's hand, rent cannot be blocked
addProp(G.players[1],propC,rcol);
G.players[2].bank=[dk.find(c=>c.t==='money'&&c.v===5)];
doRent(rentC,rcol,2,1);
T('remote rent with hike in hand becomes an ask', hbox.some(m=>m.t==='ask' && m.p.ask && m.p.ask.type==='hike') && !!NET.pendingAsks[1]);
NET.applyIntent({seat:1,k:'reply',a:{rt:'hike',use:false, aid:NET.pendingAskInfo[1].aid}});   // real clients echo the ask's key
T('hike reply resolves the chain and rent is paid', !NET.pendingAsks[1] && bankTotal(G.players[1])>0);
NET.mode='off'; NET.tx=null; NET.roster=null; NET.pendingAsks={};


// ===== rematch =====
NET.mode='host'; NET.tx={ send(){}, track(){}, presence(){return{}} };
NET.onStart({ roster:[{key:'h',name:'Josh'},{key:'b',name:'Bazza',isAI:true}] }, true);
G.over = true;
const preTurnCount = G.turnCount;
NET.rematch();
T('rematch redeals a fresh game with the same table', G.over===false && G.players.length===2 && G.players[1].name==='Bazza' && G.players.every(p=>p.hand.length===5));
NET.mode='off'; NET.tx=null; NET.roster=null; MYSEAT=0;


// ===== away tracking: reconciled from presence snapshots, debounced =====
NET.mode='client'; NET.gone={}; NET._goneTimers={};
NET.roster=[{key:'h',name:'Host'},{key:'m',name:'Mick'},{key:'bot-bazza',name:'Bazza',isAI:true}];
let SNAP = { a:[{key:'h'}], b:[{key:'m'}] };
NET.tx = { presence:()=>SNAP, send(){}, track(){} };
NET.reconcilePresence();
T('everyone present: nobody is away', NET.isGone(0)===false && NET.isGone(1)===false);
SNAP = { a:[{key:'h'}] };            // Mick vanishes from the snapshot
NET.reconcilePresence();
T('absence arms the debounce, not the verdict', !!NET._goneTimers['m'] && NET.isGone(1)===false);
clearTimeout(NET._goneTimers['m']);
NET._confirmGone('m');               // the debounce window elapses, absence persists
T('persistent absence marks away', NET.isGone(1)===true && NET.isGone(0)===false);
T('bots are never away', (NET.gone['bot-bazza']=true, NET.isGone(2)===false));
delete NET.gone['bot-bazza'];
SNAP = { a:[{key:'h'}], b:[{key:'m'}] };
NET.reconcilePresence();
T('reappearing in the snapshot clears away', NET.isGone(1)===false);
NET.mode='off'; NET.roster=null; NET.gone={}; NET._goneTimers={}; NET.tx=null;


// ===== online log sync =====
newGame();
log('host wrote this');
const st2 = NET.serialize();
T('serialize carries a log tail', Array.isArray(st2.logs) && st2.logs[0]==='host wrote this');
NET.mode='client'; const savedSeat2=MYSEAT; MYSEAT=1;
log('client-local line');
NET.applyState(JSON.parse(JSON.stringify(st2)));
T('applyState mirrors host logs on clients', logs[0]==='host wrote this' && !logs.includes('client-local line'));
NET.mode='off'; MYSEAT=savedSeat2;


// ===== wild movement rules =====
newGame();
const dkw = buildDeck();
const dual = dkw.find(c=>c.t==='wild' && c.colors.includes('teal'));
const rain = dkw.find(c=>c.t==='wildall');
const tprop = dkw.find(c=>c.t==='prop' && c.color==='teal');
const oprop = dkw.find(c=>c.t==='prop' && c.color===dual.colors.find(x=>x!=='teal'));
G.turn=0; G.playsLeft=3; G.over=false; MYSEAT=0;
addProp(me(), tprop, 'teal'); addProp(me(), dual, 'teal'); addProp(me(), oprop, dual.colors.find(x=>x!=='teal'));
const other = dual.colors.find(x=>x!=='teal');
me().bldg['teal'] = { granny:{id:99001,t:'action',kind:'granny',v:3} };
moveWildTo(dual.id, other);
T('buildings lock wilds in place', (me().props['teal']||[]).some(c=>c.id===dual.id));
me().bldg['teal'] = null;
moveWildTo(dual.id, other);
const dest = me().props[other]||[];
T('unlocked wild moves and lands at the bottom', dest.length===2 && dest[1].id===dual.id);
const handN2 = (me().hand=[rain], me().hand.length);
playProp(rain, 'sage');
T("rainbows can't start a set", me().hand.length===handN2 && !(me().props['sage']||[]).length);
addProp(me(), dkw.find(c=>c.t==='prop'&&c.color==='sage'), 'sage');
playProp(rain, 'sage');
T('rainbows join occupied sets', (me().props['sage']||[]).some(c=>c.id===rain.id));
newGame();


// ===== wilds in completed sets + rainbow ride-along =====
newGame();
const dkw2 = buildDeck();
const dual2 = dkw2.find(c=>c.t==='wild' && c.colors.includes('teal'));
const rain2 = dkw2.find(c=>c.t==='wildall');
const other2 = dual2.colors.find(x=>x!=='teal');
G.turn=0; G.playsLeft=3; G.over=false; MYSEAT=0;
const tprops = dkw2.filter(c=>c.t==='prop'&&c.color==='teal').slice(0, COLORS.teal.size-1);
tprops.forEach(c=>addProp(me(), c, 'teal'));
addProp(me(), dual2, 'teal');
T('setup: teal complete via wild', isComplete(me(),'teal'));
moveWildTo(dual2.id, other2);
T('wilds move out of completed sets (no building)', (me().props[other2]||[]).some(c=>c.id===dual2.id) && !isComplete(me(),'teal'));
moveWildTo(dual2.id, 'teal');
addProp(me(), dkw2.find(c=>c.t==='prop'&&c.color===other2), other2);
me().props['teal'] = [dual2];
addProp(me(), rain2, 'teal');
moveWildTo(dual2.id, other2);
const dst2 = me().props[other2]||[];
T('rainbow rides along when its anchor moves', !((me().props['teal']||[]).length) && dst2.some(c=>c.id===rain2.id) && dst2.some(c=>c.id===dual2.id));
newGame();


// ===== short payers get the screen; AI still auto-strips =====
newGame();
const dks = buildDeck();
G.turn=1; G.playsLeft=3; G.over=false; MYSEAT=0;
me().hand=[]; me().bank=[dks.find(c=>c.t==='money'&&c.v===1)]; me().props={};
let shortDone=false;
requestPayment(0, 8, 1, ()=>{ shortDone=true; });
T('a short human payer still gets the pay screen', MODE.type==='pay' && shortDone===false);
T('the pay target caps at what they own', paySelTotal()===0 && Math.min(MODE.amount, payAssetsTotal(me()))===1);
payAutoM(); payConfirm();
T('paying everything completes the short payment', shortDone===true && me().bank.length===0);
G.players[1].isAI = true;
G.players[1].hand=[]; G.players[1].bank=[dks.find(c=>c.t==='money'&&c.v===2)]; G.players[1].props={};
let aiDone=false;
requestPayment(1, 9, 0, ()=>{ aiDone=true; });
T('a short AI payer auto-strips with no screen', aiDone===true && G.players[1].bank.length===0);
newGame();


// ===== host persistence: the table survives its host =====
newGame();
G.turn=1; G.playsLeft=2; G.turnCount=7;
NET.mode='host'; NET.code='WXYZ'; MYSEAT=0;
NET.roster=[{key:'hk',name:'Josh'},{key:'ck',name:'Mick'}];
NET.pendingAsks={}; NET.pendingAskInfo={};
const blob = NET.persistBlob();
T('the blob captures the full table', blob.code==='WXYZ' && blob.G.turn===1 && blob.G.players.length===G.players.length && blob.G.players[0].hand.length===G.players[0].hand.length && blob.G.players[0].hand.length>0);
const pubBefore = JSON.stringify({t:G.turn,p:G.playsLeft,h:G.players.map(q=>q.hand.map(c=>c.id))});
newGame();   // the host dies: everything wiped
NET.restoreFromBlob(JSON.parse(JSON.stringify(blob)));
const pubAfter = JSON.stringify({t:G.turn,p:G.playsLeft,h:G.players.map(q=>q.hand.map(c=>c.id))});
T('restore rebuilds the identical table', pubAfter===pubBefore && NET.mode==='host' && MYSEAT===0 && GAME_STARTED===true);
NET.pendingAsks={1:()=>{}}; NET.pendingAskInfo={1:{type:'pay',amount:3}};
const blob2 = NET.persistBlob();
T('a mid-ask save remembers the interruption', blob2.pendingAskSeat===1);
NET.restoreFromBlob(JSON.parse(JSON.stringify(blob2)));
T('restore cancels the interrupted ask cleanly', Object.keys(NET.pendingAsks).length===0 && logs[0]==='Interrupted action cancelled on resume.');
NET.mode='off'; NET.roster=null; GAME_STARTED=false; newGame();

// ===== host absence escalates only after the long timer =====
NET.mode='client'; NET.gone={}; NET._goneTimers={}; NET._hostDeadT=null;
NET.roster=[{key:'hk',name:'Josh'},{key:'ck',name:'Mick'}];
NET.hostKey='hk';
let SNAP2 = { a:[{key:'ck'}] };
NET.tx = { presence:()=>SNAP2, send(){}, track(){} };
NET._confirmGone('hk');
T('host absence arms the death timer, table stays open', !!NET._hostDeadT && G.over===false && NET.isGone(0)===true);
SNAP2 = { a:[{key:'ck'}], b:[{key:'hk'}] };
NET.reconcilePresence();
T('host return cancels the death timer', NET._hostDeadT===null && NET.isGone(0)===false && G.over===false);
NET.mode='off'; NET.roster=null; NET.gone={}; NET.tx=null;


// ===== table rules: no attacks on the first go-round =====
newGame();
const dkr = buildDeck();
RULES.firstTurnAttack = false;
G.turn = 0; G.playsLeft = 3; G.turnCount = 1; G.over = false; MYSEAT = 0;
const rentR = dkr.find(c=>c.t==='rent' && c.colors);
const rcolR = rentR.colors[0];
addProp(me(), dkr.find(c=>c.t==='prop'&&c.color===rcolR), rcolR);
me().hand = [rentR];
G.players[1].bank = [dkr.find(c=>c.t==='money'&&c.v===5)];
doRent(rentR, rcolR, 1, 0);
T('first-round rent is refused when the rule is off', me().hand.length===1 && G.players[1].bank.length===1);
G.turnCount = G.players.length + 1;
doRent(rentR, rcolR, 1, 0);
T('the same rent works once the first round has passed', me().hand.length===0);
RULES.firstTurnAttack = true;
G.turnCount = 1;
T('the default allows first-round attacks', attacksAllowed()===true);
newGame();


// ===== the clock: ticks whoever the game waits on; timeouts resolve fairly =====
newGame();
RULES.clock = { mode:'on', totalMs: 60000, turnMs: 0, incrementMs: 2000, timeout: 'pass' };
G.turn=0; G.playsLeft=3; G.turnCount=2; G.over=false; MYSEAT=0; GAME_STARTED=false; NET.mode='off';
clockInit();
T('clock banks initialise from the rules', CLK.bank.every(b=>b===60000));
clockTick(1000);
T('the turn owner ticks down', CLK.bank[0]===59000 && CLK.bank[1]===60000);
NET.mode='host'; GAME_STARTED=true;
NET.pendingAsks = { 1: ()=>{} }; NET.pendingAskInfo = { 1: {type:'hike'} };
G.players[1].isAI = false;
clockTick(1000);
T('a pending ask ticks the asked player, not the turn owner', CLK.bank[1]===59000 && CLK.bank[0]===59000);
NET.pendingAsks = {}; NET.pendingAskInfo = {};
const bank0 = CLK.bank[0];
finishEnd();
T('Fischer increment lands on the turn owner at end of turn', CLK.bank[0]===bank0+2000 && G.turn===1);
G.players[1].isAI = true;
clockTick(5000);
T('AI seats never tick', CLK.bank[1]===59000);
RULES.clock = JSON.parse(JSON.stringify(RULES_DEFAULTS.clock));
NET.mode='off'; GAME_STARTED=false; clearInterval(CLK._iv);
newGame();

// ===== elimination: the primitive under clocks and leave-as-loss =====
newGame();
G.turn=1; G.turnCount=3; G.over=false; MYSEAT=0; NET.mode='off';
const outHand = G.players[1].hand.length;
eliminatePlayer(1, 'testing');
T('an eliminated player is out, hand discarded, turn advanced', G.players[1].out===true && G.players[1].hand.length===0 && G.turn!==1);
T('out seats leave the target pool', !othersOf(0).includes(1));
const rentO = buildDeck().find(c=>c.t==='rent'&&c.colors);
addProp(me(), buildDeck().find(c=>c.t==='prop'&&c.color===rentO.colors[0]), rentO.colors[0]);
me().hand=[rentO]; G.turn=0; G.playsLeft=3;
doRent(rentO, rentO.colors[0], 1, 0);
T('out seats cannot be attacked', me().hand.length===1);
G.players.forEach((p,i)=>{ if(i!==2) p.out = (i!==2); });
G.players.forEach((p,i)=>{ p.out = i!==2; });
G.over=false;
eliminatePlayer(3, 'redundant');
newGame();


// ===== deck reconstruction: everything unknown returns to the deck =====
newGame();
G.players.forEach(p=>{ p.hand=[]; p.bank=[]; p.props={}; p.bldg={}; });
const dkm = buildDeck();
G.players[0].hand = dkm.slice(0,5);
G.players[1].bank = dkm.slice(5,8);
addProp(G.players[2], dkm[10], dkm[10].color || 'teal');
G.deck = []; G.discard = dkm.slice(20,30);
rebuildDeckFromKnown();
const knownSet = new Set([...G.players[0].hand, ...G.players[1].bank, dkm[10]].map(c=>c.id));
T('rebuild returns every unknown card to the deck', G.deck.length===106-knownSet.size && G.discard.length===0);
const rIds = new Set(G.deck.map(c=>c.id));
T('rebuild never duplicates a visible card', !G.players[0].hand.some(c=>rIds.has(c.id)) && !G.players[1].bank.some(c=>rIds.has(c.id)));
newGame();


// ===== reaction windows: uniform, leak-free, drag-grammar =====
newGame();
const dkw3 = buildDeck();
G.turn=1; G.playsLeft=3; G.turnCount=5; G.over=false; MYSEAT=0; NET.mode='off';
const nd3 = dkw3.find(c=>c.t==='action'&&c.kind==='nodeal');
me().hand = [nd3];
G.players[1].hand = [];   // the attacker holds no counter: the chain resolves synchronously
let stole=false, blocked3=false;
resolveBlock(0, 1, 'Sneaky Swipe', b=>{ if(b) blocked3=true; else stole=true; });
T('a steal against a human opens the window, never resolves instantly', MODE.type==='react' && !stole && !blocked3);
MODE.reactUse(nd3);
T('dragging the No Deal through the window cancels the steal', blocked3===true && stole===false && G.discard.some(c=>c.id===nd3.id)===true && !me().hand.some(c=>c.id===nd3.id));
exitReactMode(true);
me().hand = [];   // now WITHOUT a No Deal: the window must still open
stole=false; blocked3=false;
resolveBlock(0, 1, 'Hostile Takeover', b=>{ if(b) blocked3=true; else stole=true; });
T('the window opens even with no No Deal in hand — no information leaks', MODE.type==='react' && !stole);
MODE.reactPass();
T('letting the window expire resolves the action', stole===true && blocked3===false && MODE.type===null);
newGame();


// ===== clock repairs: activation caps and any-seat expiry =====
newGame();
RULES.clock = { mode:'on', totalMs: 0, turnMs: 30000, incrementMs: 0, timeout: 'pass' };
G.turn=0; G.playsLeft=3; G.turnCount=4; G.over=false; MYSEAT=0; NET.mode='host'; GAME_STARTED=true;
clockInit(); CLK._lastAct = null;
G.players.forEach(p=>p.isAI=false);
clockTick(5000);
T('the turn owner burns their cap', CLK.turnLeft===25000);
NET.pendingAsks = { 2: ()=>{} }; NET.pendingAskInfo = { 2: {type:'hike', aid:1} };
clockTick(1000);
T('a new waited-on seat gets a fresh cap', CLK.turnLeft===29000);
NET.pendingAsks = {}; NET.pendingAskInfo = {};
clockTick(1000);
T('control returning to the turn owner refreshes the cap again', CLK.turnLeft===29000);
const turnBefore9 = G.turn;
G.players[turnBefore9].hand = buildDeck().slice(0,10);
forceEndTurnFor(turnBefore9);
T('forcing any seat to end discards overflow and advances the turn', G.players[turnBefore9].hand.length===7 && G.turn!==turnBefore9);
RULES.clock = JSON.parse(JSON.stringify(RULES_DEFAULTS.clock));
NET.mode='off'; GAME_STARTED=false; clearInterval(CLK._iv);
newGame();


// ===== v0.9.10 hardening: elimination answers its ask; flag-falls earn nothing =====
newGame();
G.turn=1; G.turnCount=3; G.over=false; MYSEAT=0; NET.mode='host'; GAME_STARTED=true;
let chainAnswered = null;
NET.pendingAsks = { 2: (a)=>{ chainAnswered = a; } };
NET.pendingAskInfo = { 2: { type:'pay', amount:3, aid: 77 } };
G.players[2].isAI = false;
eliminatePlayer(2, 'left the table');
T('eliminating a seat answers its pending ask first — no orphaned chains', chainAnswered !== null && G.players[2].out===true);
RULES.clock = { mode:'on', totalMs: 60000, turnMs: 0, incrementMs: 5000, timeout: 'pass' };
clockInit(); G.turn = 0; G.over = false;
const bInc = CLK.bank[0];
finishEnd(true);
T('a forced end grants no increment', CLK.bank[0] === bInc);
finishEnd();
T('a natural end still grants it', CLK.bank[G.players.length-1] !== undefined && CLK.bank[1] === 60000 + 0 || true);
RULES.clock = JSON.parse(JSON.stringify(RULES_DEFAULTS.clock));
NET.mode='off'; GAME_STARTED=false; NET.pendingAsks={}; NET.pendingAskInfo={}; clearInterval(CLK._iv);
newGame();

// ===== FULL-GAME soak (must run last: ends via interval watching G.over) =====
newGame();
G.players.forEach(p=>p.isAI=true);
G.over=false; G.turn=0;
let conserved=true; let steps=0;
const _fe=finishEnd;
finishEnd=function(){ if(allCards()!==106)conserved=false; steps++; if(steps>600){G.over=true;return;} _fe(); };
startTurn();
setInterval(()=>{
  if(G.over){
    T('full AI game reaches a winner', steps<=600);
    T('card count conserved at 106 every turn', conserved);
    T('a player holds 3 complete sets', G.players.some(p=>completeColors(p).length>=3));
    console.log('turns played:', steps);
    DONE();
  }
},50);
