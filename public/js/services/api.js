async function call(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await r.json();
  } catch {}
  return { ok: r.ok, status: r.status, data };
}

export const api = {
  createTable: (secret, game, options) => call('POST', '/api/tables', { secret, game, options }),
  tableInfo: (code) => call('GET', `/api/tables/${encodeURIComponent(code)}`),
  deleteTable: (code, secret) => call('DELETE', `/api/tables/${encodeURIComponent(code)}`, { secret }),
};
