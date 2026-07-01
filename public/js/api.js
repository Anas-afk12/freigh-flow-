// Single fetch wrapper for the whole frontend. Unwraps the {success,data|error}
// envelope and throws a normalized Error on failure so callers can try/catch.
const API = (() => {
  const BASE = '/api';

  async function request(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, opts);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res;
    }
    const json = await res.json();
    if (!json.success) {
      const err = new Error(json.error ? json.error.message : 'Request failed');
      err.code = json.error && json.error.code;
      throw err;
    }
    return json.data;
  }

  return {
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    del: (p) => request('DELETE', p),
    // For file downloads / PDF opening: build an absolute API url.
    url: (p) => BASE + p,
  };
})();
