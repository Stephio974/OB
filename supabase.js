// ─────────────────────────────────────────────────────────────
// CONFIGURATION SUPABASE
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://sslmdxnpbapsqrcjpbwv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzbG1keG5wYmFwc3FyY2pwYnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNjkxNjIsImV4cCI6MjA5MTc0NTE2Mn0.zW13ZhE0GwUxm42tEIwjA3XWOA6HRNqJ2AebzSFFvYA';

// ─────────────────────────────────────────────────────────────
// AUTHENTIFICATION LOCALE
// Comptes : admin / brisants2025! | arbitre / arbitre2025 | terrain / terrain2025
// ─────────────────────────────────────────────────────────────
const AUTH_USERS = {
  'admin':   { password: 'brisants2025!', role: 'admin',   name: 'Administrateur' },
  'arbitre': { password: 'arbitre2025',   role: 'arbitre', name: 'Juge-Arbitre' },
  'terrain': { password: 'terrain2025',   role: 'terrain', name: 'Responsable Terrain' },
};

const auth = {
  login(username, password) {
    const user = AUTH_USERS[username.toLowerCase()];
    if (!user || user.password !== password) return null;
    const session = { username, role: user.role, name: user.name, at: Date.now() };
    localStorage.setItem('sb_session', JSON.stringify(session));
    return session;
  },
  logout() { localStorage.removeItem('sb_session'); location.href = 'login.html'; },
  getSession() {
    try {
      const s = JSON.parse(localStorage.getItem('sb_session') || 'null');
      if (!s) return null;
      if (Date.now() - s.at > 12 * 3600 * 1000) { this.logout(); return null; }
      return s;
    } catch { return null; }
  },
  require(allowedRoles) {
    const s = this.getSession();
    if (!s) { location.href = 'login.html'; return null; }
    if (allowedRoles && !allowedRoles.includes(s.role)) { location.href = 'login.html?err=403'; return null; }
    return s;
  },
  isAdmin()   { return this.getSession()?.role === 'admin'; },
  isArbitre() { const r = this.getSession()?.role; return r === 'admin' || r === 'arbitre'; },
};

// ─────────────────────────────────────────────────────────────
// CLIENT API SUPABASE
// ─────────────────────────────────────────────────────────────
const sb = {
  get headers() {
    return {
      'apikey': SUPABASE_ANON,
      'Authorization': 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
  },
  url(table, params) { return SUPABASE_URL + '/rest/v1/' + table + (params ? '?' + params : ''); },

  async get(table, params) {
    const r = await fetch(this.url(table, params || ''), { headers: this.headers });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(table, body) {
    const r = await fetch(this.url(table), { method: 'POST', headers: this.headers, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async patch(table, filter, body) {
    const r = await fetch(this.url(table, filter), { method: 'PATCH', headers: this.headers, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async delete(table, filter) {
    const r = await fetch(this.url(table, filter), { method: 'DELETE', headers: { ...this.headers, 'Prefer': 'return=minimal' } });
    if (!r.ok) throw new Error(await r.text());
    return true;
  },
  realtime(table, callback) {
    try {
      const ws = new WebSocket(SUPABASE_URL.replace('https','wss') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON + '&vsn=1.0.0');
      ws.onopen = () => ws.send(JSON.stringify({ topic: 'realtime:public:' + table, event: 'phx_join', payload: {}, ref: '1' }));
      ws.onmessage = e => { try { const m = JSON.parse(e.data); if (['INSERT','UPDATE','DELETE'].includes(m.event)) callback(m.event, m.payload?.record); } catch {} };
      ws.onerror = () => {};
      return ws;
    } catch { return null; }
  },
  fmt: {
    dur(sec) { if (!sec || sec < 0) return '—'; return Math.floor(sec/60) + 'mn' + String(sec%60).padStart(2,'0'); },
    time(iso) { if (!iso) return '—'; return new Date(iso).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); },
    date(iso) { if (!iso) return '—'; return new Date(iso).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}); },
    ago(iso) {
      if (!iso) return '—';
      const d = Math.round((Date.now()-new Date(iso))/60000);
      if (d < 1) return 'à l\'instant'; if (d < 60) return 'il y a '+d+' min';
      return 'il y a '+Math.floor(d/60)+'h'+String(d%60).padStart(2,'0');
    },
  },
};

function getActiveTournament() { return localStorage.getItem('active_tournament_id'); }
function setActiveTournament(id) { localStorage.setItem('active_tournament_id', id); }

function toast(msg, type) {
  type = type || 'success';
  let el = document.getElementById('_toast');
  if (!el) { el = document.createElement('div'); el.id = '_toast'; document.body.appendChild(el); }
  const bg = { success:'#1D9E75', error:'#E24B4A', info:'#378ADD', warn:'#EF9F27' };
  Object.assign(el.style, { position:'fixed', bottom:'20px', right:'20px', zIndex:'9999',
    padding:'12px 18px', borderRadius:'10px', fontSize:'13px', fontWeight:'600',
    background: bg[type]||bg.success, color:'#fff', opacity:'1', transition:'opacity .3s',
    pointerEvents:'none', maxWidth:'320px', boxShadow:'0 4px 12px rgba(0,0,0,.2)' });
  el.textContent = msg;
  clearTimeout(el._t); el._t = setTimeout(() => el.style.opacity='0', 3500);
}

function fillSelect(id, items, valueFn, labelFn, placeholder) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = '<option value="">'+(placeholder||'— Sélectionner —')+'</option>' +
    items.map(i => '<option value="'+valueFn(i)+'">'+labelFn(i)+'</option>').join('');
}
