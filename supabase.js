// ═══════════════════════════════════════════════════════════════
// CONFIGURATION SUPABASE
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://sslmdxnpbapsqrcjpbwv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzbG1keG5wYmFwc3FyY2pwYnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNjkxNjIsImV4cCI6MjA5MTc0NTE2Mn0.zW13ZhE0GwUxm42tEIwjA3XWOA6HRNqJ2AebzSFFvYA';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION IDENTITÉ VISUELLE
// Passer USE_LOGOS à true quand les logos sont disponibles
// ═══════════════════════════════════════════════════════════════
const BRAND = {
  USE_LOGOS: false,             // true = afficher logos, false = afficher textes
  LOGO1_SRC: 'logo_odb.png',   // Logo principal (haut gauche) — placer dans le dépôt GitHub
  LOGO2_SRC: 'logo_itf.png',   // Logo secondaire (haut droite)
  TITLE_MAIN: 'Open International des Brisants 2026',
  TITLE_SUB:  'ITF Beach Tennis — WORLD TOUR SAND SERIES — Réunion Classic \'26',
};

// Injecter le bandeau de marque dans la topbar
// Appeler après que le DOM est chargé, sur chaque page
function renderBrand(titleEl, subtitleEl, rightLogoEl) {
  if (BRAND.USE_LOGOS) {
    if (titleEl) {
      titleEl.innerHTML =
        '<img src="' + BRAND.LOGO1_SRC + '" class="topbar-logo-img" alt="' + BRAND.TITLE_MAIN + '" ' +
        'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'">' +
        '<span style="display:none">' + BRAND.TITLE_MAIN + '</span>';
    }
    if (rightLogoEl) {
      rightLogoEl.innerHTML =
        '<img src="' + BRAND.LOGO2_SRC + '" class="topbar-logo-img" alt="' + BRAND.TITLE_SUB + '" ' +
        'onerror="this.style.display=\'none\'">';
    }
    if (subtitleEl) subtitleEl.style.display = 'none';
  } else {
    if (titleEl)    titleEl.textContent    = BRAND.TITLE_MAIN;
    if (subtitleEl) subtitleEl.textContent = BRAND.TITLE_SUB;
    if (rightLogoEl) rightLogoEl.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTH — session synchrone via localStorage
// ═══════════════════════════════════════════════════════════════
const auth = {
  getSession() {
    try {
      const raw = localStorage.getItem('sb_session');
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.expires_at && Math.floor(Date.now() / 1000) > s.expires_at) {
        localStorage.removeItem('sb_session');
        return null;
      }
      return s;
    } catch {
      localStorage.removeItem('sb_session');
      return null;
    }
  },

  async login(email, password) {
    const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.msg || data.error || 'Identifiants incorrects');

    const role = data.user?.user_metadata?.role || 'terrain';
    const name = data.user?.user_metadata?.name || data.user?.email || 'Utilisateur';

    const session = {
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    data.expires_at,
      role, name,
      email: data.user?.email,
      user_id: data.user?.id,
    };
    localStorage.setItem('sb_session', JSON.stringify(session));
    return session;
  },

  logout() {
    const s = this.getSession();
    if (s?.access_token) {
      fetch(SUPABASE_URL + '/auth/v1/logout', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + s.access_token },
      }).catch(() => {});
    }
    localStorage.removeItem('sb_session');
    location.href = 'login.html';
  },

  // Synchrone — redirige si pas connecté ou mauvais rôle
  require(allowedRoles) {
    const s = this.getSession();
    if (!s) { location.href = 'login.html'; return null; }
    if (allowedRoles && allowedRoles.length && !allowedRoles.includes(s.role)) {
      location.href = 'login.html?err=403';
      return null;
    }
    return s;
  },
};

// ═══════════════════════════════════════════════════════════════
// CLIENT REST SUPABASE
// ═══════════════════════════════════════════════════════════════
const sb = {
  _h() {
    const s = auth.getSession();
    return {
      'apikey':        SUPABASE_ANON,
      'Authorization': 'Bearer ' + (s?.access_token || SUPABASE_ANON),
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    };
  },
  _url(table, params) { return SUPABASE_URL + '/rest/v1/' + table + (params ? '?' + params : ''); },

  async get(table, params) {
    const r = await fetch(this._url(table, params || ''), { headers: this._h() });
    if (!r.ok) { const t = await r.text(); throw new Error(t); }
    return r.json();
  },
  async post(table, body) {
    const r = await fetch(this._url(table), { method:'POST', headers:this._h(), body:JSON.stringify(body) });
    if (!r.ok) { const t = await r.text(); throw new Error(t); }
    return r.json();
  },
  async patch(table, filter, body) {
    const r = await fetch(this._url(table, filter), { method:'PATCH', headers:this._h(), body:JSON.stringify(body) });
    if (!r.ok) { const t = await r.text(); throw new Error(t); }
    return r.json();
  },
  async delete(table, filter) {
    const h = { ...this._h(), 'Prefer': 'return=minimal' };
    const r = await fetch(this._url(table, filter), { method:'DELETE', headers:h });
    if (!r.ok) { const t = await r.text(); throw new Error(t); }
    return true;
  },
  realtime(table, callback) {
    try {
      const ws = new WebSocket(SUPABASE_URL.replace('https','wss') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON + '&vsn=1.0.0');
      ws.onopen = () => ws.send(JSON.stringify({ topic:'realtime:public:'+table, event:'phx_join', payload:{}, ref:'1' }));
      ws.onmessage = e => { try { const m=JSON.parse(e.data); if(['INSERT','UPDATE','DELETE'].includes(m.event)) callback(m.event,m.payload?.record); } catch{} };
      ws.onerror = () => {};
      return ws;
    } catch { return null; }
  },
  fmt: {
    dur(sec) { if(!sec||sec<0) return '—'; return Math.floor(sec/60)+'mn'+String(sec%60).padStart(2,'0'); },
    time(iso) { if(!iso) return '—'; return new Date(iso).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); },
    datetime(iso) { if(!iso) return '—'; return new Date(iso).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); },
    date(iso) { if(!iso) return '—'; return new Date(iso).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}); },
    ago(iso) {
      if(!iso) return '—';
      const d=Math.round((Date.now()-new Date(iso))/60000);
      if(d<1) return 'à l\'instant'; if(d<60) return 'il y a '+d+' min';
      return 'il y a '+Math.floor(d/60)+'h'+String(d%60).padStart(2,'0');
    },
  },
};

function getActiveTournament() { return localStorage.getItem('active_tournament_id'); }
function setActiveTournament(id) { localStorage.setItem('active_tournament_id', id); }

function toast(msg, type) {
  type = type||'success';
  let el = document.getElementById('_toast');
  if (!el) { el=document.createElement('div'); el.id='_toast'; Object.assign(el.style,{position:'fixed',bottom:'20px',right:'20px',zIndex:'9999',padding:'12px 18px',borderRadius:'10px',fontSize:'13px',fontWeight:'600',opacity:'0',transition:'opacity .3s',pointerEvents:'none',maxWidth:'320px',boxShadow:'0 4px 16px rgba(0,0,0,.5)'}); document.body.appendChild(el); }
  const colors={success:'#2BC48A',error:'#FF6B6B',warn:'#FFB347',info:'#5B9BD5'};
  el.style.background=colors[type]||colors.success; el.style.color= type==='success'?'#0a1a12':'#fff';
  el.textContent=msg; el.style.opacity='1';
  clearTimeout(el._t); el._t=setTimeout(()=>{el.style.opacity='0';},4000);
}

function fillSelect(id, items, valueFn, labelFn, placeholder) {
  const el=document.getElementById(id); if(!el) return;
  el.innerHTML='<option value="">'+(placeholder||'— Sélectionner —')+'</option>'+items.map(i=>'<option value="'+valueFn(i)+'">'+labelFn(i)+'</option>').join('');
}
