/* Duel — the powerup rulebook. Version stamped below.
   Every powerup is a pure mutation of a stats sheet; the game simulates whatever
   the sheet says. The sheet is the single source of truth for both players and
   for the CI gate, which applies all of them in every order it can afford. */
(function (global) {
  'use strict';

  var CATALOG_VERSION = '2026-07-21-duel-r1';

  function baseStats() {
    return {
      /* body */
      hp: 100, regen: 0, regenDelay: 2,
      moveSpeed: 6.5, jumpPower: 8.2, extraJumps: 0, fallFactor: 1,
      dashCharges: 0, dashTeleport: false, floorBounce: false,
      scale: 1, shieldStart: 0, shieldRegen: 0, thorns: 0,
      deflect: 0, secondWind: false, adrenaline: false,
      /* gun */
      damage: 16, fireRate: 3.2, magSize: 8, reloadTime: 1.1, noReload: false,
      bulletSpeed: 30, bulletSize: 0.12, bulletCount: 1, spread: 0.012,
      crit: 0, firstShotBonus: 0, lastShotBonus: 0,
      /* bullet behaviour */
      bounces: 0, keepSpeedOnBounce: false, phase: false,
      bulletGravity: 0, homing: 0, knockback: 2,
      explosionRadius: 0, clusterCount: 0,
      splitCount: 0, boomerang: false, pull: false,
      bulletStyle: 'default',
      /* on-hit effects */
      lifesteal: 0, poison: 0, poisonDur: 0, burn: 0, burnDur: 0,
      slowOnHit: 0, slowDur: 0, blindDur: 0
    };
  }

  /* id, name, text (what it does — content, not decoration), apply(s) */
  var POWERUPS = [
    /* ---- offence ---- */
    { id: 'heavy', name: 'Heavy Rounds', text: '+45% damage, −20% fire rate',
      apply: function (s) { s.damage *= 1.45; s.fireRate *= 0.8; } },
    { id: 'rapid', name: 'Rapid Fire', text: '+45% fire rate, −15% damage',
      apply: function (s) { s.fireRate *= 1.45; s.damage *= 0.85; } },
    { id: 'buckshot', name: 'Buckshot', text: 'Fire 5 pellets in a wide spray, each −55% damage',
      apply: function (s) { s.bulletCount += 4; s.spread += 0.075; s.damage *= 0.45; } },
    { id: 'twin', name: 'Twin Barrel', text: 'Fire one extra bullet',
      apply: function (s) { s.bulletCount += 1; s.spread += 0.02; } },
    { id: 'slug', name: 'Big Slugs', text: '+80% bullet size, +25% damage, −25% bullet speed',
      apply: function (s) { s.bulletSize *= 1.8; s.damage *= 1.25; s.bulletSpeed *= 0.75; } },
    { id: 'needle', name: 'Needles', text: '+60% bullet speed, tiny bullets, +10% damage',
      apply: function (s) { s.bulletSpeed *= 1.6; s.bulletSize *= 0.6; s.damage *= 1.1; } },
    { id: 'longbarrel', name: 'Long Barrel', text: '+35% bullet speed, +15% damage',
      apply: function (s) { s.bulletSpeed *= 1.35; s.damage *= 1.15; } },
    { id: 'akimbo', name: 'Akimbo', text: '+1 bullet, +25% fire rate, −20% damage, looser aim',
      apply: function (s) { s.bulletCount += 1; s.fireRate *= 1.25; s.damage *= 0.8; s.spread += 0.03; } },
    { id: 'lucky', name: 'Lucky Shot', text: '25% chance any hit lands double',
      apply: function (s) { s.crit += 0.25; } },
    { id: 'overcharge', name: 'Overcharge', text: 'First shot of every mag hits +100%',
      apply: function (s) { s.firstShotBonus += 1; } },
    { id: 'lastcall', name: 'Last Call', text: 'Final shot of every mag hits +150%',
      apply: function (s) { s.lastShotBonus += 1.5; } },
    { id: 'marksman', name: 'Marksman', text: '+70% damage, −45% fire rate, dead-straight aim',
      apply: function (s) { s.damage *= 1.7; s.fireRate *= 0.55; s.spread *= 0.2; } },

    /* ---- bullet behaviour ---- */
    { id: 'bounce', name: 'Bouncy Bullets', text: 'Bullets bounce off walls twice',
      apply: function (s) { s.bounces += 2; } },
    { id: 'superball', name: 'Super Ball', text: '+4 bounces and bullets never slow down',
      apply: function (s) { s.bounces += 4; s.keepSpeedOnBounce = true; } },
    { id: 'phantom', name: 'Phantom Rounds', text: 'Bullets pass straight through walls, −25% damage',
      apply: function (s) { s.phase = true; s.damage *= 0.75; } },
    { id: 'homing', name: 'Homing Rounds', text: 'Bullets steer toward your opponent',
      apply: function (s) { s.homing += 1.6; } },
    { id: 'bloodhound', name: 'Bloodhound', text: 'Bullets hunt hard, −25% damage',
      apply: function (s) { s.homing += 3.4; s.damage *= 0.75; } },
    { id: 'mortar', name: 'Mortar', text: 'Bullets arc under gravity and hit +50% harder',
      apply: function (s) { s.bulletGravity += 14; s.damage *= 1.5; s.bulletSpeed *= 0.85; } },
    { id: 'grenadier', name: 'Grenadier', text: 'Bullets explode on impact, −15% fire rate',
      apply: function (s) { s.explosionRadius += 1.6; s.fireRate *= 0.85; } },
    { id: 'shortfuse', name: 'Short Fuse', text: 'Explosions, and 80% bigger ones',
      apply: function (s) { s.explosionRadius = (s.explosionRadius || 1.0) * 1.8; } },
    { id: 'cluster', name: 'Cluster Bomb', text: 'Explosions throw out 5 shrapnel pellets',
      apply: function (s) { s.explosionRadius = s.explosionRadius || 1.2; s.clusterCount += 5; } },
    { id: 'split', name: 'Banana Split', text: 'Bullets split into three mid-flight',
      apply: function (s) { s.splitCount += 2; } },
    { id: 'boomerang', name: 'Boomerang', text: 'Bullets fly back to you; catch one to refund it',
      apply: function (s) { s.boomerang = true; } },
    { id: 'gravitywell', name: 'Gravity Well', text: 'Hits drag your opponent toward the impact',
      apply: function (s) { s.pull = true; s.knockback *= 0.5; } },
    { id: 'chicken', name: 'Chicken Rounds', text: 'Bullets are chickens. Big, bouncy, +30% damage',
      apply: function (s) { s.bulletStyle = 'chicken'; s.bulletSize *= 2.2; s.bounces += 1;
        s.damage *= 1.3; s.bulletSpeed *= 0.8; } },

    /* ---- on-hit ---- */
    { id: 'frost', name: 'Frost Rounds', text: 'Hits slow your opponent 40% for 1.5s',
      apply: function (s) { s.slowOnHit = Math.max(s.slowOnHit, 0.4); s.slowDur = Math.max(s.slowDur, 1.5); } },
    { id: 'venom', name: 'Venom', text: 'Hits poison for 8/s over 3s',
      apply: function (s) { s.poison += 8; s.poisonDur = Math.max(s.poisonDur, 3); } },
    { id: 'incendiary', name: 'Incendiary', text: 'Hits burn for 6/s over 2s',
      apply: function (s) { s.burn += 6; s.burnDur = Math.max(s.burnDur, 2); } },
    { id: 'flash', name: 'Flashbang Rounds', text: 'Hits white out their screen for a beat',
      apply: function (s) { s.blindDur = Math.max(s.blindDur, 0.7); } },
    { id: 'riot', name: 'Riot Rounds', text: 'Triple knockback on every hit',
      apply: function (s) { s.knockback *= 3; } },
    { id: 'leech', name: 'Leech Rounds', text: 'Heal for 35% of the damage you deal',
      apply: function (s) { s.lifesteal += 0.35; } },

    /* ---- body ---- */
    { id: 'tank', name: 'Tank', text: '+60 max HP, −12% move speed',
      apply: function (s) { s.hp += 60; s.moveSpeed *= 0.88; } },
    { id: 'glass', name: 'Glass Cannon', text: '+70% damage, −40 max HP',
      apply: function (s) { s.damage *= 1.7; s.hp -= 40; } },
    { id: 'regen', name: 'Regeneration', text: 'Recover 5 HP/s after 2s out of the fight',
      apply: function (s) { s.regen += 5; } },
    { id: 'aegis', name: 'Aegis', text: 'Start every round with 50 shield',
      apply: function (s) { s.shieldStart += 50; } },
    { id: 'battery', name: 'Battery', text: 'Shield, and it recharges after 3s quiet',
      apply: function (s) { s.shieldStart = Math.max(s.shieldStart, 30); s.shieldRegen += 12; } },
    { id: 'thorns', name: 'Thorns', text: 'Attackers take 30% of the damage back',
      apply: function (s) { s.thorns += 0.3; } },
    { id: 'pocket', name: 'Pocket Size', text: '30% smaller, +10% move speed',
      apply: function (s) { s.scale *= 0.7; s.moveSpeed *= 1.1; } },
    { id: 'unit', name: 'Absolute Unit', text: '30% bigger, +60 max HP, +15% damage',
      apply: function (s) { s.scale *= 1.3; s.hp += 60; s.damage *= 1.15; } },
    { id: 'deflector', name: 'Deflector', text: '25% chance incoming bullets glance off',
      apply: function (s) { s.deflect += 0.25; } },
    { id: 'secondwind', name: 'Second Wind', text: 'Once per round, survive a killing blow on 1 HP',
      apply: function (s) { s.secondWind = true; } },

    /* ---- mobility ---- */
    { id: 'sprinter', name: 'Sprinter', text: '+25% move speed',
      apply: function (s) { s.moveSpeed *= 1.25; } },
    { id: 'moonboots', name: 'Moon Boots', text: '+45% jump and you fall slower',
      apply: function (s) { s.jumpPower *= 1.45; s.fallFactor *= 0.6; } },
    { id: 'doublejump', name: 'Double Jump', text: 'One extra jump in the air',
      apply: function (s) { s.extraJumps += 1; } },
    { id: 'airshow', name: 'Air Show', text: 'Two extra jumps in the air',
      apply: function (s) { s.extraJumps += 2; } },
    { id: 'dash', name: 'Dash', text: 'Shift to dash. 2s cooldown',
      apply: function (s) { s.dashCharges = Math.max(s.dashCharges, 1); } },
    { id: 'blink', name: 'Blink', text: 'Your dash becomes a short teleport',
      apply: function (s) { s.dashCharges = Math.max(s.dashCharges, 1); s.dashTeleport = true; } },
    { id: 'castle', name: 'Bouncy Castle', text: 'Land hard and you bounce',
      apply: function (s) { s.floorBounce = true; } },
    { id: 'adrenaline', name: 'Adrenaline', text: '+30% move and fire rate below 40 HP',
      apply: function (s) { s.adrenaline = true; } },

    /* ---- ammo ---- */
    { id: 'mag', name: 'Extended Mag', text: '+6 rounds in the mag',
      apply: function (s) { s.magSize += 6; } },
    { id: 'quickhands', name: 'Quick Hands', text: 'Reload 50% faster',
      apply: function (s) { s.reloadTime *= 0.5; } },
    { id: 'beltfeed', name: 'Belt Feed', text: 'Never reload again, −20% fire rate',
      apply: function (s) { s.noReload = true; s.fireRate *= 0.8; } },
    { id: 'sugarrush', name: 'Sugar Rush', text: '+12% move, fire and reload speed',
      apply: function (s) { s.moveSpeed *= 1.12; s.fireRate *= 1.12; s.reloadTime *= 0.88; } }
  ];

  var BY_ID = {};
  POWERUPS.forEach(function (p) { BY_ID[p.id] = p; });

  /* the sheet must stay playable no matter what gets stacked on it */
  function finalize(s) {
    s.hp = Math.max(10, s.hp);
    s.damage = Math.max(1, s.damage);
    s.fireRate = Math.min(12, Math.max(0.5, s.fireRate));
    s.magSize = Math.max(1, Math.round(s.magSize));
    s.reloadTime = Math.min(3, Math.max(0.15, s.reloadTime));
    s.bulletSpeed = Math.min(90, Math.max(6, s.bulletSpeed));
    s.bulletSize = Math.min(0.9, Math.max(0.03, s.bulletSize));
    s.bulletCount = Math.min(9, Math.max(1, Math.round(s.bulletCount)));
    s.spread = Math.min(0.3, Math.max(0, s.spread));
    s.moveSpeed = Math.min(14, Math.max(2.5, s.moveSpeed));
    s.jumpPower = Math.min(16, Math.max(4, s.jumpPower));
    s.scale = Math.min(2.2, Math.max(0.45, s.scale));
    s.knockback = Math.min(30, Math.max(0, s.knockback));
    s.homing = Math.min(6, s.homing);
    s.crit = Math.min(0.9, s.crit);
    s.deflect = Math.min(0.6, s.deflect);
    s.explosionRadius = Math.min(4, s.explosionRadius);
    return s;
  }

  function statsFor(pickIds) {
    var s = baseStats();
    (pickIds || []).forEach(function (id) {
      var p = BY_ID[id];
      if (p) p.apply(s);
    });
    return finalize(s);
  }

  /* deal 3 the player doesn't already own; deterministic under a seeded rng */
  function deal(ownedIds, rng) {
    rng = rng || Math.random;
    var owned = {};
    (ownedIds || []).forEach(function (id) { owned[id] = 1; });
    var pool = POWERUPS.filter(function (p) { return !owned[p.id]; }).map(function (p) { return p.id; });
    var out = [];
    while (out.length < 3 && pool.length) {
      var i = Math.floor(rng() * pool.length);
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }

  /* a tiny seeded rng so host-dealt drafts replay identically everywhere */
  function seededRng(seed) {
    var x = (seed >>> 0) || 1;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }

  var api = {
    CATALOG: CATALOG_VERSION,
    POWERUPS: POWERUPS,
    byId: function (id) { return BY_ID[id] || null; },
    baseStats: baseStats,
    statsFor: statsFor,
    deal: deal,
    seededRng: seededRng
  };

  global.DuelPowerups = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
