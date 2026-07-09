/* Coastline genome trainer — paired-seed evolution strategy with CI-gated promotion.
   Runs inside the eval scope set up by tests/trainer.js. Supersedes the retired
   train.js/train.body.js: the 10k-game null result showed naive mutation with
   105-game evals is winner's-curse noise, so this trainer is built around the
   project measurement standard instead.

   Usage (from repo root):
     node tests/trainer.js --state FILE.json [--seconds 30]   # start or resume training
     node tests/trainer.js --state FILE.json --status         # progress + history, no games
     node tests/trainer.js --state FILE.json --export CH.json # write current champion genome
     node tests/trainer.js --sanity                           # mechanics self-checks

   Design:
   - GENOME-SPACE (log-normal) ES. Each generation samples LAMBDA candidates around a
     search mean (multiplicative noise, genes floored at 0.01), evaluates every
     candidate against the reigning champion with PAIRED SEEDS and common random
     numbers (all candidates in a generation see the same seed block; each seed plays
     6 games — candidate solo in all 3 seats vs 2x champion, and the mirror). The
     mean moves to the geometric mean of the top MU candidates; step size adapts on
     the fraction of candidates that beat 50%.
   - CI-GATED PROMOTION. A generation's best candidate is only *confirmed* (fresh
     seeds, CONFIRM_SEEDS x 6 >= 1,000 games) if its search-eval CI already excludes
     50%; the champion is only replaced if the confirmation CI excludes 50% too.
     Selection optimism never touches the championship — that is the lesson of the
     10k-game null.
   - RESUMABLE. State (champion, ES state, per-candidate tallies) checkpoints to
     --state FILE after every seed block; --seconds bounds wall time per invocation,
     so long runs chunk across many short calls. Candidate sampling is derived
     deterministically from (generation, index), so a resumed run is bit-identical
     to an uninterrupted one.
   - Champion genomes live in the state file (--export to extract). Shipping a
     trained genome into index.html's AI_W stays a separate, ladder-gated change.
   - BROWSER TWIN: coastline/trainer.html runs the identical trainStep in a Web
     Worker for long unattended runs (leave a tab open overnight). Its exported
     state JSON is directly loadable here via --state, and vice versa.
*/
(function(){
  const lpath = require('path');

  /* ---------- CLI ---------- */
  const argv = process.argv.slice(2);
  const opts = { state:null, seconds:30, status:false, export:null, sanity:false };
  for(let i=0;i<argv.length;i++){
    const a = argv[i];
    if(a==='--state') opts.state = argv[++i];
    else if(a==='--seconds') opts.seconds = +argv[++i];
    else if(a==='--status') opts.status = true;
    else if(a==='--export') opts.export = argv[++i];
    else if(a==='--sanity') opts.sanity = true;
  }

  /* ---------- config ---------- */
  const LAMBDA = 8;            // candidates per generation
  const MU = 4;                // parents kept for the mean update
  const SEARCH_SEEDS = 50;     // paired seeds per candidate eval (x6 games = 300)
  const CONFIRM_SEEDS = 167;   // paired seeds for promotion gate (x6 = 1,002 games)
  const SIGMA0 = 0.15, SIGMA_MIN = 0.03, SIGMA_MAX = 0.5;
  const GENE_MIN = 0.01;
  const CONFIRM_SEED_BASE = 10000000; // confirmation seeds never overlap search seeds

  /* ---------- deterministic RNG ---------- */
  function mulberry32(seed){
    let s = (seed>>>0) + 0x9E3779B9;
    return function(){
      s |= 0; s = (s + 0x6D2B79F5)|0;
      let t = Math.imul(s ^ (s>>>15), 1|s);
      t = (t + Math.imul(t ^ (t>>>7), 61|t)) ^ t;
      return ((t ^ (t>>>14))>>>0) / 4294967296;
    };
  }
  function gauss(rand){ // Box–Muller
    let u = 0, v = 0;
    while(u===0) u = rand();
    while(v===0) v = rand();
    return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
  }

  /* ---------- game runner (paired seeds, genomes via tuneW) ---------- */
  const pump = ()=>{ let n=0; while(timers.length && n<20000){ const f=timers.shift(); try{f();}catch(e){} n++; } };
  const trueRandom = Math.random;
  function playGame(seed, genomes){ // genomes: [w0,w1,w2]
    timers.length = 0; // drain BOOT/previous-game callbacks — determinism depends on this
    Math.random = mulberry32(seed);
    newGame();
    G.players[0].isAI = true;
    for(let i=0;i<3;i++) G.players[i].tuneW = genomes[i];
    startTurn(); pump();
    let guard = 0;
    while(!G.over && guard<600){ if(timers.length){ pump(); } else { aiStep(cur()); pump(); } guard++; }
    Math.random = trueRandom;
    if(!G.over) return -1;
    return G.players.findIndex(p=>completeColors(p).length>=3);
  }
  // One paired seed block: 6 games, returns candidate/champion win counts.
  function seedBlock(seed, cand, champ){
    let cW = 0, kW = 0;
    for(const solo of [cand, champ]){
      const fill = solo===cand ? champ : cand;
      for(let seat=0; seat<3; seat++){
        const gs = [fill,fill,fill]; gs[seat] = solo;
        const w = playGame(seed, gs);
        if(w<0) continue;
        if(gs[w]===cand) cW++; else kW++;
      }
    }
    return {cW, kW};
  }

  /* ---------- stats (seed-clustered, mirrors ladder.body.js) ---------- */
  function clusterStat(perSeedValues){
    const xs = perSeedValues.filter(x=>x!=null);
    const n = xs.length;
    if(n<2) return { m:NaN, ci:NaN, n };
    const m = xs.reduce((a,b)=>a+b,0)/n;
    const v = xs.reduce((a,x)=>a+(x-m)*(x-m),0)/(n-1);
    return { m, ci: 1.96*Math.sqrt(v/n), n };
  }
  const pct = x => (x*100).toFixed(1)+'%';

  /* ---------- genome ops ---------- */
  const GENES = Object.keys(AI_W);
  const clone = w => JSON.parse(JSON.stringify(w));
  function sampleCandidate(mean, sigma, gen, k){ // deterministic in (gen,k) — resume-safe
    const rand = mulberry32(0x5EED ^ (gen*2654435761>>>0) ^ (k*40503));
    const g = {};
    GENES.forEach(key=>{ g[key] = +Math.max(GENE_MIN, mean[key]*Math.exp(sigma*gauss(rand))).toFixed(4); });
    return g;
  }
  function geoMean(genomes){
    const g = {};
    GENES.forEach(key=>{
      const m = Math.exp(genomes.reduce((s,x)=>s+Math.log(Math.max(GENE_MIN,x[key])),0)/genomes.length);
      g[key] = +m.toFixed(4);
    });
    return g;
  }

  /* ---------- state ---------- */
  function freshState(){
    return {
      config: {LAMBDA, MU, SEARCH_SEEDS, CONFIRM_SEEDS},
      champion: clone(AI_W), championAge: 0, promotions: 0,
      gen: 1, mean: clone(AI_W), sigma: SIGMA0,
      phase: 'search', candIdx: 0,
      candidates: [],           // [{genome, seedsDone, cW, kW, shares:[]}]
      confirm: null,            // {genome, seedsDone, cW, kW, shares:[]}
      history: [],              // per-generation summaries
      totalGames: 0,
    };
  }
  function load(){ return JSON.parse(fs.readFileSync(opts.state,'utf8')); }
  function save(S){ fs.writeFileSync(opts.state, JSON.stringify(S)); }
  function evalRec(genome){ return {genome, seedsDone:0, cW:0, kW:0, shares:[]}; }
  function stepEval(rec, seed, champ){ // one seed block into a running eval record
    const r = seedBlock(seed, rec.genome, champ);
    rec.cW += r.cW; rec.kW += r.kW;
    rec.shares.push((r.cW+r.kW)>0 ? r.cW/(r.cW+r.kW) : null);
    rec.seedsDone++;
  }
  const shareOf = rec => clusterStat(rec.shares);

  /* ---------- the training loop (time-budgeted, checkpointed) ----------
     trainStep advances the run by ONE unit (a seed block, a candidate hand-off, or a
     generation wrap-up) and is copied VERBATIM into coastline/trainer.html's worker
     core — any change here must be mirrored there to keep node/browser runs
     state-compatible and bit-identical. */
  function trainStep(S, logFn){
      if(S.phase==='search'){
        if(S.candidates.length===0){
          for(let k=0;k<LAMBDA;k++) S.candidates.push(evalRec(sampleCandidate(S.mean, S.sigma, S.gen, k)));
          S.candIdx = 0;
        }
        const rec = S.candidates[S.candIdx];
        if(rec.seedsDone < SEARCH_SEEDS){
          stepEval(rec, (S.gen-1)*SEARCH_SEEDS + rec.seedsDone, S.champion);
          S.totalGames += 6;
        } else if(S.candIdx < LAMBDA-1){
          S.candIdx++;
        } else {
          // generation complete: rank, ES update, maybe challenge
          const ranked = S.candidates.map(r=>({r, s:shareOf(r)})).sort((a,b)=>b.s.m-a.s.m);
          const best = ranked[0];
          S.mean = geoMean(ranked.slice(0,MU).map(x=>x.r.genome));
          // step-size rule: count only *significant* winners — under paired mirroring a
          // neutral candidate sits at ~50% by construction, so raw >50% counts would
          // inflate sigma in flat terrain (null rate of m-ci>0.5 is ~2.5%, target 20%)
          const beat = ranked.filter(x=>x.s.m - x.s.ci > 0.5).length/LAMBDA;
          S.sigma = Math.min(SIGMA_MAX, Math.max(SIGMA_MIN, S.sigma*Math.exp((beat-0.2)*0.6)));
          const sig = best.s.m - best.s.ci > 0.5;
          S.history.push({gen:S.gen, bestShare:+best.s.m.toFixed(4), bestCI:+best.s.ci.toFixed(4),
                          beatFrac:beat, sigma:+S.sigma.toFixed(4), challenged:sig, promoted:false});
          logFn('gen '+S.gen+': best share '+pct(best.s.m)+' ± '+pct(best.s.ci)+' over '+SEARCH_SEEDS+' seeds; '+
                      (sig ? 'CHALLENGE — confirming on fresh seeds' : 'champion holds (CI includes 50%)'));
          if(sig){ S.phase='confirm'; S.confirm = evalRec(clone(best.r.genome)); }
          else { S.gen++; S.candidates=[]; S.candIdx=0; S.championAge++; }
        }
      } else { // confirm
        const rec = S.confirm;
        if(rec.seedsDone < CONFIRM_SEEDS){
          stepEval(rec, CONFIRM_SEED_BASE + S.gen*CONFIRM_SEEDS + rec.seedsDone, S.champion);
          S.totalGames += 6;
        } else {
          const st = shareOf(rec);
          const win = st.m - st.ci > 0.5;
          const h = S.history[S.history.length-1];
          h.confirm = {share:+st.m.toFixed(4), ci:+st.ci.toFixed(4), games:CONFIRM_SEEDS*6};
          h.promoted = win;
          if(win){
            S.champion = clone(rec.genome); S.championAge = 0; S.promotions++;
            logFn('gen '+S.gen+': PROMOTED — confirmed '+pct(st.m)+' ± '+pct(st.ci)+' over '+(CONFIRM_SEEDS*6)+' fresh paired games');
          } else {
            S.championAge++;
            logFn('gen '+S.gen+': challenge REJECTED at confirmation — '+pct(st.m)+' ± '+pct(st.ci)+' (winner\'s curse caught by the gate)');
          }
          S.phase='search'; S.confirm=null; S.gen++; S.candidates=[]; S.candIdx=0;
        }
      }
  }
  function train(S, deadline){
    while(Date.now() < deadline){ trainStep(S, console.log); save(S); }
  }

  function status(S){
    console.log('gen '+S.gen+' | phase '+S.phase+
      (S.phase==='search' && S.candidates.length ? ' | candidate '+(S.candIdx+1)+'/'+LAMBDA+' seed '+S.candidates[S.candIdx].seedsDone+'/'+SEARCH_SEEDS : '')+
      (S.phase==='confirm' ? ' | confirm seed '+S.confirm.seedsDone+'/'+CONFIRM_SEEDS : '')+
      ' | sigma '+S.sigma.toFixed(3)+' | promotions '+S.promotions+' | champion age '+S.championAge+' gens | total games '+S.totalGames);
    S.history.slice(-8).forEach(h=>{
      console.log('  gen '+h.gen+': best '+pct(h.bestShare)+' ± '+pct(h.bestCI)+
        (h.challenged ? (h.confirm ? ' → confirm '+pct(h.confirm.share)+' ± '+pct(h.confirm.ci)+(h.promoted?' PROMOTED':' rejected') : ' → confirming…') : ''));
    });
  }

  /* ---------- sanity ---------- */
  function sanity(){
    let ok = true;
    const check = (name,cond)=>{ console.log((cond?'PASS':'FAIL')+' — '+name); if(!cond) ok=false; };
    // self-eval: identical genomes -> mirrored games -> share exactly 0.5 every seed
    const self = evalRec(clone(AI_W));
    for(let s=0;s<10;s++) stepEval(self, s, AI_W);
    const st = shareOf(self);
    check('self-eval share is exactly 50% with zero variance', Math.abs(st.m-0.5)<1e-9 && st.ci<1e-9);
    // deterministic sampling
    const a = sampleCandidate(AI_W, 0.15, 3, 5), b = sampleCandidate(AI_W, 0.15, 3, 5);
    check('candidate sampling deterministic in (gen, index)', JSON.stringify(a)===JSON.stringify(b));
    check('sampled candidate differs from mean', JSON.stringify(a)!==JSON.stringify(AI_W));
    // resume equivalence: 6 seeds straight vs 3+3 via JSON round-trip
    const g = sampleCandidate(AI_W, 0.2, 1, 0);
    const whole = evalRec(g); for(let s=0;s<6;s++) stepEval(whole, s, AI_W);
    let half = evalRec(g); for(let s=0;s<3;s++) stepEval(half, s, AI_W);
    half = JSON.parse(JSON.stringify(half)); for(let s=3;s<6;s++) stepEval(half, s, AI_W);
    check('checkpoint/resume is bit-identical to an uninterrupted run', JSON.stringify(whole)===JSON.stringify(half));
    process.exitCode = ok ? 0 : 1;
  }

  /* ---------- main ---------- */
  if(opts.sanity){ sanity(); return; }
  if(!opts.state){ console.error('trainer: --state FILE.json is required (or --sanity)'); process.exitCode=1; return; }
  let S = fs.existsSync(opts.state) ? load() : freshState();
  if(opts.export){ fs.writeFileSync(opts.export, JSON.stringify(S.champion,null,1)); console.log('champion genome -> '+opts.export+' ('+S.promotions+' promotions, gen '+S.gen+')'); return; }
  if(opts.status){ status(S); return; }
  const t0 = Date.now();
  train(S, t0 + opts.seconds*1000);
  save(S);
  console.log('— paused at '+((Date.now()-t0)/1000).toFixed(1)+'s —');
  status(S);
})();
