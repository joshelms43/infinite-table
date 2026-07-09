const pump = ()=>{ let n=0; while(timers.length && n<20000){ const f=timers.shift(); try{f();}catch(e){} n++; } };
const clone = w => JSON.parse(JSON.stringify(w));
function playGame(w0,w1,w2){
  newGame();
  G.players[0].isAI = true;
  G.players[0].tuneW = w0; G.players[1].tuneW = w1; G.players[2].tuneW = w2;
  startTurn(); pump();
  let guard = 0;
  while(!G.over && guard<600){ if(timers.length){ pump(); } else { aiStep(cur()); pump(); } guard++; }
  if(!G.over) return -1;
  return G.players.findIndex(p=>completeColors(p).length>=3);
}
const champ = JSON.parse(require('fs').readFileSync('champion.json','utf8'));
const base = clone(AI_W);
let wins=0, played=0, N=420;
for(let g=0; g<N; g++){
  const seat = g%3;
  const ws=[base,base,base]; ws[seat]=champ;
  const w = playGame(ws[0],ws[1],ws[2]);
  if(w<0) continue;
  played++; if(w===seat) wins++;
}
const rate = wins/played, sd = Math.sqrt(rate*(1-rate)/played);
console.log(`VALIDATION: tuned champion vs default brain — ${(rate*100).toFixed(1)}% win rate over ${played} games (baseline 33.3%, ±${(196*sd).toFixed(1)}pp 95% CI)`);
console.log('CHAMPION GENOME:', JSON.stringify(champ));
