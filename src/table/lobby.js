// Public-table lobby: a single Durable Object that knows which tables accept random players.
// It stores only { code, game, seats, taken, online, at } — never names, chips or cards.
import { json } from '../lib/http.js';
import { CODE_RE } from '../lib/protocol.js';
import { isGame } from '../games/index.js';

export const LOBBY_TTL_MS = 24 * 3600 * 1000;
export const LOBBY_MAX = 2000;

/** Tables a random player may be sent to: public, a free seat, at least one human online. */
export function eligible(entries, { game = null, now = Date.now() } = {}) {
  return entries.filter(
    (e) => e && (!game || e.game === game) && e.taken < e.seats && e.online >= 1 && now - e.at < LOBBY_TTL_MS,
  );
}

/** Random pick, weighted towards tables with more people online (livelier games). */
export function pickTable(entries, { game = null, now = Date.now(), rand = Math.random } = {}) {
  const list = eligible(entries, { game, now });
  if (!list.length) return null;
  const total = list.reduce((s, e) => s + e.online, 0);
  let r = rand() * total;
  for (const e of list) {
    r -= e.online;
    if (r < 0) return e;
  }
  return list[list.length - 1];
}

function cleanEntry(b, now) {
  if (!b || typeof b !== 'object' || !CODE_RE.test(b.code) || !isGame(b.game)) return null;
  const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
  const seats = int(b.seats, 9);
  const taken = int(b.taken, 9);
  const online = int(b.online, 9);
  if (seats == null || taken == null || online == null) return null;
  return { code: b.code, game: b.game, seats, taken, online, at: now };
}

export class LobbyDO {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async load() {
    return (await this.ctx.storage.get('tables')) ?? {};
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    const tables = await this.load();
    // Drop stale entries (tables that went quiet or were deleted without telling us).
    let dirty = false;
    for (const [code, e] of Object.entries(tables)) {
      if (now - e.at >= LOBBY_TTL_MS) {
        delete tables[code];
        dirty = true;
      }
    }
    if (url.pathname === '/pick') {
      const g = url.searchParams.get('game');
      const pick = pickTable(Object.values(tables), { game: isGame(g) ? g : null, now });
      if (dirty) await this.ctx.storage.put('tables', tables);
      return json(pick ? { code: pick.code, game: pick.game } : { error: 'none' }, pick ? 200 : 404);
    }
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    const body = await request.json().catch(() => null);
    if (url.pathname === '/upsert') {
      const e = cleanEntry(body, now);
      if (!e) return json({ error: 'bad_entry' }, 400);
      if (!tables[e.code] && Object.keys(tables).length >= LOBBY_MAX) {
        // Full: drop the entry least useful to a random player (nobody online, then the stalest).
        const victim = Object.values(tables).sort((a, b) => a.online - b.online || a.at - b.at)[0];
        if (victim.online > 0 && e.online === 0) return json({ error: 'full' }, 503);
        delete tables[victim.code];
      }
      tables[e.code] = e;
      await this.ctx.storage.put('tables', tables);
      return json({ ok: true });
    }
    if (url.pathname === '/remove') {
      if (body && typeof body.code === 'string' && tables[body.code]) {
        delete tables[body.code];
        dirty = true;
      }
      if (dirty) await this.ctx.storage.put('tables', tables);
      return json({ ok: true });
    }
    return json({ error: 'not_found' }, 404);
  }
}
