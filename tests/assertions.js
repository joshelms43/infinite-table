// 0. CSS integrity: every load-bearing selector must exist in the stylesheet
const _P = require('path'), _F = require('fs');
const HTML_PATH = _F.existsSync(_P.join(__dirname,'coastline.html')) ? _P.join(__dirname,'coastline.html') : _P.join(__dirname,'..','coastline','index.html');
const HTML_SRC = _F.readFileSync(HTML_PATH,'utf8');
const REQUIRED_CSS = ['#winscreen{','.wincard{','.showcase{','#winpill{','#logdrawer{','.dragclone{','#promptbar{','.droppable{','.dropok{','.setghost{','.colorpick{','.opp.selectable{','.pickable{','#pov{','#inspect{','.errtoast{','.banner{','.flyer{','.cardback{','.actionzone{','.tcard.pickable','#myprops,.tablespread','.note{','.tset','.pbleft{','#pbfill{'];
const missingCss = REQUIRED_CSS.filter(sel=>!HTML_SRC.includes(sel));
T('CSS integrity: all load-bearing selectors present'+(missingCss.length?' (missing: '+missingCss.join(', ')+')':''), missingCss.length===0);
// 1. deck composition
const d=buildDeck();
T('deck has 105 cards', d.length===105);
T('28 properties', d.filter(c=>c.t==='prop').length===28);
T('10 wilds (8 dual + 2 rainbow)', d.filter(c=>c.t==='wild').length===8 && d.filter(c=>c.t==='wildall').length===2);
T('20 money cards', d.filter(c=>c.t==='money').length===20);
T('34 action cards', d.filter(c=>c.t==='action').length===34);
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
newGame();
G.players.forEach(p=>p.isAI=true);
G.over=false; G.turn=0;
let conserved=true; let steps=0;
const _fe=finishEnd;
finishEnd=function(){ if(allCards()!==105)conserved=false; steps++; if(steps>600){G.over=true;return;} _fe(); };
startTurn();
setInterval(()=>{
  if(G.over){
    T('full AI game reaches a winner', steps<=600);
    T('card count conserved at 105 every turn', conserved);
    T('a player holds 3 complete sets', G.players.some(p=>completeColors(p).length>=3));
    console.log('turns played:', steps);
    DONE();
  }
},50);
