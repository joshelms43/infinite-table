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

  async init(){
    try{
      const sb = await this.ensureSB(); if(!sb) return;
      let { data:{ session } } = await sb.auth.getSession();
      if(!session){
        const r = await sb.auth.signInAnonymously();
        session = r.data && r.data.session;
      }
      if(session && session.user) this.user = session.user;
      if(!session) { this.renderProfile(); return; }
      this.user = session.user;
      let { data: prof } = await sb.from('profiles').select('id,name,elo,games,wins').eq('id', this.user.id).maybeSingle();
      if(!prof){
        const name = (this.myName_() || 'Player').slice(0,12);
        await sb.from('profiles').insert({ id:this.user.id, name, friend_code:this.makeFriendCode() });
        const r2 = await sb.from('profiles').select('id,name,elo,games,wins').eq('id', this.user.id).maybeSingle();
        prof = r2.data;
      }
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
    }catch(e){ this.renderProfile(); }
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
      const nm = (this.profile && this.profile.name) || this.myName_() || 'Player';
      mini.innerHTML = `<span class="avatar" style="background:${this.profile?'var(--money-gold)':'var(--felt-highlight)'};color:${this.profile?'var(--table-night)':'var(--text-ivory)'}">${nm[0]}</span>
        <span>${nm}</span>${this.profile?`<span class="minelo">· ${this.profile.elo}</span>`:''}<span style="opacity:.5">›</span>`;
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
  openProfile(){
    this.sheetOpen = true;
    this.renderProfileSheet();
  },
  renderProfileSheet(){
    const p = this.profile;
    const nm = (p && p.name) || this.myName_() || 'Player';
    const stats = p ? `<div class="sheetstat">
        <div class="stat"><b>${p.elo}</b><span>Elo</span></div>
        <div class="stat"><b>${p.wins}</b><span>Wins</span></div>
        <div class="stat"><b>${Math.max(0,p.games-p.wins)}</b><span>Losses</span></div>
      </div>
      <div class="coderow"><span>Friend code</span><b class="fcode" onclick="ID.copyCode()">${p.friend_code}</b></div>` : `<div class="sub" style="margin:8px 0">Playing offline — stats and friends connect automatically when online.</div>`;
    const friendsBlock = p ? `<div class="zone-label" style="margin-top:14px">Friends</div>
      <div id="friendlist">${this._friendRows()}</div>
      <div class="joinrow" style="margin-top:8px">
        <input id="friendcode" maxlength="6" placeholder="FRIEND CODE" autocomplete="off" style="width:150px;letter-spacing:2px">
        <button class="homebtn" style="flex:1" onclick="ID.addFriend()">Add</button>
      </div>` : '';
    let acct = '';
    if(this.user && this.sb){
      if(this.uname()){
        acct = `<div class="coderow"><span>Signed in as <b>@${this.uname()}</b></span><b class="fcode" onclick="ID.signOut()">Sign out</b></div>`;
      } else {
        acct = `<button class="disclosure" onclick="toggleReveal('acctpanel')" style="margin-top:10px"><span>Save account · use on any device</span><span class="chev">▾</span></button>
        <div id="acctpanel" class="reveal">
          <div class="onlinebox">
            <input id="acctuser" class="namefield" maxlength="16" placeholder="username" autocomplete="off" style="margin-top:0">
            <input id="acctpass" class="namefield" type="password" maxlength="40" placeholder="password" autocomplete="new-password">
            <div class="homerow" style="margin-top:8px">
              <button class="homebtn" onclick="ID.secure()">Create login</button>
              <button class="homebtn" onclick="ID.signIn()">Sign in</button>
            </div>
            <div class="profsub" style="margin-top:8px;opacity:.4">No email — just a username and password. Your Elo and friends carry over.</div>
          </div>
        </div>`;
      }
    }
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
      </div>`).join('') || '<div class="profsub" style="text-align:center;opacity:.5;padding:4px 0">Add mates with their friend code</div>';
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
  async secure(){
    const u = this.sanitizeU(($('#acctuser')||{}).value);
    const pw = (($('#acctpass')||{}).value)||'';
    if(u.length<3){ banner('USERNAME: 3+ LETTERS','var(--danger-red)'); return; }
    if(pw.length<6){ banner('PASSWORD: 6+ CHARACTERS','var(--danger-red)'); return; }
    try{
      const { error } = await this.sb.auth.updateUser({ email: u+'@coastline.game', password: pw });
      if(error){ banner(/already|exists|registered/i.test(error.message)?'USERNAME TAKEN':'COULD NOT SAVE','var(--danger-red)'); return; }
      const { data:{ user } } = await this.sb.auth.getUser();
      if(user) this.user = user;
      banner('ACCOUNT SAVED','var(--success-green)');
      this.renderProfile(); this.renderProfileSheet();
    }catch(e){ banner('COULD NOT SAVE','var(--danger-red)'); }
  },
  async signIn(){
    const u = this.sanitizeU(($('#acctuser')||{}).value);
    const pw = (($('#acctpass')||{}).value)||'';
    if(!u || !pw){ banner('USERNAME + PASSWORD','var(--danger-red)'); return; }
    try{
      const { data, error } = await this.sb.auth.signInWithPassword({ email: u+'@coastline.game', password: pw });
      if(error || !data || !data.user){ banner('WRONG USERNAME OR PASSWORD','var(--danger-red)'); return; }
      this.user = data.user; this.profile = null; this.friends = [];
      await this.init();
      banner('WELCOME BACK','var(--success-green)');
      this.renderProfileSheet();
    }catch(e){ banner('SIGN IN FAILED','var(--danger-red)'); }
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

  /* --- match recording: host calls once per finished online game --- */
  async recordMatch(winnerSeat){
    try{
      if(!this.sb || typeof NET==='undefined' || NET.mode!=='host' || !NET.roster) return;
      const ids = NET.roster.map(r=>r.uid).filter(Boolean);
      if(ids.length < 2) return;
      const winnerUid = NET.roster[winnerSeat] && NET.roster[winnerSeat].uid;
      if(!winnerUid) return;
      await this.sb.rpc('record_match', { p_players: ids, p_winner: winnerUid, p_rounds: G.turnCount });
      this.init && this.sb.from('profiles').select('*').eq('id', this.user.id).maybeSingle().then(r=>{ if(r.data){ this.profile=r.data; this.renderProfile(); } });
    }catch(e){}
  },
};
function eloDelta(winnerElo, loserElo){
  const ea = 1/(1+Math.pow(10,(loserElo-winnerElo)/400));
  return Math.round(32*(1-ea));
}
