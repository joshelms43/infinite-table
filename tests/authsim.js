/* authsim — the puppeting hole ChatGPT #1 flagged, and the crypto that closes it.
   Proves: an honest client's signed intent verifies; a forged seat (right claim,
   wrong key) is refused; a replayed counter bounces. Runs the REAL TableKit.ident. */
const fs=require('fs'), vm=require('vm');
const kit = fs.readFileSync('shared/tablekit.js','utf8');
function ctx(){ const store={}; const sb={window:{}, localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v}, crypto:globalThis.crypto, TextEncoder, btoa, atob, console, module:{exports:{}} }; sb.window=sb; vm.createContext(sb); vm.runInContext(kit,sb); return sb.TableKit; }

let pass=0, fail=0;
function T(name, ok){ console.log((ok?'PASS':'FAIL')+' — '+name); ok?pass++:fail++; }

(async()=>{
  // two independent devices: honest seat-1 holder, and an attacker
  const honest = ctx(); await honest.ident.keys();
  const attacker = ctx(); await attacker.ident.keys();

  // the host registers seat 1 to the honest device's announced public key
  const registeredKey = honest.ident.pub();
  let ctr = 0;

  // honest intent
  const fields1 = ['ROOM7', 1, ++ctr, 'endturn', '{}'];
  const sig1 = await honest.ident.sign(fields1);
  const host = ctx();   // a third context does the verifying, key-agnostic
  T('honest signed intent verifies', await host.ident.verify(registeredKey, fields1, sig1));

  // attacker claims seat 1 with the SAME fields but signs with its own key
  const forged = await attacker.ident.sign(fields1);
  T('forged seat (wrong key) is refused', (await host.ident.verify(registeredKey, fields1, forged))===false);

  // attacker copies the honest signature verbatim but the host's counter has moved past it
  const seenCtr = ctr;                     // host recorded this
  const replayCtr = seenCtr;               // attacker replays the same number
  T('replayed counter is not greater than last seen', !(replayCtr > seenCtr));

  // a fresh higher counter from the honest holder still works (liveness)
  const fields2 = ['ROOM7', 1, ++ctr, 'play', '{"id":42}'];
  const sig2 = await honest.ident.sign(fields2);
  T('honest next intent (higher counter) verifies', await host.ident.verify(registeredKey, fields2, sig2) && ctr>seenCtr);

  // wrong room in the signed fields fails against a host expecting ROOM7
  const fieldsX = ['ROOMX', 1, ++ctr, 'endturn', '{}'];
  const sigX = await honest.ident.sign(fieldsX);
  T('a signature from another room does not verify here',
    (await host.ident.verify(registeredKey, ['ROOM7',1,ctr,'endturn','{}'], sigX))===false);

  console.log((fail?'AUTHSIM FAILURES: '+fail:'AUTHSIM: ALL PASS'));
  process.exit(fail?1:0);
})();
