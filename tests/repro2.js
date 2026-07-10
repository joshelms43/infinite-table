const { JSDOM } = require('jsdom');
const fs = require('fs');
let html = fs.readFileSync(require('path').join(__dirname,'..','coastline','index.html'),'utf8');
const _p=require('path'),_f=require('fs');
const _shared=(n)=>{const a=_p.join(__dirname,'..','shared',n),b=_p.join(__dirname,n.replace('identity.js','shared_identity.js'));return _f.readFileSync(_f.existsSync(a)?a:b,'utf8');};
html = html
  .replace('<script src="../shared/config.js?v=062"></script>', '<scr'+'ipt>window.SUPABASE_URL="";window.SUPABASE_ANON="";</scr'+'ipt>')
  .replace('<script src="../shared/identity.js?v=062"></script>', '<scr'+'ipt>'+_shared('identity.js')+'</scr'+'ipt>');
const errors = [];
const dom = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://localhost/' });
const win = dom.window;
win.addEventListener('error', e => errors.push((e.message||'?') + ' :' + (e.lineno||'?')));
function fire(el, type, x, y){
  el.dispatchEvent(new win.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,view:win}));
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

(async ()=>{
  await sleep(600);
  win.closeHome && win.closeHome();
  await sleep(1000);
  win.eval('window.__G=G; window.__zones=()=>DRAG.zones; window.__setOver=i=>{DRAG.over=DRAG.zones[i];};');
  const G = win.__G;
  win.endTurn();
  let w8=0; while(!(G.turn===0 && G.turnCount>=2) && w8<20000){ await sleep(200); w8+=200; }
  console.log('at turn', G.turnCount);

  function resetBoards(){
    const me=G.players[0];
    // my board: exactly one complete purple set (+granny for resort tests)
    me.props={}; me.bldg={};
    win.addProp(me,{id:70001,t:'prop',color:'purple',name:'p1',v:2},'purple');
    win.addProp(me,{id:70002,t:'prop',color:'purple',name:'p2',v:2},'purple');
    win.addProp(me,{id:70003,t:'prop',color:'purple',name:'p3',v:2},'purple');
    me.bldg.purple={granny:{id:70004,t:'action',kind:'granny',v:3}};
    me.bank=[{id:70005,t:'money',v:5}];
    // AI boards: steal/takeover targets
    G.players[1].props={}; G.players[1].bldg={};
    win.addProp(G.players[1],{id:70011,t:'prop',color:'brown',name:'b1',v:1},'brown');
    G.players[2].props={}; G.players[2].bldg={};
    win.addProp(G.players[2],{id:70021,t:'prop',color:'gold',name:'g1',v:4},'gold');
    win.addProp(G.players[2],{id:70022,t:'prop',color:'gold',name:'g2',v:4},'gold');
    G.over=false;
  }

  const cards = [
    {t:'money',v:3},
    {t:'prop',color:'teal',name:'T1',v:3},
    {t:'wild',colors:['teal','coral'],v:3},
    {t:'wildall',v:0},
    {t:'action',kind:'payday',v:1},{t:'action',kind:'shout',v:2},{t:'action',kind:'favour',v:3},
    {t:'action',kind:'swipe',v:3},{t:'action',kind:'takeover',v:5},{t:'action',kind:'swap',v:3},
    {t:'action',kind:'granny',v:3},{t:'action',kind:'resort',v:4},
    {t:'rent',colors:['purple','orange'],v:1},
    {t:'rentall',v:3},
  ];
  let id=91000;
  for(const proto of cards){
    resetBoards();
    // count zones first with a probe drag
    const probe = Object.assign({id:++id}, JSON.parse(JSON.stringify(proto)));
    G.players[0].hand.push(probe); G.playsLeft=3; win.renderAll();
    let w=win.document.querySelector(`#hand .cardw[data-cid="${probe.id}"]`);
    fire(w,'pointerdown',200,600); fire(win.document,'pointermove',200,560);
    const nz = win.__zones().length;
    fire(win.document,'pointercancel',0,0);
    try{ win.cancelDrag(true); win.clearSelection(); win.closeSheet(); win.endOppSelect(); }catch(e){}
    { const i=G.players[0].hand.findIndex(x=>x.id===probe.id); if(i>-1)G.players[0].hand.splice(i,1); }
    const label = proto.kind||proto.t;
    for(let z=0; z<nz; z++){
      resetBoards();
      const card = Object.assign({id:++id}, JSON.parse(JSON.stringify(proto)));
      G.players[0].hand.push(card); G.playsLeft=3; win.renderAll();
      w = win.document.querySelector(`#hand .cardw[data-cid="${card.id}"]`);
      if(!w){ console.log(label,z,'no wrapper'); continue; }
      const before = errors.length;
      try{
        fire(w,'pointerdown',200,600);
        fire(win.document,'pointermove',210,540);
        win.__setOver(z);
        const zoneDesc = win.eval(`DRAG.over ? (DRAG.over.el.id||DRAG.over.el.className||'?') : 'none'`);
        fire(win.document,'pointerup',210,540);
        await sleep(1600); // let No Deal chains / payments settle
        const news = errors.slice(before);
        console.log(String(label).padEnd(9), 'zone', z, String(zoneDesc).slice(0,26).padEnd(27), news.length?('ERROR -> '+news.join(' || ')):'clean');
      }catch(err){ console.log(label,'zone',z,'SYNC THROW:',err.message); errors.push('SYNC '+label+':'+err.message); }
      try{ win.cancelDrag(true); win.clearSelection(); win.closeSheet(); win.endOppSelect(); win.closePOV(); }catch(e){}
      const i=G.players[0].hand.findIndex(x=>x.id===card.id); if(i>-1)G.players[0].hand.splice(i,1);
      G.over=false;
    }
  }
  console.log('TOTAL errors:', errors.length);
  process.exit(0);
})();
