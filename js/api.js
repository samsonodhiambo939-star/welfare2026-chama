/* Backend API client — shared database mode.
   Include AFTER js/store.js and BEFORE js/member.js / js/admin.js:
     <script src="js/store.js"></script>
     <script src="js/api.js"></script>
   If the backend is reachable, all reads/writes go to it (shared for everyone).
   If not (e.g. double-clicking index.html offline), it falls back to localStorage demo mode.
*/
(function () {
  const TOKEN_KEY = 'welfare2026_token_v1';
  const API_BASE = ''; // same origin — backend serves frontend + API together

  const _loadDB = window.loadDB;
  const _saveDB = window.saveDB;

  window.__CACHE = null;
  window.__USE_API = false;

  window.getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
  window.setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

  async function apiReq(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const tok = window.getToken();
    if (tok) headers.Authorization = 'Bearer ' + tok;
    const r = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await r.json(); } catch {}
    if (!r.ok) throw new Error(data.error || ('Request failed (' + r.status + ')'));
    return data;
  }
  window.apiReq = apiReq;

  window.backendAvailable = async () => {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 2500);
      const r = await fetch(API_BASE + '/api/health', { signal: c.signal });
      clearTimeout(t);
      return r.ok;
    } catch { return false; }
  };

  // Pull shared state from server, keep a sync-readable cache + localStorage mirror
  // (mirror keeps requireAuth()/currentUser() working synchronously).
  window.refreshDB = async () => {
    const data = await apiReq('GET', '/api/db');
    const dbShape = {
      v: 1, seq: 100,
      users: data.users || [],
      contributions: data.contributions || [],
      loans: (data.loans || []).map((l) => Object.assign({}, l, {
        guarantors: Array.isArray(l.guarantors) ? l.guarantors : []
      })),
      fines: data.fines || [],
      cases: data.cases || [],
      meetings: (data.meetings || []).map((m) => Object.assign({}, m, { attendance: m.attendance || {} })),
      notifications: data.notifications || []
    };
    // members also need a roster for guarantor dropdowns
    if (data.allMembersBasic) {
      const seen = new Set(dbShape.users.map((u) => u.id));
      data.allMembersBasic.forEach((u) => { if (!seen.has(u.id)) { dbShape.users.push(u); seen.add(u.id); } });
    }
    window.__CACHE = dbShape;
    window.__USE_API = true;
    try { localStorage.setItem('welfare2026_db_v1', JSON.stringify(dbShape)); } catch {}
    return dbShape;
  };

  // Sync-compatible readers: prefer server cache when present.
  window.loadDB = function () {
    if (window.__CACHE) return window.__CACHE;
    try { return _loadDB(); } catch { return window.__CACHE; }
  };
  // Writes go through the API — direct local saves are disabled in API mode.
  window.saveDB = function (db) {
    if (window.__USE_API && window.__CACHE) { window.__CACHE = db; return; }
    try { return _saveDB(db); } catch {}
  };

  // Login: try backend first, fall back to offline demo logins.
  window.apiLogin = async (username, password) => {
    const data = await apiReq('POST', '/api/login', { username, password });
    window.setToken(data.token);
    try { localStorage.setItem('welfare2026_session_v1', JSON.stringify({ userId: data.user.id, role: data.user.role, time: Date.now() })); } catch {}
    await window.refreshDB();
    return data.user;
  };
  window.apiLogout = async () => {
    try { await apiReq('POST', '/api/logout'); } catch {}
    window.setToken(null);
    try { localStorage.removeItem('welfare2026_session_v1'); } catch {}
  };

  // Auto-refresh shared state on member/admin pages when a token exists.
  document.addEventListener('DOMContentLoaded', async () => {
    if (!window.getToken()) return;
    if (!document.getElementById('view')) return;
    try {
      await window.refreshDB();
      if (typeof window.render === 'function') {
        try {
          const s = JSON.parse(localStorage.getItem('welfare2026_session_v1') || 'null');
          if (s && typeof ME !== 'undefined') {
            const u = window.__CACHE.users.find((x) => x.id === s.userId);
            if (u) { ME = u; }
          }
        } catch {}
        window.render();
      }
    } catch (e) { console.warn('Backend unreachable, using offline copy.', e); }
  });
})();
