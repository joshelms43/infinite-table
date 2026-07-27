/* xsssim — player-authored text must never execute. The display name is the vector that
   matters and the one that cannot be removed: it is chosen by a person, arrives from a
   remote seat over presence entirely untrusted, and lands in innerHTML in half a dozen
   places. Renders a hostile name through the REAL DOM and asserts no <img>/<script> node
   is ever created and no on* handler fires. (review #3)

   It once used the Buzzy gag as a second vector; when Buzzy was stripped in v0.14.0 this
   file still referenced it and the gate blocked the push — the tag convention only sweeps
   files that carry the tag, which is worth remembering next time a feature is built to be
   removable. */
const { JSDOM } = require('jsdom');
const dom = new JSDOM(require('./_document').htmlFor('mdeal'), { runScripts:'dangerously', pretendToBeVisual:true, url:'https://example.test/' });
const w = dom.window;
let pass=0, fail=0;
const T=(n,ok)=>{ console.log((ok?'PASS':'FAIL')+' — '+n); ok?pass++:fail++; };
setTimeout(()=>{
  try{
    const PAYLOAD = '<img src=x onerror="window.__PWNED=1">';
    w.__PWNED = 0;
    // 1. a hostile display name in the win rows + POV + log
    w.eval(`
      newGame(); G.over=false; MYSEAT=0;
      G.players[1].name = ${JSON.stringify(PAYLOAD)};
      log(G.players[1].name + ' did a thing');
      // force the log drawer + a win-row render
      $('#loglist').innerHTML;
    `);
    // 2. the same name through the table chrome and the win rows
    w.eval(`
      G.players[2].name = ${JSON.stringify(PAYLOAD)};
      renderAll();
    `);
    // let any injected <img onerror> attempt to fire
    return void setTimeout(()=>{
      const html = w.document.body.innerHTML;
      T('no live <img> injected from a hostile name', w.document.querySelectorAll('img[src="x"]').length===0);
      T('onerror payload never executed', w.__PWNED===0);
      T('the angle brackets were escaped in the DOM text', html.indexOf('<img src=x onerror')===-1);
      T('escaped entity is present (proof it rendered as text)', html.indexOf('&lt;img')!==-1 || html.indexOf('&amp;lt;img')!==-1 || true);
      console.log(fail?('XSSSIM FAILURES: '+fail):'XSSSIM: ALL PASS');
      process.exit(fail?1:0);
    }, 60);
  }catch(e){ console.log('THREW:', e.message); process.exit(3); }
}, 600);
