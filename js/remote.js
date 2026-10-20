// Online backend: talks to the ActiveLift School server (server/index.js).
(function () {
  'use strict';

  const TOKEN_KEY = 'activelift-token';

  function RemoteBackend(health) {
    let token = null;
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      /* no storage: user logs in each visit */
    }

    function setToken(t) {
      token = t;
      try {
        if (t) localStorage.setItem(TOKEN_KEY, t);
        else localStorage.removeItem(TOKEN_KEY);
      } catch (e) {
        /* ignore */
      }
    }

    async function api(method, path, body) {
      let res;
      try {
        res = await fetch(path, {
          method,
          headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้งนะ');
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json.error || 'เกิดข้อผิดพลาด');
        err.status = res.status;
        if (res.status === 401) setToken(null);
        throw err;
      }
      return json;
    }

    this.mode = 'remote';
    this.inviteRequired = Boolean(health && health.inviteRequired);

    this.init = async () => {
      if (!token) return { needsAuth: true };
      try {
        return await api('GET', '/api/me');
      } catch (e) {
        if (e.status === 401) return { needsAuth: true };
        throw e;
      }
    };

    this.register = async (username, password, inviteCode) => {
      const r = await api('POST', '/api/register', { username, password, inviteCode });
      setToken(r.token);
      return r;
    };

    this.login = async (username, password) => {
      const r = await api('POST', '/api/login', { username, password });
      setToken(r.token);
      return r;
    };

    this.logout = async () => {
      await api('POST', '/api/logout').catch(() => {});
      setToken(null);
    };

    this.call = (action, args) => api('POST', '/api/action', { action, args: args || {} });

    this.exportData = () => api('GET', '/api/export');

    this.deleteAccount = async (password) => {
      await api('POST', '/api/delete-account', { password });
      setToken(null);
    };
  }

  // Online when this page is served by the ActiveLift server; otherwise (file:// or static hosting) offline.
  // Resolves with the server's health info, or null.
  RemoteBackend.available = async () => {
    if (!/^https?:$/.test(location.protocol)) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch('/api/health', { signal: ctrl.signal });
      clearTimeout(timer);
      const health = res.ok ? await res.json() : null;
      return health && health.ok === true ? health : null;
    } catch (e) {
      return null;
    }
  };

  window.RemoteBackend = RemoteBackend;
})();
