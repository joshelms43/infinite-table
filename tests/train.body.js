const pump = ()=>{ let n=0; while(timers.length && n<20000){ const f=timers.shift(); try{f();}catch(e){} n++; } };
const GENES = Object.keys(AI_W);
const clone = w => JSON.parse(JSON.stringify(w));
function mutate(w, rate, mag){
  const m = clone(w);
  GENES.forEach(g=>{ if(Math.random()<rate){ m[g] = +(m[g] * (1 + (Math.random()*2-1)*mag)).toFixed(3); if(m[g]<0.01) m[g]=0.01; } });
  return m;
}
function playGame(w0,w1,w2){
  newGame();
  G.players[0].isAI = true;
  G.players[0].tuneW = w0; G.players[1].tuneW = w1; G.players[2].tuneW = w2;
  startTurn(); pump();
  let guard = 0;
  while(!G.over && guard<600){ // pump any stalled chains
    if(timers.length){ pump(); } else { aiStep(cur()); pump(); }
    guard++;
  }
  if(!G.over) return -1;
  return G.players.findIndex(p=>completeColors(p).length>=3);
}
function evalMutant(mut, champ, games){
  let wins=0, played=0;
  for(let g=0; g<games; g++){
    const seat = g%3;
    const ws = [champ,champ,champ]; ws[seat]=mut;
    const winner = playGame(ws[0],ws[1],ws[2]);
    if(winner<0) continue;
    played++;
    if(winner===seat) wins++;
  }
  return { rate: played? wins/played : 0, played };
}

const [,, gensArg, champFile] = process.argv;
const GENS = +gensArg || 2;
let champ = champFile && fs.existsSync(champFile) ? JSON.parse(fs.readFileSync(champFile,'utf8')) : clone(AI_W);
const t0=Date.now();
// throughput probe
const probe = evalMutant(champ, champ, 30);
console.log(`probe: 30 games, ${probe.played} finished, ${((Date.now()-t0)/30).toFixed(0)}ms/game, self rate ${(probe.rate*100).toFixed(0)}% (expect ~33)`);

const POP=7, GAMES=105, THRESH=0.40;
for(let gen=1; gen<=GENS; gen++){
  let best=null;
  for(let i=0;i<POP;i++){
    const mut = mutate(champ, 0.35, 0.3);
    const r = evalMutant(mut, champ, GAMES);
    if(!best || r.rate>best.rate) best={mut, ...r};
  }
  if(best.rate >= THRESH){
    champ = best.mut;
    console.log(`gen ${gen}: NEW CHAMPION at ${(best.rate*100).toFixed(1)}% (vs 33.3% baseline)`);
  } else {
    console.log(`gen ${gen}: champion holds (best mutant ${(best.rate*100).toFixed(1)}%)`);
  }
  fs.writeFileSync('champion.json', JSON.stringify(champ,null,1)); // checkpoint every generation
}
fs.writeFileSync('champion.json', JSON.stringify(champ,null,1));
console.log('saved champion.json  |  total', ((Date.now()-t0)/1000).toFixed(0)+'s');
