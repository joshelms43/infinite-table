/* ================= IDENTITY (v0.4.0): accounts, friends, invites, stats, elo ================= */
/* Infinite Table — shared identity: accounts, friends, invites, stats, elo.
   Host page must provide: $, banner, sfx, haptic, openSheet, closeSheet, toggleReveal.
   NET is optional (game pages only); without it, invites deep-link into Coastline. */
const ID = {
  sb: null, user: null, profile: null, friends: [], ready: false,
  myName_(){
    return (typeof NET!=='undefined' && NET.myName)
      || (typeof localStorage!=='undefined' && localStorage.getItem && localStorage.getItem('it_name'))
      || '';
  },

  async ensureSB(){
    if(this.sb) return this.sb;
    if(!SUPABASE_URL || !SUPABASE_ANON) return null;
    if(!window.supabase){
      await new Promise((res,rej)=>{ const sc=document.createElement('script'); sc.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'; sc.onload=res; sc.onerror=()=>rej(new Error('cdn')); document.head.appendChild(sc); });
    }
    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    return this.sb;
  },

  makeFriendCode(){ const A='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c=''; for(let i=0;i<6;i++) c+=A[Math.floor(Math.random()*A.length)]; return c; },

  fail(step, err){
    this.lastError = step + ': ' + ((err && (err.message||err.error_description)) || String(err||'unknown'));
    try{ console.error('[identity]', this.lastError, err); }catch(e){}
    try{ banner(('PROFILE — '+this.lastError).toUpperCase().slice(0,60), 'var(--danger-red)'); }catch(e){}
    this.renderProfile();
    if(this.sheetOpen) this.renderProfileSheet();
  },
  async init(){
    try{
      const sb = await this.ensureSB();
      if(!sb){ this.fail('config', 'no supabase keys'); return; }
      let sess = await sb.auth.getSession();
      let session = sess && sess.data && sess.data.session;
      if(!session){
        // signed out is a normal state now — accounts require username+password
        this.user = null; this.profile = null; this.friends = [];
        this.ready = true; this.lastError = null;
        this.renderProfile();
        if(this.sheetOpen) this.renderProfileSheet();
        return;
      }
      this.user = session.user;
      const sel = await sb.from('profiles').select('id,name,elo,games,wins').eq('id', this.user.id).maybeSingle();
      if(sel.error){ this.fail('profile read', sel.error); return; }
      let prof = sel.data;
      if(!prof){
        const name = (this.uname() || this.myName_() || 'Player').slice(0,12);
        const ins = await sb.from('profiles').insert({ id:this.user.id, name, friend_code:this.makeFriendCode() });
        if(ins.error){ this.fail('profile create', ins.error); return; }
        const r2 = await sb.from('profiles').select('id,name,elo,games,wins').eq('id', this.user.id).maybeSingle();
        if(r2.error){ this.fail('profile re-read', r2.error); return; }
        prof = r2.data;
      }
      if(!prof){ this.fail('profile', 'row missing after create'); return; }
      if(prof){
        const { data: code } = await sb.rpc('my_friend_code');
        prof.friend_code = code || '——————';
      }
      this.profile = prof;
      if(prof && prof.name && typeof NET!=='undefined') NET.myName = prof.name;
      this.ready = true;
      this.renderProfile();
      this.loadFriends();
      this.listenInvites();
      this.lastError = null;
    }catch(e){ this.fail('unexpected', e); }
  },

  async saveName(name){
    name = (name||'').slice(0,12).trim() || 'Player';
    if(typeof NET!=='undefined') NET.myName = name;
    if(typeof localStorage!=='undefined' && localStorage.setItem) localStorage.setItem('it_name', name);
    if(this.sb && this.user){
      await this.sb.from('profiles').update({ name }).eq('id', this.user.id);
      if(this.profile) this.profile.name = name;
      this.renderProfile();
    }
  },

  renderProfile(){
    const mini = $('#profmini');
    if(mini && mini.innerHTML!==undefined){
      if(this.profile){
        const nm = this.profile.name || 'Player';
        mini.innerHTML = `<span class="avatar" style="background:var(--money-gold);color:var(--table-night)">${nm[0]}</span>
          <span>${nm}</span><span class="minelo">· ${this.profile.elo}</span><span style="opacity:.5">›</span>`;
      } else {
        mini.innerHTML = `<span class="avatar" style="background:var(--felt-highlight)">?</span><span>Sign In</span><span style="opacity:.5">›</span>`;
      }
    }
    if(this.sheetOpen) this.renderProfileSheet();
    const el = $('#profcard'); if(!el || el.innerHTML===undefined) return;
    if(!this.profile){
      const nm = this.myName_() || 'Player';
      el.innerHTML = `<div class="profrow"><span class="avatar profav" style="background:var(--felt-highlight)">${nm[0]}</span>
        <div class="profinfo"><div class="profname" onclick="ID.editName()">${nm} <span style="opacity:.35;font-size:12px">✎</span></div><div class="profsub">Playing offline — stats connect online</div></div></div>`;
      return;
    }
    const p = this.profile;
    const losses = Math.max(0, p.games - p.wins);
    el.innerHTML = `<div class="profrow">
      <span class="avatar profav" style="background:var(--money-gold);color:var(--table-night)">${(p.name||'?')[0]}</span>
      <div class="profinfo">
        <div class="profname" onclick="ID.editName()">${p.name} <span style="opacity:.35;font-size:12px">✎</span></div>
        <div class="profsub">${p.wins}W · ${losses}L &nbsp;·&nbsp; code <b class="fcode" onclick="event.stopPropagation();ID.copyCode()">${p.friend_code}</b></div>
      </div>
      <span class="elochip">${p.elo}<small>ELO</small></span>
    </div>`;
    const fc = $('#friendcount'); if(fc && fc.textContent!==undefined) fc.textContent = this.friends.length ? '('+this.friends.length+')' : '';
  },
  /* `why` is shown above the fields when the sheet was opened by something
     the player was trying to do, rather than by tapping the profile chip. */
  openProfile(why){
    this.sheetOpen = true;
    this.gateWhy = why || null;
    this.renderProfileSheet();
  },

  /* A successful sign-in or registration resumes whatever was interrupted. The
     host page owns what that was; this only announces that it can proceed. */
  _announceReady(){
    this.gateWhy = null;
    try{ if(typeof accountReady === 'function') accountReady(); }catch(e){}
  },
  renderProfileSheet(){
    const p = this.profile;
    const nm = (p && p.name) || this.myName_() || 'Player';
    const stats = p ? `<div class="sheetstat">
        <div class="stat"><b>${p.elo}</b><span>Elo</span></div>
        <div class="stat"><b>${p.wins}</b><span>Wins</span></div>
        <div class="stat"><b>${Math.max(0,p.games-p.wins)}</b><span>Losses</span></div>
      </div>
      <div class="coderow"><span>Friend code</span><b class="fcode" onclick="ID.copyCode()">${p.friend_code}</b></div>` : `<div class="sub" style="margin:8px 0">Playing offline — stats and friends connect automatically when online.${this.lastError?`<br><span style="color:var(--danger-red)">Last attempt — ${this.lastError}</span>`:''}</div>
      <button class="homebtn" style="width:100%;margin-top:6px" onclick="ID.init()">Connect</button>`;
    const friendsBlock = p ? `<div class="zone-label" style="margin-top:14px">Friends</div>
      <div id="friendlist">${this._friendRows()}</div>
      <div class="joinrow" style="margin-top:8px">
        <input id="friendcode" maxlength="6" placeholder="FRIEND CODE" autocomplete="off" style="width:150px;letter-spacing:2px">
        <button class="homebtn" style="flex:1" onclick="ID.addFriend()">Add</button>
      </div>` : '';
    if(!this.profile){
      openSheet(`<h3>${this.gateWhy ? 'Sign In To Play' : 'Profile'}</h3>
        ${this.gateWhy ? `<div class="sub" style="margin:0 0 14px">${this.gateWhy}</div>` : ''}
        <div class="zone-label">Table name</div>
        <input class="namefield" maxlength="12" value="${nm}" onchange="ID.saveName(this.value)" placeholder="Your name" style="margin-top:0">
        <div class="zone-label" style="margin-top:14px">Account</div>
        <div class="onlinebox">
          <input id="acctuser" class="namefield" maxlength="16" placeholder="username" autocomplete="off" style="margin-top:0">
          <input id="acctpass" class="namefield" type="password" maxlength="40" placeholder="password" autocomplete="new-password">
          <div class="homerow" style="margin-top:8px">
            <button class="homebtn" onclick="ID.register(this)">Create Account</button>
            <button class="homebtn" onclick="ID.signIn(this)">Sign In</button>
          </div>
          ${this.lastError ? `<div class="sub" style="margin-top:8px;color:var(--danger-red)">${this.lastError}</div>` : ''}
        </div>
        <button class="optbtn" style="margin-top:14px" onclick="ID.gateWhy=null;ID.sheetOpen=false;closeSheet()">Done</button>`);
      return;
    }
    const acct = `<div class="coderow"><span>Signed in as <b>@${this.uname()||''}</b></span><b class="fcode" onclick="ID.signOut()">Sign Out</b></div>`;
    openSheet(`<h3>Profile</h3>
      <input class="namefield" maxlength="12" value="${nm}" onchange="ID.saveName(this.value)" placeholder="Your name">
      ${stats}
      ${acct}
      ${friendsBlock}
      <button class="optbtn" style="margin-top:14px" onclick="ID.sheetOpen=false;closeSheet()">Done</button>`);
  },
  _friendRows(){
    return (this.friends||[]).map(f=>`
      <div class="friendrow">
        <span class="avatar" style="background:var(--felt-highlight)">${(f.name||'?')[0]}</span>
        <span class="frname">${f.name}</span>
        <span class="frelo">${f.elo}</span>
        <button class="frinvite" onclick="ID.sheetOpen=false;closeSheet();ID.invite('${f.id}')">Invite</button>
        <button class="frremove" onclick="ID.removeFriend('${f.id}')">✕</button>
      </div>`).join('') || '';
  },
  editName(){
    const nameEl = document.querySelector('#profcard .profname');
    if(!nameEl || !nameEl.innerHTML===undefined) return;
    const cur = (this.profile && this.profile.name) || this.myName_() || 'Player';
    nameEl.innerHTML = `<input class="nameedit" maxlength="12" value="${cur}">`;
    const inp = nameEl.querySelector('input');
    if(!inp) return;
    inp.focus(); inp.select && inp.select();
    const commit = ()=>{ this.saveName(inp.value); this.renderProfile(); };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') inp.blur(); });
  },
  uname(){
    return (this.user && !this.user.is_anonymous && this.user.email) ? this.user.email.split('@')[0] : null;
  },
  sanitizeU(u){ return String(u||'').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,16); },
  _busyBtn(btn, on){ if(btn && btn.classList){ btn.classList.toggle('busy', !!on); btn.disabled = !!on; } },
  async register(btn){
    if(this._authing) return; this._authing = true; this._busyBtn(btn, true);
    try{ await this._register(); } finally { this._authing = false; this._busyBtn(btn, false); }
  },
  /* Registration NEVER touches auth.signUp(). That endpoint mails a
     confirmation link, and the built-in SMTP allows two per hour — which is
     exactly the wall sign-up kept hitting. The Edge Function below mints the
     account with the admin API instead: pre-confirmed, no mail, no ceiling.
     tests/identitysim.js fails the gate if a mailing call ever reappears. */
  REGISTER_URL(){ return SUPABASE_URL + '/functions/v1/register'; },

  /* Turn a failed registration into something a human can act on. The old
     code collapsed every cause into "SIGN UP: FAILED", which is why a
     function that was never deployed looked identical to a wrong password. */
  _authFault(status, out){
    const err = (out && out.err) || '';
    if(err === 'taken')       return ['USERNAME TAKEN', 'that username is already registered'];
    if(err === 'username')    return ['USERNAME: 3+ LETTERS', 'username too short'];
    if(err === 'password')    return ['PASSWORD: 6+ CHARACTERS', 'password too short'];
    if(err === 'serverconfig')return ['SERVER NOT CONFIGURED', 'the register function has no service-role key'];
    if(err === 'throttled')   return ['TOO MANY SIGNUPS', 'too many accounts made in the last hour'];
    if(err === 'nobackend')   return ['SIGN UP NOT INSTALLED', 'run supabase/accounts.sql in the Supabase SQL editor'];
    if(status === 404)        return ['SIGN UP OFFLINE', 'the register function is not deployed on Supabase'];
    if(status === 401 || status === 403) return ['SIGN UP REJECTED', 'Supabase refused the anon key (JWT verification)'];
    if(status === 429)        return ['TOO MANY TRIES', 'rate limited — wait a minute'];
    if(status === 0)          return ['NO CONNECTION', 'could not reach Supabase at all'];
    return ['SIGN UP FAILED', 'server said ' + status + (err ? ' / ' + err : '')];
  },

  /* PostgREST says this specific thing when the SQL function was never
     installed, which is different from the function running and refusing. */
  _rpcMissing(err){
    const c = (err && err.code) || '';
    const m = ((err && err.message) || '').toLowerCase();
    return c === 'PGRST202' || c === '404'
        || m.indexOf('could not find the function') >= 0
        || m.indexOf('schema cache') >= 0;
  },

  /* Two ways to mint an account, both server-side, neither able to send mail.

     The SQL function is tried first because it installs from the Supabase SQL
     editor, which needs no terminal. The Edge Function does the same job and
     is the supported path, but it only deploys from the dashboard's Functions
     page — a step that is easy to miss, and missing it was the whole bug.

     Whichever answers, the shape coming back is the same. */
  async _mint(sb, u, pw){
    const rpc = await sb.rpc('create_account', { p_username: u, p_password: pw });
    if(!rpc.error){
      const out = rpc.data;
      if(out && out.ok) return { ok:true, via:'sql', out };
      return { ok:false, via:'sql', status:200, out };
    }
    if(!this._rpcMissing(rpc.error)){
      return { ok:false, via:'sql', status:500, out:{ err:'sql', detail:rpc.error.message } };
    }

    let status = 0, out = null;
    try{
      const res = await fetch(this.REGISTER_URL(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON },
        body: JSON.stringify({ username: u, password: pw }),
      });
      status = res.status;
      try{ out = await res.json(); }catch(e){ out = null; }
      if(res.ok && out && out.ok) return { ok:true, via:'edge', out };
    }catch(e){ status = 0; }

    // Neither is installed: name the one that is easiest to install.
    if(status === 404) return { ok:false, via:'none', status:404, out:{ err:'nobackend' } };
    return { ok:false, via:'edge', status, out };
  },

  async _register(){
    const u = this.sanitizeU(($('#acctuser')||{}).value);
    const pw = (($('#acctpass')||{}).value)||'';
    if(u.length<3){ banner('USERNAME: 3+ LETTERS','var(--danger-red)'); return; }
    if(pw.length<6){ banner('PASSWORD: 6+ CHARACTERS','var(--danger-red)'); return; }
    const sb = await this.ensureSB();
    if(!sb){ this.fail('config', 'no supabase keys'); return; }

    const r = await this._mint(sb, u, pw);
    if(!r.ok){
      const [msg, why] = this._authFault(r.status, r.out);
      this.lastError = 'sign up — ' + why;
      try{ console.error('[identity] register', r.via, r.status, r.out); }catch(_){}
      banner(msg, 'var(--danger-red)');
      if(this.sheetOpen) this.renderProfileSheet();
      return;
    }

    const s2 = await sb.auth.signInWithPassword({ email: u+'@coastline.game', password: pw });
    if(s2.error || !s2.data || !s2.data.session){
      this.lastError = 'account made, sign-in failed';
      banner('CREATED — NOW SIGN IN','var(--warning-amber)');
      if(this.sheetOpen) this.renderProfileSheet();
      return;
    }
    this.user = s2.data.session.user; this.profile = null;
    await this.init();
    banner('ACCOUNT CREATED','var(--success-green)');
    this.renderProfileSheet();
    this._announceReady();
  },
  async signIn(btn){
    if(this._authing) return; this._authing = true; this._busyBtn(btn, true);
    try{ await this._signIn(); } finally { this._authing = false; this._busyBtn(btn, false); }
  },
  async _signIn(){
    const u = this.sanitizeU(($('#acctuser')||{}).value);
    const pw = (($('#acctpass')||{}).value)||'';
    if(!u || !pw){ banner('USERNAME + PASSWORD','var(--danger-red)'); return; }
    const sb = await this.ensureSB();
    if(!sb){ this.fail('config', 'no supabase keys'); return; }
    try{
      const { data, error } = await sb.auth.signInWithPassword({ email: u+'@coastline.game', password: pw });
      if(error || !data || !data.user){
        // "Invalid login credentials" is the ordinary case; anything else is
        // infrastructure, and saying so saves an hour of guessing.
        const m = (error && error.message) || 'no session';
        const creds = /invalid login|credentials/i.test(m);
        this.lastError = 'sign in — ' + (creds ? 'wrong username or password' : m.slice(0,80));
        banner(creds ? 'WRONG USERNAME OR PASSWORD' : 'SIGN IN: ' + m.toUpperCase().slice(0,40), 'var(--danger-red)');
        if(this.sheetOpen) this.renderProfileSheet();
        return;
      }
      this.user = data.user; this.profile = null; this.friends = [];
      await this.init();
      banner('WELCOME BACK','var(--success-green)');
      this.renderProfileSheet();
      this._announceReady();
    }catch(e){
      this.lastError = 'sign in — could not reach Supabase';
      banner('NO CONNECTION','var(--danger-red)');
      if(this.sheetOpen) this.renderProfileSheet();
    }
  },
  async signOut(){
    try{ await this.sb.auth.signOut(); }catch(e){}
    this.user=null; this.profile=null; this.friends=[]; this.ready=false;
    await this.init();
    this.renderProfileSheet();
  },
  copyCode(){
    try{ navigator.clipboard && navigator.clipboard.writeText(this.profile.friend_code); banner('CODE COPIED','var(--gold-money)'); }catch(e){}
  },

  async loadFriends(){
    if(!this.sb || !this.user) return;
    const uid = this.user.id;
    const { data: rows } = await this.sb.from('friends').select('a,b').or(`a.eq.${uid},b.eq.${uid}`);
    const ids = [...new Set((rows||[]).map(r=> r.a===uid ? r.b : r.a))];
    if(!ids.length){ this.friends=[]; this.renderFriends(); return; }
    const { data: profs } = await this.sb.from('profiles').select('id,name,elo').in('id', ids);
    this.friends = profs || [];
    this.renderFriends();
    const fc = $('#friendcount'); if(fc && fc.textContent!==undefined) fc.textContent = this.friends.length ? '('+this.friends.length+')' : '';
  },
  renderFriends(){
    const el = $('#friendlist');
    if(el && el.innerHTML!==undefined) el.innerHTML = this._friendRows();
    if(this.sheetOpen) this.renderProfileSheet();
  },
  async removeFriend(id){
    if(!this.sb) return;
    await this.sb.rpc('remove_friend', { p_id: id });
    this.loadFriends();
  },
  async addFriend(){
    const inp = $('#friendcode'); const code = ((inp&&inp.value)||'').toUpperCase().trim();
    if(code.length!==6){ banner('6-LETTER CODE','var(--danger-red)'); return; }
    if(!this.sb || !this.user) return;
    const { data: r } = await this.sb.rpc('add_friend', { p_code: code });
    if(!r || !r.ok){
      banner(r && r.err==='self' ? "THAT'S YOU" : 'CODE NOT FOUND', r && r.err==='self' ? 'var(--warning-amber)' : 'var(--danger-red)');
      return;
    }
    if(inp) inp.value='';
    banner('ADDED '+String(r.name||'').toUpperCase(),'var(--success-green)');
    this.loadFriends();
  },

  /* --- invites: personal realtime channel per user --- */
  listenInvites(){
    if(!this.sb || !this.user) return;
    const ch = this.sb.channel('user-'+this.user.id, { config:{ broadcast:{ self:false } } });
    ch.on('broadcast', { event:'invite' }, ({payload})=>{
      const m = payload || {};
      const t = document.createElement('div');
      t.className = 'invitetoast';
      t.innerHTML = `<span><b>${m.from||'A mate'}</b> invited you to a game</span><button onclick="ID.acceptInvite('${m.code}',this)">Join</button>`;
      t.addEventListener('pointerdown', e=>{ if(e.target.tagName!=='BUTTON') t.remove(); });
      document.body.appendChild(t);
      sfx('alert'); haptic([8,40,8]);
      setTimeout(()=>{ if(t.parentNode) t.remove(); }, 20000);
    });
    ch.subscribe();
  },
  async invite(friendId){
    if(!this.sb) return;
    if(typeof NET==='undefined'){ location.href = './coastline/?invite='+friendId; return; }
    if(NET.mode!=='lobby-host'){
      await NET.hostGame();
      if(NET.mode!=='lobby-host') return;
    }
    const ch = this.sb.channel('user-'+friendId);
    await new Promise(res=>ch.subscribe(st=>{ if(st==='SUBSCRIBED') res(); }));
    ch.send({ type:'broadcast', event:'invite', payload:{ from:this.profile? this.profile.name : this.myName_(), code: NET.code } });
    banner('INVITE SENT','var(--gold-money)');
    setTimeout(()=>{ try{ this.sb.removeChannel(ch); }catch(e){} }, 3000);
  },
  acceptInvite(code, btn){
    const toast = btn && btn.closest ? btn.closest('.invitetoast') : null;
    if(toast) toast.remove();
    if(typeof NET==='undefined'){ location.href = './coastline/?join='+code; return; }
    const jc = $('#joincode'); if(jc && jc.value!==undefined) jc.value = code;
    const h=$('#home'); if(h&&h.classList) h.classList.add('show');
    NET.joinGame();
  },

  /* --- the bots are players too ---

     Bazza and Shazza hold real accounts, seeded once by supabase/accounts.sql
     with these fixed ids. They are rated like anyone else: beating them pays,
     losing to them costs. The ids live here and in that file, and nowhere
     else — the client resolves a bot by name at the moment a game ends. */
  BOT_UIDS: {
    bazza:  'ba22a000-0000-4000-8000-000000000001',
    shazza: '5a22a000-0000-4000-8000-000000000002',
  },
  botUid(name){ return this.BOT_UIDS[String(name||'').trim().toLowerCase()] || null; },

  /* One account id per seat, in seat order, whichever mode we are in.
     Online, the roster carries uids for humans and only names for bots.
     Solo, there is no roster at all: my seat is MYSEAT, the rest are bots. */
  seatRoster(){
    const online = (typeof NET!=='undefined') && NET.roster && NET.roster.length;
    if(online) return NET.roster.map(r => ({
      name: (r && r.name) || '', uid: (r && (r.uid || this.botUid(r.name))) || null }));
    if(typeof G==='undefined' || !G || !G.players) return [];
    const mine = (typeof MYSEAT!=='undefined') ? MYSEAT : 0;
    return G.players.map((pl, i) => ({
      name: pl.name || '',
      uid: pl.isAI ? this.botUid(pl.name) : (i === mine && this.user ? this.user.id : null) }));
  },
  seatUids(){ return this.seatRoster().map(s => s.uid); },

  /* Which of these accounts have no profile row.

     record_match writes the match and counts the win, then skips its Elo loop
     for any player it cannot read an Elo for — `if we is null or le is null
     then continue`. So an unseeded opponent produces a game that counted and a
     rating that did not move, silently. That is what "no rating gained from
     winning on solo" was: Bazza and Shazza had accounts in the client and no
     rows in the database. Ask, so the screen can say so. */
  async _seatsWithoutProfiles(ids){
    try{
      const r = await this.sb.from('profiles').select('id').in('id', ids);
      if(!r || r.error || !r.data) return [];
      const have = {};
      r.data.forEach(x => { have[x.id] = true; });
      return ids.filter(id => !have[id]);
    }catch(e){ return []; }
  },

  /* Does this table pay out at all? One place decides, so the end-of-game
     screen and the write agree about whether the game was rated. */
  ratedTable(winnerSeat){
    // deliberately does not require a loaded profile: recording must not be
    // suppressed just because the row failed to read back. Only the screen needs it.
    if(!this.sb || !this.user) return { ok:false, why:'guest' };
    const seats = this.seatUids();
    const winner = seats[winnerSeat];
    if(!winner) return { ok:false, why:'unrated' };
    const ids = seats.filter(Boolean);
    if(ids.length < 2) return { ok:false, why:'unrated' };
    if(ids.indexOf(this.user.id) < 0) return { ok:false, why:'watching' };
    if(ids.length > 4) return { ok:false, why:'toobig' };
    return { ok:true, ids, winner, won: winner === this.user.id };
  },

  /* My rating after the game, for the screen that shows it.

     The host (and solo) writes the result, then reads it back. A client writes
     nothing — the host's record_match updates every profile at the table,
     including mine — so it polls until its own row moves. Elo is written by
     the database, never guessed here: the screen shows what actually landed. */
  async settleRating(winnerSeat){
    const t = this.ratedTable(winnerSeat);
    const before = this.profile ? this.profile.elo : null;
    if(!t.ok) return { rated:false, why:t.why, before };
    if(before === null) return { rated:false, why:'noprofile', before:null };

    const iAmClient = (typeof NET!=='undefined') && NET.mode === 'client';
    if(!iAmClient) await this.recordMatch(winnerSeat);

    const after = await this._pollElo(before, iAmClient ? 10 : 3);
    const delta = after - before;

    /* A rating that did not move after a game that should have paid is worth a
       query to explain. Only paid for on the failing path. */
    if(delta === 0){
      const missing = await this._seatsWithoutProfiles(t.ids);
      if(missing.length){
        const seats = this.seatRoster();
        const names = missing.map(id => {
          const seat = seats.filter(x => x.uid === id)[0];
          return (seat && seat.name) || 'a player';
        });
        return { rated:false, why:'noaccounts', names, before, after, delta:0, won:t.won };
      }
    }
    return { rated:true, won:t.won, before, after, delta };
  },

  /* Re-read my row until it moves, or until we run out of patience. The host's
     write and my read are different round trips; on a client they are on
     different devices. Settling for the stale value would show +0. */
  async _pollElo(before, tries){
    let elo = before;
    for(let i = 0; i < (tries || 3); i++){
      try{
        const r = await this.sb.from('profiles').select('id,name,elo,games,wins').eq('id', this.user.id).maybeSingle();
        if(r && r.data){
          const code = this.profile && this.profile.friend_code;
          this.profile = r.data;
          if(code) this.profile.friend_code = code;
          this.renderProfile();
          elo = r.data.elo;
          if(elo !== before) return elo;
        }
      }catch(e){}
      await new Promise(res => setTimeout(res, 350));
    }
    return elo;
  },

  /* Called by settleRating and nowhere else.

     The page used to call this directly as well, and the two together produced
     a screen that showed the right new rating and a change of zero: the direct
     call refreshed this.profile first, so settleRating then read the already-
     updated number as its "before". The rating itself survived only because
     record_match refuses a second result inside 45 seconds. One owner. */
  async recordMatch(winnerSeat){
    try{
      if(typeof NET!=='undefined' && NET.mode === 'client') return;   // the host records, not us
      const t = this.ratedTable(winnerSeat);
      if(!t.ok) return;
      await this.sb.rpc('record_match', { p_players: t.ids, p_winner: t.winner, p_rounds: G.turnCount });
      const r = await this.sb.from('profiles').select('id,name,elo,games,wins').eq('id', this.user.id).maybeSingle();
      if(r && r.data){
        const code = this.profile && this.profile.friend_code;
        this.profile = r.data;
        if(code) this.profile.friend_code = code;
        this.renderProfile();
      }
    }catch(e){}
  },
};
function eloDelta(winnerElo, loserElo){
  const ea = 1/(1+Math.pow(10,(loserElo-winnerElo)/400));
  return Math.round(32*(1-ea));
}
