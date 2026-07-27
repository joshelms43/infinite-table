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

    /* Silence is the enemy — it always has been here. An uncaught error used to freeze a
       phone with no explanation, and the only diagnostic was a screenshot of a stuck game.
       Now a failure says its own name, and remembers it. */
    watchErrors: function (opts) {
      opts = opts || {};
      var say = opts.onError || function () {};
      var seen = {};
      function record(kind, msg, where) {
        msg = String((msg && msg.message) || msg || 'unknown error').slice(0, 200);
        var now = Date.now();
        if (seen[msg] && now - seen[msg] < 4000) return;   // one voice, not a chorus
        seen[msg] = now;
        var all = [];
        try {
          var raw = JSON.parse(localStorage.getItem('it_errors') || '[]');
          if (Array.isArray(raw)) all = raw;
        } catch (e) { all = []; }   // a poisoned ledger must not swallow the error that follows it
        try {
          all.unshift({
            t: new Date().toISOString(), kind: kind, msg: msg,
            where: String(where || '').slice(0, 120),
            game: opts.game || '', v: opts.version || '',
          });
          localStorage.setItem('it_errors', JSON.stringify(all.slice(0, 12)));
        } catch (e) {}
        try { console.error('[' + kind + '] ' + msg + ' ' + (where || '')); } catch (e) {}
        say(msg);
      }
      if (global.addEventListener) {
        global.addEventListener('error', function (e) {
          record('error', e && (e.message || e.error), e && e.filename
            ? String(e.filename).split('/').pop() + ':' + e.lineno : '');
        });
        global.addEventListener('unhandledrejection', function (e) {
          record('promise', (e && (e.reason || e.detail)) || 'rejected', '');
        });
      }
      this._record = record;   // so a game can report its own swallowed errors
      return this;
    },
    errors: function () {
      try {
        var a = JSON.parse(localStorage.getItem('it_errors') || '[]');
        return Array.isArray(a) ? a : [];
      } catch (e) { return []; }
    },
    clearErrors: function () { try { localStorage.removeItem('it_errors'); } catch (e) {} },

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

/* ===== ident: real sender authentication for an open channel =====
   Supabase broadcasts carry NO sender identity — payload only — and presence keys
   are public strings, so "check the sender's key" is theater: anyone on the channel
   can claim any seat (the puppeting hole). The only honest fix on this transport is
   cryptographic: each device holds a persistent P-256 keypair, announces the PUBLIC
   half, and signs what it sends; the host verifies against the seat's registered
   key and refuses replays by counter. */
TableKit.ident = {
  _priv: null, _pub: null,
  async keys(){
    if(this._pub && this._priv) return this._pub;
    let j = null; try{ j = JSON.parse(localStorage.getItem('it_sig')||'null'); }catch(e){}
    try{
      if(j && j.pub && j.priv){
        this._priv = await crypto.subtle.importKey('jwk', j.priv, {name:'ECDSA', namedCurve:'P-256'}, true, ['sign']);
        this._pub = j.pub;
        return this._pub;
      }
    }catch(e){ /* stored pair unreadable: mint fresh */ }
    const kp = await crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, true, ['sign','verify']);
    const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
    const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
    try{ localStorage.setItem('it_sig', JSON.stringify({pub:pub, priv:priv})); }catch(e){}
    this._priv = kp.privateKey; this._pub = pub;
    return pub;
  },
  pub(){ return this._pub || null; },
  _b64(buf){ var u=new Uint8Array(buf), s=''; for(var i=0;i<u.length;i++) s+=String.fromCharCode(u[i]); return btoa(s); },
  _unb64(str){ var bin=atob(str), u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; },
  _syncSigner: null,   // tests may install { sign(fields)->str, verify(pub,fields,str)->bool }; production leaves this null
  sign(fields){        // NOT async: an async fn always wraps its return in a Promise, defeating the sync test seam.
    if(this._syncSigner) return this._syncSigner.sign(fields);   // returns a string -> callers send in-line
    const data = new TextEncoder().encode(JSON.stringify(fields));
    return crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, this._priv, data).then(sig=>this._b64(sig));   // returns a Promise
  },
  verify(pubJwk, fields, sigB64){   // NOT async, same reason: sync signer -> boolean in-line; real path -> Promise<boolean>
    if(this._syncSigner) return this._syncSigner.verify(pubJwk, fields, sigB64);
    return crypto.subtle.importKey('jwk', pubJwk, {name:'ECDSA', namedCurve:'P-256'}, true, ['verify'])
      .then(key=>crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, key, this._unb64(sigB64), new TextEncoder().encode(JSON.stringify(fields))))
      .catch(()=>false);
  }
};
