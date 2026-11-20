/* Infinite Table — the account, without a screen.

   The small set of reads and writes the home screen and the games share:
   who is signed in, ratings per game, pass progress, what is equipped, and
   reporting a finished game. No DOM, no markup — pages draw; this fetches.

   It shares one Supabase client with shared/identity.js when that is loaded
   (Deal, the home screen), and makes its own otherwise (Settlers). Sign-in
   itself stays in identity.js; a session made there is visible here because
   Supabase keeps it in this origin's storage.

   Everything fails soft. A guest, a dropped connection, or a database that
   has not had supabase/home.sql run yet all read as "nothing to show" — and
   `Account.missing` says when it is the last of those, so the home screen
   can say so instead of showing zeros that look real. */
var Account = {
  sb: null, user: null, missing: false,

  async ensure() {
    if (this.sb) return this.sb;
    if (typeof ID !== 'undefined' && ID.ensureSB) { this.sb = await ID.ensureSB(); return this.sb; }
    if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL || !SUPABASE_ANON) return null;
    if (!window.supabase) {
      await new Promise(function (res, rej) {
        var sc = document.createElement('script');
        sc.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        sc.onload = res; sc.onerror = function () { rej(new Error('cdn')); };
        document.head.appendChild(sc);
      });
    }
    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    return this.sb;
  },

  /* the signed-in user, or null for a guest */
  async session() {
    try {
      var sb = await this.ensure();
      if (!sb) return null;
      var s = await sb.auth.getSession();
      var session = s && s.data && s.data.session;
      this.user = session && session.user && !session.user.is_anonymous ? session.user : null;
      return this.user;
    } catch (e) { this.user = null; return null; }
  },

  _gone(err) {
    /* the table or function is not there: home.sql has not been run */
    var m = (err && (err.message || '')) + ' ' + (err && (err.code || ''));
    if (/PGRST20[25]|42P01|42883|does not exist|Could not find/i.test(m)) { this.missing = true; return true; }
    return false;
  },

  /* {userId: {deal: {elo, games, wins}, settlers: {...}}} */
  async ratings(ids) {
    var out = {};
    try {
      var sb = await this.ensure();
      if (!sb || !ids || !ids.length) return out;
      var r = await sb.from('ratings').select('user_id,game,elo,games,wins,fixed').in('user_id', ids);
      if (r.error) { this._gone(r.error); return out; }
      (r.data || []).forEach(function (row) {
        (out[row.user_id] = out[row.user_id] || {})[row.game] = { elo: row.elo, games: row.games, wins: row.wins, fixed: row.fixed };
      });
    } catch (e) {}
    return out;
  },

  /* {season: xp} for one player */
  async progress(id) {
    var out = {};
    try {
      var sb = await this.ensure();
      if (!sb || !id) return out;
      var r = await sb.from('pass_progress').select('season,xp').eq('user_id', id);
      if (r.error) { this._gone(r.error); return out; }
      (r.data || []).forEach(function (row) { out[row.season] = row.xp; });
    } catch (e) {}
    return out;
  },

  /* {userId: loadout} */
  async loadouts(ids) {
    var out = {};
    try {
      var sb = await this.ensure();
      if (!sb || !ids || !ids.length) return out;
      var r = await sb.from('profiles').select('id,loadout').in('id', ids);
      if (r.error) { this._gone(r.error); return out; }
      (r.data || []).forEach(function (row) { out[row.id] = row.loadout || {}; });
    } catch (e) {}
    return out;
  },

  async setLoadout(loadout) {
    try {
      var sb = await this.ensure();
      if (sb && !this.user) await this.session();    /* signed in elsewhere on this page, or since we last looked */
      if (!sb || !this.user) return { ok: false, err: 'guest' };
      var r = await sb.rpc('set_loadout', { p: loadout });
      if (r.error) { return { ok: false, err: this._gone(r.error) ? 'missing' : 'failed' }; }
      return r.data || { ok: false, err: 'failed' };
    } catch (e) { return { ok: false, err: 'offline' }; }
  },

  /* report a finished game; the database answers with what actually changed:
     {ok, before, after, delta, xp, bonus, xp_total, season} */
  async record(game, players, winner, rounds) {
    try {
      var sb = await this.ensure();
      if (sb && !this.user) await this.session();    /* signed in elsewhere on this page, or since we last looked */
      if (!sb || !this.user) return { ok: false, err: 'guest' };
      var r = await sb.rpc('record_result', { p_game: game, p_players: players, p_winner: winner, p_rounds: rounds | 0 });
      if (r.error) { return { ok: false, err: this._gone(r.error) ? 'missing' : 'failed' }; }
      return r.data || { ok: false, err: 'failed' };
    } catch (e) { return { ok: false, err: 'offline' }; }
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = Account;
