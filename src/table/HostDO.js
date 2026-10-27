// One Durable Object per host key: enforces the "max 5 tables per host" limit.
import { json } from '../lib/http.js';

export const MAX_TABLES_PER_HOST = 5;

export class HostDO {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const codes = (await this.ctx.storage.get('codes')) ?? [];
    if (url.pathname === '/list') return json({ codes });
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    const { code } = await request.json();
    if (typeof code !== 'string') return json({ error: 'bad_code' }, 400);
    if (url.pathname === '/reserve') {
      if (codes.includes(code)) return json({ codes });
      if (codes.length >= MAX_TABLES_PER_HOST) return json({ error: 'too_many_tables', codes }, 409);
      codes.push(code);
      await this.ctx.storage.put('codes', codes);
      return json({ codes });
    }
    if (url.pathname === '/release') {
      const next = codes.filter((c) => c !== code);
      if (next.length) await this.ctx.storage.put('codes', next);
      else await this.ctx.storage.deleteAll();
      return json({ codes: next });
    }
    return json({ error: 'not_found' }, 404);
  }
}
