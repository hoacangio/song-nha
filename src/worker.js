// Worker entry: tiny HTTP API + WebSocket routing to the per-table Durable Object.
// Static assets are served by Workers Static Assets; only /api/* and /ws/* run this code first.
import { TableDO } from './table/TableDO.js';
import { HostDO } from './table/HostDO.js';
import { LobbyDO } from './table/lobby.js';
import { QuotaDO, checkCreateQuota } from './table/quota.js';
import { hostKeyFor } from './table/core.js';
import { json, readJson, originAllowed, API_HEADERS } from './lib/http.js';
import { CODE_RE, normalizeCode, isSecret } from './lib/protocol.js';
import { isGame } from './games/index.js';
import { randomInt } from '../public/js/domain/shuffle.js';

export { TableDO, HostDO, LobbyDO, QuotaDO };

const WORDS = [
  'BIEN', 'CAU', 'CHE', 'DUA', 'GIO', 'HEO', 'LUA', 'MAI', 'MEO', 'MIT', 'MUA', 'NANG', 'NUI', 'PHO', 'RONG',
  'SAO', 'SEN', 'SONG', 'TRA', 'TRANG', 'XOAI', 'BUN', 'CAM', 'DAO', 'KHE', 'LAN', 'NGAN', 'TRE', 'VAN', 'CUC',
];

// 30 words × 9000 numbers = 270,000 codes (old 3-digit codes still parse). A big space keeps codes
// hard to guess and impossible to exhaust within the creation quota.
function newCode() {
  return `${WORDS[randomInt(WORDS.length)]}-${1000 + randomInt(9000)}`;
}

const tableStub = (env, code) => env.TABLE.get(env.TABLE.idFromName(`table:${code}`));
const hostStub = (env, hostKey) => env.HOST.get(env.HOST.idFromName(`host:${hostKey}`));

async function createTable(request, env) {
  const body = await readJson(request);
  if (!body || !isSecret(body.secret) || !isGame(body.game)) return json({ error: 'bad_request' }, 400);
  const options = body.options && typeof body.options === 'object' && !Array.isArray(body.options) ? body.options : {};
  // The per-host limit is keyed by a secret the client picks, so it can't stop a script that sends a
  // fresh secret each time; the quota (per network + global) can. It runs first, so a flood is turned
  // away before touching any other object.
  const quota = await checkCreateQuota(request, env);
  if (quota) {
    return new Response(JSON.stringify({ error: 'create_rate', retryAfter: Math.ceil(quota.retryMs / 1000) }), {
      status: 429,
      headers: { ...API_HEADERS, 'retry-after': String(Math.ceil(quota.retryMs / 1000)) },
    });
  }
  const hostKey = await hostKeyFor(body.secret);
  const host = hostStub(env, hostKey);
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newCode();
    const r = await host.fetch('https://host/reserve', { method: 'POST', body: JSON.stringify({ code }) });
    if (r.status === 409) return json({ error: 'too_many_tables' }, 429);
    const init = await tableStub(env, code).fetch('https://table/init', {
      method: 'POST',
      body: JSON.stringify({ code, game: body.game, options, hostKey }),
    });
    if (init.status === 201) return json({ code }, 201);
    await host.fetch('https://host/release', { method: 'POST', body: JSON.stringify({ code }) });
    if (init.status !== 409) return json({ error: 'create_failed' }, 500);
  }
  return json({ error: 'create_failed' }, 500);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/ws/')) {
      const code = normalizeCode(decodeURIComponent(path.slice(4)));
      if (!CODE_RE.test(code)) return json({ error: 'bad_code' }, 400);
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected_websocket' }, 426);
      if (!originAllowed(request, env)) return json({ error: 'bad_origin' }, 403);
      return tableStub(env, code).fetch(new Request('https://table/ws', request));
    }

    if (path === '/api/random' && request.method === 'GET') {
      // A random public table (optionally of one game). Only tables whose host allowed it are listed.
      const game = url.searchParams.get('game');
      const q = isGame(game) ? `?game=${game}` : '';
      return env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch(`https://lobby/pick${q}`);
    }

    if (path === '/api/tables' && request.method === 'POST') {
      if (!originAllowed(request, env)) return json({ error: 'bad_origin' }, 403);
      return createTable(request, env);
    }

    const m = path.match(/^\/api\/tables\/([^/]+)$/);
    if (m) {
      const code = normalizeCode(decodeURIComponent(m[1]));
      if (!CODE_RE.test(code)) return json({ error: 'bad_code' }, 400);
      if (request.method === 'GET') return tableStub(env, code).fetch('https://table/info');
      if (request.method === 'DELETE') {
        if (!originAllowed(request, env)) return json({ error: 'bad_origin' }, 403);
        const body = await readJson(request);
        if (!body || !isSecret(body.secret)) return json({ error: 'bad_request' }, 400);
        return tableStub(env, code).fetch('https://table/delete', {
          method: 'POST',
          body: JSON.stringify({ secret: body.secret }),
        });
      }
      return json({ error: 'method' }, 405);
    }

    if (path.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
