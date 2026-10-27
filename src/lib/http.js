export const API_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
});

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: API_HEADERS });
}

/** Reads a JSON body with a hard size cap. Returns null when invalid. */
export async function readJson(request, maxBytes = 4096) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text, (k, val) => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new Error('forbidden');
      return val;
    });
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Same-origin, or listed in ALLOWED_ORIGINS (comma separated). */
export function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  const self = new URL(request.url).origin;
  if (origin === self) return true;
  const extra = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.includes(origin);
}
