/* Infinite Table — the pass, the ratings maths and the cosmetics catalog.

   One place for everything the home screen and the games must agree on:
   which games are on the home screen, what the bots are rated, how Elo moves,
   how much XP a game pays, and what each tier of each month's pass unlocks.

   The database (supabase/home.sql) is the authority for ratings and XP; the
   numbers here mirror it so screens can show what will happen, and
   tests/passsim.js fails the gate if the two disagree.

   An item's id is `season:tier` — '2026-12:5'. You own it if your XP in that
   season reaches that tier, and it stays yours after the month ends because
   the XP row does. Nothing here touches the DOM except the two helpers at
   the bottom that read what is equipped from this device.

   Pure data and maths. No network. */
(function (global) {
  'use strict';

  var XP = { finish: 30, win: 30, dailyWin: 60, perTier: 100, tiers: 30 };
  var ELO = { k: 32, start: 1000, floor: 100 };
  var FIRST_SEASON = '2026-12';        /* the first pass opens early, in late November */

  var GAMES = {
    settlers: { name: 'Settlers', path: 'settlers', seats: [2, 4] },
    deal:     { name: 'Deal',     path: 'coastline', seats: [2, 4] }
  };
  var GAME_ORDER = ['settlers', 'deal'];

  /* the bots hold real accounts with fixed ratings */
  var BOTS = {
    bazza:  { id: 'ba22a000-0000-4000-8000-000000000001', name: 'Bazza',  kind: 'builder',  style: 'Builder',  rating: { settlers: 1200, deal: 1100 } },
    shazza: { id: '5a22a000-0000-4000-8000-000000000002', name: 'Shazza', kind: 'trader',   style: 'Trader',   rating: { settlers: 1100, deal: 1100 } },
    davo:   { id: 'da70a000-0000-4000-8000-000000000003', name: 'Davo',   kind: 'expander', style: 'Expander', rating: { settlers: 1050, deal: 1100 } }
  };
  var SETTLERS_BOTS = ['bazza', 'shazza', 'davo'];   /* seated strongest first */
  function botByKind(kind) {
    for (var k in BOTS) if (BOTS[k].kind === kind) return BOTS[k];
    return null;
  }
  function botById(id) {
    for (var k in BOTS) if (BOTS[k].id === id) return BOTS[k];
    return null;
  }

  var SLOTS = {
    avatar:   { n: 'Avatar',        scope: 'account' },
    frame:    { n: 'Frame',         scope: 'account' },
    banner:   { n: 'Banner',        scope: 'account' },
    title:    { n: 'Title',         scope: 'account' },
    s_color:  { n: 'Colour',        scope: 'settlers' },
    s_dice:   { n: 'Dice',          scope: 'settlers' },
    s_island: { n: 'Island',        scope: 'settlers' },
    s_robber: { n: 'Robber',        scope: 'settlers' },
    d_felt:   { n: 'Table',         scope: 'deal' },
    d_back:   { n: 'Card Back',     scope: 'deal' }
  };
  var SLOT_ORDER = ['avatar', 'frame', 'banner', 'title', 's_color', 's_dice', 's_island', 's_robber', 'd_felt', 'd_back'];

  /* ---------- drawing vocabulary for avatars: 24×24, drawn in currentColor ---------- */
  var S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  var ART = {
    pelican: '<ellipse cx="9.5" cy="15.6" rx="5.6" ry="4.2" fill="currentColor"/><path d="M12.6 13.4c1-2.6 1-4.4 2.2-6" ' + S + ' stroke-width="3"/>' +
      '<circle cx="15.6" cy="6.6" r="2.7" fill="currentColor"/><path d="M17.4 5.2l5.2 2.1-4.9 3.3z" fill="currentColor"/>' +
      '<path d="M8 19.6v2.2M11 19.6v2.2" ' + S + ' stroke-width="1.6"/>',
    crab: '<ellipse cx="12" cy="14.6" rx="6" ry="4.2" fill="currentColor"/><path d="M7 12.4L4.8 9.4M17 12.4l2.2-3" ' + S + '/>' +
      '<path d="M2.6 8.6a2.6 2.6 0 0 1 4.6-1.4L4.8 9.4zM21.4 8.6a2.6 2.6 0 0 0-4.6-1.4l2.4 2.2z" fill="currentColor"/>' +
      '<path d="M10 10.6V8.2M14 10.6V8.2M6.6 16.6l-2.4 1.6M17.4 16.6l2.4 1.6M8 18.2l-1.4 2.2M16 18.2l1.4 2.2" ' + S + ' stroke-width="1.7"/>',
    lighthouse: '<path d="M9.4 21.2L10.7 9.6h2.6l1.3 11.6z" fill="currentColor"/><rect x="10.1" y="5.6" width="3.8" height="3.4" rx=".6" fill="currentColor"/>' +
      '<path d="M9.2 5.6L12 2.6l2.8 3z" fill="currentColor"/><path d="M15.6 7.2l5.6-1.8M15.6 7.6l5.6 1.8M8.4 7.2L2.8 5.4M8.4 7.6L2.8 9.4" ' + S + ' stroke-width="1.5" opacity=".7"/>' +
      '<path d="M7.2 21.4h9.6" ' + S + '/>',
    anchor: '<circle cx="12" cy="5" r="2.2" ' + S + '/><path d="M12 7.2V20M8.2 10.4h7.6M4.6 13.6c.4 4.2 3.6 6.4 7.4 6.4s7-2.2 7.4-6.4" ' + S + '/>' +
      '<path d="M3 15.6l1.6-3 2.2 2.4zM21 15.6l-1.6-3-2.2 2.4z" fill="currentColor"/>'
  };

  /* ---------- the tracks: one per month, thirty tiers each ---------- */
  var TRACKS = {
    '2026-12': {
      name: 'Coastline',
      items: [
        { slot: 'avatar',   name: 'Pelican',        art: 'pelican', bg: '#7FD0E0', fg: '#12384A' },
        { slot: 's_dice',   name: 'Driftwood',      a: { bg: '#D9B98A', pip: '#4A3320' }, b: { bg: '#8A5A36', pip: '#F6E7CF' } },
        { slot: 'd_felt',   name: 'Lagoon',         felt: '#15434A', hi: '#1F5C63', night: '#0B262B' },
        { slot: 'title',    name: 'Beachcomber',    text: 'Beachcomber' },
        { slot: 's_color',  name: 'Teal',           fill: '#18B3A4', edge: '#0A5B54' },
        { slot: 'd_back',   name: 'Shell',          css: 'radial-gradient(circle at 50% 108%, #F4D9C6 0 18%, #E7B79A 18% 34%, #D9977A 34% 50%, #C87C63 50% 66%, #B5664F 66% 100%)', ink: '#FFF4EA' },
        { slot: 'frame',    name: 'Rope',           css: 'outline:3px dashed #D8B26E;outline-offset:2px' },
        { slot: 's_robber', name: 'Gull',           kind: 'gull' },
        { slot: 'd_felt',   name: 'Sunset',         felt: '#4A2530', hi: '#6A3440', night: '#28131A' },
        { slot: 'avatar',   name: 'Crab',           art: 'crab', bg: '#FFB199', fg: '#7A1F12' },
        { slot: 's_dice',   name: 'Sea Glass',      a: { bg: '#CFF1E6', pip: '#1D5B55' }, b: { bg: '#3FA79B', pip: '#F1FFFB' } },
        { slot: 'd_back',   name: 'Swell',          css: 'repeating-radial-gradient(circle at 50% 120%, #1E6C8C 0 9px, #2A86A8 9px 18px)', ink: '#EAF8FF' },
        { slot: 'banner',   name: 'Tide',           css: 'linear-gradient(90deg,#14506B,#1F8A8F)' },
        { slot: 's_color',  name: 'Coral',          fill: '#FF7A66', edge: '#8F2E22' },
        { slot: 's_island', name: 'Dusk',
          terr: { timber: { fill: '#2E5E55', hi: '#3A7267', ink: '#1C3F39' }, clay: { fill: '#A6563F', hi: '#B96A52', ink: '#70352A' },
                  wool: { fill: '#6F9E6B', hi: '#83B07E', ink: '#4A7347' }, grain: { fill: '#C9A04A', hi: '#D8B35F', ink: '#8E6E2A' },
                  ore: { fill: '#6F7890', hi: '#838CA4', ink: '#4A5168' }, desert: { fill: '#BFA98A', hi: '#CDB99C', ink: '#8D7A5E' } },
          ocean: ['#3B4C8A', '#27346B', '#131A3D'], sand: '#C9B596', token: '#EFE6D2' },
        { slot: 'd_felt',   name: 'Midnight',       felt: '#1B2140', hi: '#2A3160', night: '#0D1024' },
        { slot: 'title',    name: 'Merchant',       text: 'Merchant' },
        { slot: 'avatar',   name: 'Lighthouse',     art: 'lighthouse', bg: '#FFE08A', fg: '#7A2B1B' },
        { slot: 's_dice',   name: 'Neon',           a: { bg: '#15182E', pip: '#5CF2C8' }, b: { bg: '#15182E', pip: '#FF6FB0' } },
        { slot: 's_robber', name: 'Storm',          kind: 'storm' },
        { slot: 'd_back',   name: 'Compass',        css: 'conic-gradient(from 0deg at 50% 50%, #F2C14E 0 12.5%, #1F3A4D 0 25%, #F2C14E 0 37.5%, #1F3A4D 0 50%, #F2C14E 0 62.5%, #1F3A4D 0 75%, #F2C14E 0 87.5%, #1F3A4D 0)', ink: '#FFFFFF' },
        { slot: 'frame',    name: 'Gold',           css: 'box-shadow:0 0 0 2px #0D2230,0 0 0 4px #F2C14E,0 0 0 6px #0D2230,0 0 0 7.5px #F2C14E' },
        { slot: 's_color',  name: 'Sand',           fill: '#E9C46A', edge: '#7A5A14' },
        { slot: 'banner',   name: 'Ember',          css: 'linear-gradient(90deg,#B4472F,#E08A3C)' },
        { slot: 'avatar',   name: 'Anchor',         art: 'anchor', bg: '#A9C4FF', fg: '#14275C' },
        { slot: 'd_felt',   name: 'Sandbar',        felt: '#5A4A2C', hi: '#77633B', night: '#322814' },
        { slot: 'title',    name: 'Harbour Master', text: 'Harbour Master' },
        { slot: 's_color',  name: 'Ink',            fill: '#3A4354', edge: '#0E1218' },
        { slot: 'd_back',   name: 'Sunburst',       css: 'repeating-conic-gradient(from 0deg at 50% 100%, #F2994A 0 10deg, #F2C14E 10deg 20deg)', ink: '#5A2A0A' },
        { slot: 's_island', name: 'Tropics',
          terr: { timber: { fill: '#2FA36B', hi: '#3DB87C', ink: '#1B7049' }, clay: { fill: '#E27A4F', hi: '#EE8F66', ink: '#A84E2C' },
                  wool: { fill: '#B4E06A', hi: '#C4EC82', ink: '#7FAB3C' }, grain: { fill: '#FFD257', hi: '#FFDE7A', ink: '#C59A22' },
                  ore: { fill: '#9AA7BD', hi: '#AEB9CC', ink: '#69768D' }, desert: { fill: '#FBE9BF', hi: '#FFF3D6', ink: '#CDB680' } },
          ocean: ['#3FD3D8', '#1FA9C4', '#0E6E96'], sand: '#FFF1CF', token: '#FFFDF4' }
      ]
    }
  };

  /* ---------- seasons and tiers ---------- */
  /* a Brisbane calendar month (UTC+10, no daylight saving) */
  function seasonOf(ms) {
    var d = new Date((ms == null ? Date.now() : ms) + 10 * 3600 * 1000);
    var key = d.toISOString().slice(0, 7);
    return key < FIRST_SEASON ? FIRST_SEASON : key;
  }
  function seasonName(season) {
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var m = +String(season).slice(5, 7);
    return MONTHS[m - 1] || '';
  }
  function tierOf(xp) { return Math.max(0, Math.min(XP.tiers, Math.floor((xp || 0) / XP.perTier))); }
  /* how far through the current tier, 0–1 (1 once the pass is finished) */
  function tierProgress(xp) {
    if (tierOf(xp) >= XP.tiers) return 1;
    return ((xp || 0) % XP.perTier) / XP.perTier;
  }
  /* what one finished game pays one person */
  function gameXp(won, humans, firstWinToday) {
    var xp = XP.finish + (won ? XP.win : 0);
    if (humans < 2) xp = Math.floor(xp / 2);
    return xp + (won && firstWinToday ? XP.dailyWin : 0);
  }

  /* ---------- Elo, as the database plays it ----------
     seats: [{elo, fixed}], winner: index. The winner meets each loser on the
     ratings they sat down with; a fixed rating takes part and never moves. */
  function eloResult(seats, winner) {
    var out = seats.map(function (s) { return s.elo; });
    var we = seats[winner].elo, gain = 0;
    seats.forEach(function (s, i) {
      if (i === winner) return;
      var ea = 1 / (1 + Math.pow(10, (s.elo - we) / 400));
      var d = Math.round(ELO.k * (1 - ea));
      gain += d;
      if (!s.fixed) out[i] = Math.max(ELO.floor, s.elo - d);
    });
    if (!seats[winner].fixed) out[winner] = we + gain;
    return out;
  }

  /* ---------- items ---------- */
  var ID_RE = /^(\d{4}-\d{2}):(\d{1,2})$/;
  function item(id) {
    var m = ID_RE.exec(String(id || ''));
    if (!m) return null;
    var track = TRACKS[m[1]], tier = +m[2];
    if (!track || tier < 1 || tier > track.items.length) return null;
    var src = track.items[tier - 1], out = { id: m[1] + ':' + tier, season: m[1], tier: tier };
    for (var k in src) out[k] = src[k];
    return out;
  }
  function track(season) {
    var t = TRACKS[season];
    if (!t) return null;
    return { season: season, name: t.name, items: t.items.map(function (_, i) { return item(season + ':' + (i + 1)); }) };
  }
  /* progress: {season: xp} */
  function owns(progress, id) {
    var m = ID_RE.exec(String(id || ''));
    if (!m) return false;
    var tier = +m[2];
    return tier >= 1 && tier <= XP.tiers && ((progress && progress[m[1]]) || 0) >= tier * XP.perTier;
  }
  function owned(progress) {
    var out = [];
    Object.keys(TRACKS).sort().forEach(function (season) {
      track(season).items.forEach(function (it) { if (owns(progress, it.id)) out.push(it); });
    });
    return out;
  }
  /* the same answer the database gives set_loadout */
  function checkLoadout(loadout, progress) {
    if (!loadout || typeof loadout !== 'object' || Array.isArray(loadout)) return { ok: false, err: 'shape' };
    for (var slot in loadout) {
      if (!SLOTS[slot]) return { ok: false, err: 'slot', slot: slot };
      var v = loadout[slot], m = ID_RE.exec(String(v));
      if (typeof v !== 'string' || !m || +m[2] < 1 || +m[2] > XP.tiers) return { ok: false, err: 'item', item: v };
      if (!owns(progress, v)) return { ok: false, err: 'locked', item: v };
    }
    return { ok: true };
  }
  /* what a slot is wearing: the item, or null for the default. An item filed
     under the wrong slot wears nothing. */
  function wearing(loadout, slot) {
    var it = item(loadout && loadout[slot]);
    return it && it.slot === slot ? it : null;
  }

  /* ---------- this device's copy of the loadout, for the games ---------- */
  var KEY = 'it_loadout';
  function saved() {
    try { return JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) || '{}') || {}; } catch (e) { return {}; }
  }
  function save(loadout) {
    try { localStorage.setItem(KEY, JSON.stringify(loadout || {})); } catch (e) {}
  }
  function equipped(slot) { return wearing(saved(), slot); }

  /* an avatar as markup: the equipped art, or the first letter of the name */
  function avatarHtml(loadout, name, size) {
    var a = wearing(loadout, 'avatar'), f = wearing(loadout, 'frame');
    size = size || 40;
    var letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
    var inner = a
      ? '<svg viewBox="0 0 24 24" width="' + Math.round(size * 0.68) + '" height="' + Math.round(size * 0.68) + '" aria-hidden="true">' + ART[a.art] + '</svg>'
      : letter.replace(/[<>&"]/g, '');
    return '<span class="av" style="width:' + size + 'px;height:' + size + 'px;flex:0 0 ' + size + 'px;font-size:' + Math.round(size * 0.44) + 'px;' +
      'background:' + (a ? a.bg : '#F2C14E') + ';color:' + (a ? a.fg : '#0D2230') + ';' + (f ? f.css : '') + '">' + inner + '</span>';
  }

  var api = {
    XP: XP, ELO: ELO, FIRST_SEASON: FIRST_SEASON, GAMES: GAMES, GAME_ORDER: GAME_ORDER,
    BOTS: BOTS, SETTLERS_BOTS: SETTLERS_BOTS, botByKind: botByKind, botById: botById,
    SLOTS: SLOTS, SLOT_ORDER: SLOT_ORDER, TRACKS: TRACKS, ART: ART,
    seasonOf: seasonOf, seasonName: seasonName, tierOf: tierOf, tierProgress: tierProgress, gameXp: gameXp,
    eloResult: eloResult, item: item, track: track, owns: owns, owned: owned,
    checkLoadout: checkLoadout, wearing: wearing, saved: saved, save: save, equipped: equipped, avatarHtml: avatarHtml
  };
  global.Pass = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
