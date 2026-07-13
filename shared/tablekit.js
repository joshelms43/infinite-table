/* Infinite Table — tablekit v1.0.0
   The platform layer every game sits on: credentials, the Supabase client, the
   player key, room codes, and a connected channel that fails out loud.

   Both M Deal and Mafia hand-rolled this separately, and the second copy shipped
   a bug the first one didn't have (it asked for a credential global that never
   existed, and every phone stranded on it). One implementation, one place to fix.

   Games own their rules. The kit owns the plumbing. */
(function (global) {
  'use strict';

  // The anon key is public by design — it ships to every browser that loads the site.
  // Baked in as a fallback so no cache state, script order, or config-global naming
  // can strand a phone. That failure has happened; it doesn't get to happen twice.
  var FALLBACK_URL = 'https://spkhqgzgnzeeizxrycjq.supabase.co';
  var FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwa2hxZ3pnbnplZWl6eHJ5Y2pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1ODE1MzEsImV4cCI6MjA5OTE1NzUzMX0.dMdqx-KJ7uXEKwln2SSdCDi-N9QBRo5aSJyQTjL8Pv4';

  var TableKit = {
    version: '1.0.0',

    /* Accepts either config global that has ever existed, then falls back. */
    credentials: function () {
      return {
        url: global.SUPABASE_URL || FALLBACK_URL,
        anon: global.SUPABASE_ANON || global.SUPABASE_ANON_KEY || FALLBACK_ANON,
      };
    },

    sdk: async function () {
      if (global.supabase) return global.supabase;
      await new Promise(function (res, rej) {
        var sc = document.createElement('script');
        sc.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        sc.onload = res;
        sc.onerror = function () { rej(new Error('the network blocked the Supabase library')); };
        document.head.appendChild(sc);
      });
      if (!global.supabase) throw new Error('the Supabase library loaded but came up empty');
      return global.supabase;
    },

    client: async function () {
      if (this._client) return this._client;
      var sdk = await this.sdk();
      var c = this.credentials();
      this._client = sdk.createClient(c.url, c.anon);
      return this._client;
    },

    /* One identity across every game on the platform. */
    pkey: function () {
      if (this._pkey) return this._pkey;
      var k = null;
      try { k = localStorage.getItem('it_pkey'); } catch (e) {}
      if (!k) {
        k = Math.random().toString(36).slice(2, 10);
        try { localStorage.setItem('it_pkey', k); } catch (e) {}
      }
      this._pkey = k;
      return k;
    },

    /* No I, O, 0 or 1 — codes get read aloud across a table. */
    roomCode: function () {
      var A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', c = '';
      for (var i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
      return c;
    },

    /* Join a room. Resolves to a tx handle, or throws with a reason a human can read. */
    join: async function (opts) {
      var sb = await this.client();
      var key = this.pkey();
      var ch = sb.channel(opts.prefix + '-' + opts.code, {
        config: { broadcast: { self: false }, presence: { key: key } },
      });
      (opts.events || []).forEach(function (ev) {
        ch.on('broadcast', { event: ev }, function (p) {
          if (opts.onMessage) opts.onMessage(ev, (p && p.payload) || {});
        });
      });
      if (opts.onPresence) {
        ['sync', 'join', 'leave'].forEach(function (ev) {
          ch.on('presence', { event: ev }, function () { opts.onPresence(ev); });
        });
      }
      var status = await new Promise(function (res) {
        var to = setTimeout(function () { res('TIMED_OUT'); }, opts.timeoutMs || 8000);
        ch.subscribe(function (st) {
          if (st === 'SUBSCRIBED') { clearTimeout(to); res(true); }
          if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') { clearTimeout(to); res(st); }
        });
      });
      if (status !== true) throw new Error('could not reach the table (' + status + ')');

      var tx = {
        key: key,
        send: function (type, payload) { ch.send({ type: 'broadcast', event: type, payload: payload }); },
        track: function (m) { ch.track(m); },
        presence: function () { return ch.presenceState(); },
        alive: function () { return ch.state === 'joined'; },   // a suspended socket lies still and smiles
        close: function () { try { ch.unsubscribe(); } catch (e) {} },
        _ch: ch,
      };
      if (opts.meta) tx.track(opts.meta);
      return tx;
    },

    /* Presence snapshots arrive keyed and duplicated. This is the one true seat list. */
    seatsFrom: function (presence, cap) {
      var seen = {}, list = [];
      try {
        Object.keys(presence || {}).forEach(function (k) {
          (presence[k] || []).forEach(function (m) {
            if (m && m.key && !seen[m.key]) { seen[m.key] = 1; list.push(m); }
          });
        });
      } catch (e) {}
      list.sort(function (a, b) {
        return (b.host ? 1 : 0) - (a.host ? 1 : 0) || String(a.key).localeCompare(String(b.key));
      });
      return cap ? list.slice(0, cap) : list;
    },
  };

  global.TableKit = TableKit;
  if (typeof module !== 'undefined' && module.exports) module.exports = TableKit;
})(typeof window !== 'undefined' ? window : globalThis);
