// Table-creation quota: stops one client (or a botnet) from filling storage with junk tables.
//
// Two layers, each a fixed-window counter kept in a tiny Durable Object:
//   - per client network (IPv4 address, or IPv6 /64 — one machine usually owns a whole /64)
//   - global (all clients), a ceiling for distributed floods
// Keys are hashed, so no raw IP address is ever stored. Each object deletes itself when its
// longest window ends.
import { json } from '../lib/http.js';
import { sha256Hex } from '../../public/js/domain/shuffle.js';

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

/** Production defaults; overridable with vars (CREATE_PER_HOUR, CREATE_PER_DAY, CREATE_GLOBAL_PER_HOUR). */
export const QUOTA_DEFAULTS = Object.freeze({ perHour: 10, perDay: 30, globalPerHour: 1500 });

export function quotaLimits(env = {}) {
  const n = (v, d) => {
    const x = Number(v);
    return Number.isInteger(x) && x > 0 ? x : d;
  };
  return {
    perHour: n(env.CREATE_PER_HOUR, QUOTA_DEFAULTS.perHour),
    perDay: n(env.CREATE_PER_DAY, QUOTA_DEFAULTS.perDay),
    globalPerHour: n(env.CREATE_GLOBAL_PER_HOUR, QUOTA_DEFAULTS.globalPerHour),
  };
}

/** The network a request comes from: IPv4 as is, IPv6 cut to its /64. Null when unknown. */
export function clientNetwork(request) {
  const ip = (request.headers.get('cf-connecting-ip') || '').trim().toLowerCase();
  if (!ip) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
  if (!ip.includes(':')) return null;
  // Expand "::" so the first four groups are the /64 prefix.
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = ip.includes('::') ? (tail ? tail.split(':') : []) : [];
  const groups = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export const quotaKey = async (network) => `net:${(await sha256Hex(`quota:${network ?? 'unknown'}`)).slice(0, 24)}`;

/**
 * One fixed-window step. `windows` = [{ ms, max }]. Returns { ok, retryMs, state }.
 * Counts only when every window still has room, so rejected attempts don't extend a ban.
 */
export function consume(state, now, windows) {
  const next = { ...(state || {}) };
  let retryMs = 0;
  for (const w of windows) {
    const k = String(w.ms);
    const cur = next[k] && now - next[k].start < w.ms ? next[k] : { start: now, n: 0 };
    next[k] = cur;
    if (cur.n >= w.max) retryMs = Math.max(retryMs, cur.start + w.ms - now);
  }
  if (retryMs > 0) return { ok: false, retryMs, state: next };
  for (const w of windows) next[String(w.ms)] = { ...next[String(w.ms)], n: next[String(w.ms)].n + 1 };
  return { ok: true, retryMs: 0, state: next };
}

export class QuotaDO {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    const body = await request.json().catch(() => null);
    const windows = Array.isArray(body?.windows)
      ? body.windows
          .filter((w) => Number.isInteger(w?.ms) && w.ms > 0 && w.ms <= 7 * DAY && Number.isInteger(w?.max) && w.max > 0)
          .slice(0, 4)
      : [];
    if (!windows.length) return json({ error: 'bad_request' }, 400);
    const now = Date.now();
    const prev = await this.ctx.storage.get('w');
    const r = consume(prev, now, windows);
    // A blocked client hammering away changes nothing, so it costs no storage writes either.
    if (JSON.stringify(r.state) === JSON.stringify(prev)) return json({ ok: r.ok, retryMs: r.retryMs }, r.ok ? 200 : 429);
    await this.ctx.storage.put('w', r.state);
    // Clean up after the longest window: an idle client leaves nothing behind.
    const end = Math.max(...windows.map((w) => r.state[String(w.ms)].start + w.ms));
    await this.ctx.storage.setAlarm(end);
    return json({ ok: r.ok, retryMs: r.retryMs }, r.ok ? 200 : 429);
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

/** Checks (and counts) one table creation. Returns null when allowed, else { retryMs }. */
export async function checkCreateQuota(request, env) {
  if (!env.QUOTA) return null;
  const lim = quotaLimits(env);
  const ask = async (name, windows) => {
    const r = await env.QUOTA.get(env.QUOTA.idFromName(name)).fetch('https://quota/take', {
      method: 'POST',
      body: JSON.stringify({ windows }),
    });
    return r.status === 429 ? (await r.json()).retryMs || HOUR : 0;
  };
  // Per-network first, so one flooder is cut off before it eats into the global budget.
  const own = await ask(
    await quotaKey(clientNetwork(request)),
    [
      { ms: HOUR, max: lim.perHour },
      { ms: DAY, max: lim.perDay },
    ],
  );
  if (own) return { retryMs: own };
  const all = await ask('global', [{ ms: HOUR, max: lim.globalPerHour }]);
  return all ? { retryMs: all } : null;
}
