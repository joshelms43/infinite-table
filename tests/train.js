// Coastline AI trainer — evolutionary self-play (mutant vs two champions, rotating seats)
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname,'..','coastline','index.html'),'utf8');
const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);

// headless stubs (mirror test.js)
const el = () => new Proxy(function(){}, { get:(t,k)=>{
  if(k==='classList') return {add(){},remove(){},toggle(){},contains(){return false}};
  if(k==='style') return new Proxy({},{get:()=>'' ,set:()=>true});
  if(k==='innerHTML'||k==='textContent') return '';
  if(k==='children') return [];
  return typeof k==='string' && ['appendChild','removeChild','remove','addEventListener','setAttribute','getBoundingClientRect','querySelector','insertBefore','scrollIntoView','click','focus'].includes(k) ? ()=>el() : el();
}, set:()=>true, apply:()=>el() });
global.window = global;
global.addEventListener = ()=>{};
global.document = new Proxy({},{ get:(t,k)=>{
  if(k==='querySelectorAll') return ()=>[];
  if(k==='querySelector'||k==='getElementById') return ()=>el();
  if(k==='createElement') return ()=>el();
  if(k==='body') return el();
  if(k==='addEventListener') return ()=>{};
  return el();
}});
global.requestAnimationFrame = fn=>fn();
global.navigator = {};
global.location = { reload(){} };
const timers=[];
global.setTimeout = (fn)=>{ timers.push(fn); return timers.length; };
global.clearTimeout = ()=>{};
global.AudioContext = undefined; global.webkitAudioContext = undefined;
global.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };

const body = fs.readFileSync(require('path').join(__dirname, process.env.BODY||'train.body.js'),'utf8');
try{ eval(scripts.join('\n;\n') + '\n;\n' + body); }catch(e){ console.error('EVAL FAIL:', e.message, e.stack && e.stack.split('\n')[1]); }

