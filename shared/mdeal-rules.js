/* Infinite Table — the M Deal rulebook. THE canonical one.

   These rules lived in two places: here, and in joshelms43/infinite-ai, which trains
   brains against them. The copies drifted — rent ladders, property values, wild pairings
   and rent pairs all diverged from the official game, and nobody noticed until the lab
   audited them and the game had to be corrected to match (v0.10.0). Two copies of a spec
   is a bug generator. This is the copy. Both repos read it; a diff is now a diff, not an
   archaeology dig.

   Aligned 1:1 with official Monopoly Deal. Pinned by the economy census in tests/test.js.
   Pure: no DOM, no game state, no opinions. */
(function (global) {
  'use strict';

  var RULEBOOK = '2026-07-12-official';   // bump when the rules themselves change; both repos compare it

  const COLORS = {
    gold:  {label:'Yellow', hex:'#E8C63B', ink:'#24241D', size:2, rent:[3,8]},
    teal:  {label:'Teal',   hex:'#1FA8A0', size:3, rent:[2,4,7]},
    coral: {label:'Red',    hex:'#C8433A', size:3, rent:[2,3,6]},
    green: {label:'Blue',   hex:'#2E5EAA', size:2, rent:[1,2]},
    purple:{label:'Pink',   hex:'#DE559C', size:3, rent:[1,2,4]},
    orange:{label:'Orange', hex:'#F08A24', size:3, rent:[1,3,5]},
    brown: {label:'Brown',  hex:'#8A5A38', size:2, rent:[1,2]},
    sky:   {label:'Cyan',   hex:'#4FC3E8', ink:'#24241D', size:3, rent:[1,2,3]},
    sage:  {label:'Green',  hex:'#3F9142', size:3, rent:[2,4,6]},
    black: {label:'Black',  hex:'#2B2F33', size:4, rent:[1,2,3,4]},
  };
  const PROPS = [
    ['gold','',4],['gold','',4],
    ['teal','',4],['teal','',4],['teal','',4],
    ['coral','',3],['coral','',3],['coral','',3],
    ['green','',2],['green','',2],
    ['purple','',2],['purple','',2],['purple','',2],
    ['orange','',2],['orange','',2],['orange','',2],
    ['brown','',1],['brown','',1],
    ['sky','',1],['sky','',1],['sky','',1],
    ['sage','',3],['sage','',3],['sage','',3],
    ['black','',2],['black','',2],
    ['black','',2],['black','',2],
  ];
  const ACTIONS = {
    takeover:{n:'Hostile Takeover', d:'Steal a complete set from any player', v:5, c:2},
    nodeal:  {n:'No Deal!',         d:'Cancel an action played against you',  v:4, c:3},
    swipe:   {n:'Sneaky Swipe',     d:'Steal a property (not from a complete set)', v:3, c:3},
    swap:    {n:'Swap Meet',        d:'Swap one of your properties with another player\'s', v:3, c:3},
    favour:  {n:'Call In a Favour', d:'One player pays you $5M', v:3, c:3},
    shout:   {n:'Shout a Round',    d:'Every player pays you $2M', v:2, c:3},
    payday:  {n:'Payday',           d:'Draw 2 extra cards', v:1, c:10},
    granny:  {n:'Granny Flat',      d:'+$3M rent on a complete set (not Transport)', v:3, c:3},
    resort:  {n:'Beach Resort',     d:'+$4M rent on a set with a Granny Flat', v:4, c:2},
    hike:    {n:'Rent Hike',        d:'Play with a Rent card to double it', v:1, c:2},
  };
  const MONEY = [[1,6],[2,5],[3,3],[4,3],[5,2],[10,1]];
  const DUAL_WILDS = [
    [['gold','teal'],4,1],      // Dark Blue / Green
    [['teal','black'],4,1],     // Green / Railroad
    [['sky','black'],4,1],      // Light Blue / Railroad
    [['green','black'],2,1],    // Utility / Railroad
    [['sky','brown'],1,1],      // Light Blue / Brown
    [['orange','purple'],2,2],  // Pink / Orange
    [['coral','sage'],3,2],     // Red / Yellow
  ];
  const RENT_DUALS = [['gold','teal'],['black','green'],['brown','sky'],['orange','purple'],['coral','sage']];

  let CID = 0;
  function mk(c){ c.id = ++CID; return c; }
  function buildDeck(){
    CID = 0;   // the catalog is canonical: card N is card N in every build, forever
    const d = [];
    PROPS.forEach(([color,name,v]) => d.push(mk({t:'prop', color, name, v})));
    DUAL_WILDS.forEach(([colors,v,count]) => { for(let i=0;i<count;i++) d.push(mk({t:'wild', colors:[...colors], v})); });
    for(let i=0;i<2;i++) d.push(mk({t:'wildall', v:0}));
    MONEY.forEach(([v,count]) => { for(let i=0;i<count;i++) d.push(mk({t:'money', v})); });
    Object.entries(ACTIONS).forEach(([kind,a]) => { for(let i=0;i<a.c;i++) d.push(mk({t:'action', kind, v:a.v})); });
    RENT_DUALS.forEach(colors => { for(let i=0;i<2;i++) d.push(mk({t:'rent', colors:[...colors], v:1})); });
    for(let i=0;i<3;i++) d.push(mk({t:'rentall', v:3}));
    return d;
  }

  function buildable(color){ return color!=='black' && color!=='green'; }   // no houses on Stations or Utilities

  var api = {
    RULEBOOK: RULEBOOK,
    COLORS: COLORS, PROPS: PROPS, ACTIONS: ACTIONS, MONEY: MONEY,
    DUAL_WILDS: DUAL_WILDS, RENT_DUALS: RENT_DUALS,
    mk: mk, buildDeck: buildDeck, buildable: buildable,
  };
  Object.keys(api).forEach(function (k) { global[k] = api[k]; });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
