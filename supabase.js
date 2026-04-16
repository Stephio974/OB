// ═══════════════════════════════════════════════════════════════
// CONFIGURATION SUPABASE
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://sslmdxnpbapsqrcjpbwv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzbG1keG5wYmFwc3FyY2pwYnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNjkxNjIsImV4cCI6MjA5MTc0NTE2Mn0.zW13ZhE0GwUxm42tEIwjA3XWOA6HRNqJ2AebzSFFvYA';

// ═══════════════════════════════════════════════════════════════
// AUTHENTIFICATION — Supabase Auth
//
// Les comptes sont créés dans Supabase > Authentication > Users
// avec des métadonnées : { "role": "admin" } ou "arbitre" ou "terrain"
//
// Pour créer les comptes manuellement, aller dans :
// Supabase > Authentication > Users > "Invite user"
// puis éditer le user et ajouter dans "Raw User Meta Data" :
//   { "role": "admin" }
// ═══════════════════════════════════════════════════════════════
const auth = {
  _session: null,

  // Récupérer la session depuis Supabase
  async getSession() {
    // D'abord vérifier le cache mémoire
    if (this._session) return this._session;

    // Ensuite vérifier le localStorage (token Supabase)
    const stored = localStorage.getItem('sb-session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Vérifier expiration
        if (parsed.expires_at && Date.now() / 1000 > parsed.expires_at) {
          localStorage.removeItem('sb-session');
          return null;
        }
        this._session = parsed;
        return parsed;
      } catch { localStorage.removeItem('sb-session'); }
    }
    return null;
  },

  // Connexion avec email + mot de passe via Supabase Auth
  async login(email, password) {
    const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error_description || err.msg || 'Identifiants incorrects');
    }
    const data = await r.json();
    // data contient access_token, user, expires_at
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      user: data.user,
      role: data.user?.user_metadata?.role || 'terrain',
      name: data.user?.user_metadata?.name || data.user?.email,
      email: data.user?.email,
    };
    this._session = session;
    localStorage.setItem('sb-session', JSON.stringify(session));
    return session;
  },

  async logout() {
    const session = await this.getSession();
    if (session?.access_token) {
      await fetch(SUPABASE_URL + '/auth/v1/logout', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + session.access_token },
      }).catch(() => {});
    }
    this._session = null;
    localStorage.removeItem('sb-session');
    location.href = 'login.html';
  },

  // Appeler en haut de chaque page protégée
  // Usage: const session = await auth.require(['admin','arbitre']);
  async require(allowedRoles) {
    const session = await this.getSession();
    if (!session) { location.href = 'login.html'; return null; }
    if (allowedRoles && !allowedRoles.includes(session.role)) {
      location.href = 'login.html?err=403';
      return null;
    }
    return session;
  },

  async isAdmin()   { const s = await this.getSession(); return s?.role === 'admin'; },
  async isArbitre() { const s = await this.getSession(); return s?.role === 'admin' || s?.role === 'arbitre'; },
};

// ═══════════════════════════════════════════════════════════════
// CLIENT API SUPABASE (REST)
// ═══════════════════════════════════════════════════════════════
const sb = {
  async _headers() {
    const session = await auth.getSession();
    return {
      'apikey': SUPABASE_ANON,
      'Authorization': 'Bearer ' + (session?.access_token || SUPABASE_ANON),
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
  },

  url(table, params) {
    return SUPABASE_URL + '/rest/v1/' + table + (params ? '?' + params : '');
  },

  async get(table, params) {
    const r = await fetch(this.url(table, params || ''), { headers: await this._headers() });
    if (!r.ok) { const t = await r.text(); throw new Error(t); }
    return r.json();
  },

  async post(table, body) {
    const r = await fetch(this.url(table), {
      method: 'POST', headers: await this._headers(), body: JSON.stringify(body),
    });
    if (!r.ok) { const t = await r.text(); throw new Error(t); }
    return r.json();
  },

  async patch(table, filter, body) {
    const r = await fetch(this.url(table, filter), {
      method: 'PATCH', headers: await this._headers(), body: JSON.stringify(body),
    });
    if (!r.ok) { const t = await r.text(); throw new Error(t); }
    return r.json();
  },

  async delete(table, filter) {
    const headers = await this._headers();
    headers['Prefer'] = 'return=minimal';
    const r = await fetch(this.url(table, filter), { method: 'DELETE', headers });
    if (!r.ok) { const t = await r.text(); throw new Error(t); }
    return true;
  },

  realtime(table, callback) {
    try {
      const ws = new WebSocket(SUPABASE_URL.replace('https', 'wss') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON + '&vsn=1.0.0');
      ws.onopen = () => ws.send(JSON.stringify({ topic: 'realtime:public:' + table, event: 'phx_join', payload: {}, ref: '1' }));
      ws.onmessage = e => {
        try { const m = JSON.parse(e.data); if (['INSERT','UPDATE','DELETE'].includes(m.event)) callback(m.event, m.payload?.record); }
        catch {}
      };
      ws.onerror = () => {};
      return ws;
    } catch { return null; }
  },

  fmt: {
    dur(sec) {
      if (!sec || sec < 0) return '—';
      return Math.floor(sec / 60) + 'mn' + String(sec % 60).padStart(2, '0');
    },
    time(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    },
    date(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    },
    ago(iso) {
      if (!iso) return '—';
      const d = Math.round((Date.now() - new Date(iso)) / 60000);
      if (d < 1) return 'à l\'instant';
      if (d < 60) return 'il y a ' + d + ' min';
      return 'il y a ' + Math.floor(d / 60) + 'h' + String(d % 60).padStart(2, '0');
    },
  },
};

// Tournoi actif
function getActiveTournament() { return localStorage.getItem('active_tournament_id'); }
function setActiveTournament(id) { localStorage.setItem('active_tournament_id', id); }

// Toast notification
function toast(msg, type) {
  type = type || 'success';
  let el = document.getElementById('_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = '_toast';
    Object.assign(el.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: '9999',
      padding: '12px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: '600',
      opacity: '0', transition: 'opacity .3s', pointerEvents: 'none',
      maxWidth: '320px', boxShadow: '0 4px 12px rgba(0,0,0,.2)',
    });
    document.body.appendChild(el);
  }
  const colors = { success: '#1D9E75', error: '#E24B4A', warn: '#EF9F27', info: '#378ADD' };
  el.style.background = colors[type] || colors.success;
  el.style.color = '#fff';
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 4000);
}

// Remplir un <select> depuis un tableau
function fillSelect(id, items, valueFn, labelFn, placeholder) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">' + (placeholder || '— Sélectionner —') + '</option>' +
    items.map(i => '<option value="' + valueFn(i) + '">' + labelFn(i) + '</option>').join('');
}
