// ─────────────────────────────────────────────────────────────
// CONFIGURATION SUPABASE — à remplir avec vos clés
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://sslmdxnpbapsqrcjpbwv.supabase.co';   // ← remplacer
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzbG1keG5wYmFwc3FyY2pwYnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNjkxNjIsImV4cCI6MjA5MTc0NTE2Mn0.zW13ZhE0GwUxm42tEIwjA3XWOA6HRNqJ2AebzSFFvYA';           // ← remplacer

// ─────────────────────────────────────────────────────────────
// Client Supabase léger (sans SDK — appels REST + Realtime natifs)
// ─────────────────────────────────────────────────────────────
const sb = {
  headers: {
    'apikey': SUPABASE_ANON,
    'Authorization': `Bearer ${SUPABASE_ANON}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  },

  url(table, params = '') {
    return `${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`;
  },

  async get(table, params = '') {
    const r = await fetch(this.url(table, params), { headers: this.headers });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async post(table, body) {
    const r = await fetch(this.url(table), {
      method: 'POST', headers: this.headers, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async patch(table, filter, body) {
    const r = await fetch(this.url(table, filter), {
      method: 'PATCH', headers: this.headers, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async delete(table, filter) {
    const r = await fetch(this.url(table, filter), {
      method: 'DELETE', headers: this.headers
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  // Realtime via WebSocket Supabase
  realtime(table, callback) {
    const wsUrl = SUPABASE_URL.replace('https', 'wss') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON + '&vsn=1.0.0';
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({ topic: `realtime:public:${table}`, event: 'phx_join', payload: {}, ref: null }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === 'INSERT' || msg.event === 'UPDATE' || msg.event === 'DELETE') {
        callback(msg.event, msg.payload?.record, msg.payload?.old_record);
      }
    };
    ws.onerror = (e) => console.warn('Realtime WS error', e);
    return ws;
  },

  fmt: {
    dur(sec) {
      if (!sec) return '—';
      const m = Math.floor(sec / 60), s = sec % 60;
      return `${m}mn${s.toString().padStart(2,'0')}`;
    },
    time(iso) {
      if (!iso) return '—';
      return new Date(iso).toTimeString().slice(0, 5);
    },
    date(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    },
    ago(iso) {
      if (!iso) return '—';
      const diff = Math.round((Date.now() - new Date(iso)) / 60000);
      if (diff < 1) return 'à l\'instant';
      if (diff < 60) return `il y a ${diff} min`;
      return `il y a ${Math.floor(diff/60)}h${(diff%60).toString().padStart(2,'0')}`;
    }
  }
};

// ID du tournoi actif (stocké en localStorage pour persistance)
function getActiveTournament() {
  return localStorage.getItem('active_tournament_id');
}
function setActiveTournament(id) {
  localStorage.setItem('active_tournament_id', id);
}
