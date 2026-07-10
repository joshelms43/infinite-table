const fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','coastline','index.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const gameCode=scripts.join('\n');
const el=()=>new Proxy({classList:{add(){},remove(){},toggle(){}},style:{}},{
  get(t,k){ if(k in t)return t[k]; return ()=>{}; },
  set(){return true;}
});
global.document={querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),getElementById:()=>el(),addEventListener:()=>{},body:{appendChild(){}}};
global.window=global;
global.addEventListener=()=>{};
global.location={reload(){}};
global.setTimeout=(fn)=>setImmediate(fn);
let fails=0;
global.T=function(name,cond){ console.log((cond?'PASS':'FAIL')+' — '+name); if(!cond)fails++; };
global.DONE=function(){ console.log(fails===0?'ALL TESTS PASS':'FAILURES: '+fails); process.exit(fails===0?0:1); };
const _P=require('path'),_F=require('fs');
const identPath=_F.existsSync(_P.join(__dirname,'shared_identity.js'))?_P.join(__dirname,'shared_identity.js'):_P.join(__dirname,'..','shared','identity.js');
const identCode=_F.readFileSync(identPath,'utf8');
const testCode=fs.readFileSync('assertions.js','utf8');
eval(gameCode + '\n' + identCode + '\n' + testCode);
