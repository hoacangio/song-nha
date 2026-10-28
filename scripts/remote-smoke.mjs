#!/usr/bin/env node
// Smoke test against a running deployment (production, or `wrangler dev` on the real Workers runtime).
//   node scripts/remote-smoke.mjs https://song-nha.example.workers.dev
// For every game: create a table over HTTP, join over WebSocket, add bots, deal a hand, then delete it.
// Results are printed as GitHub Actions annotations so they show up in the run summary.
import { Client } from '../tests/helpers.mjs';
import { randomUUID } from 'node:crypto';

const base = (process.argv[2] || process.env.SMOKE_URL || '').replace(/\/$/, '');
if (!base) {
  console.error('usage: remote-smoke.mjs <base-url>');
  process.exit(2);
}
const gh = !!process.env.GITHUB_ACTIONS;
const note = (level, title, msg) => console.log(gh ? `::${level} title=${title}::${msg.replace(/\n/g, '%0A')}` : `[${level}] ${title}: ${msg}`);
const server = { url: base };
const GAMES = { xidach: 1, tienlen: 1, holdem: 1, maubinh: 1, tichu: 3 };
let failed = 0;

async function step(name, fn) {
  try {
    const out = await fn();
    note('notice', name, out || 'ok');
    return true;
  } catch (e) {
    failed++;
    note('error', name, String(e?.stack || e).slice(0, 1500));
    return false;
  }
}

await step('GET /', async () => {
  const r = await fetch(base + '/');
  const text = await r.text();
  if (r.status !== 200 || !text.includes('id="app"')) throw new Error(`status ${r.status}: ${text.slice(0, 200)}`);
  return `200, csp=${!!r.headers.get('content-security-policy')}`;
});

for (const [game, bots] of Object.entries(GAMES)) {
  await step(`create+deal ${game}`, async () => {
    const secret = randomUUID();
    const r = await fetch(base + '/api/tables', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ secret, game, options: {} }),
    });
    const body = await r.text();
    if (r.status !== 201) throw new Error(`POST /api/tables → ${r.status} ${body} (retry-after: ${r.headers.get('retry-after')})`);
    const { code } = JSON.parse(body);
    const host = new Client(server, code, { secret, nick: 'Smoke' });
    const timer = setTimeout(() => host.close(), 20_000);
    try {
      await host.opened;
      await host.join();
      for (let i = 0; i < bots; i++) await host.act({ t: 'addBot' });
      await host.act({ t: 'start' });
      const h = host.state.hand;
      if (!h || h.game !== game) throw new Error(`no hand after start: ${JSON.stringify(host.state).slice(0, 300)}`);
      await host.act({ t: 'deleteTable' }).catch(() => {});
      return `${r.status} ${code}, hand phase ${h.phase}`;
    } finally {
      clearTimeout(timer);
      host.close();
    }
  });
}

await step('random-table endpoint', async () => {
  const r = await fetch(base + '/api/random');
  if (![200, 404].includes(r.status)) throw new Error(`status ${r.status} ${await r.text()}`);
  return String(r.status);
});

if (failed) {
  console.error(`${failed} smoke step(s) failed against ${base}`);
  process.exit(1);
}
console.log(`remote smoke ok: ${base}`);
process.exit(0);
