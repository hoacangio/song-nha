// Worker entry: tiny HTTP API + WebSocket routing to the per-table Durable Object.
// Static assets are served by Workers Static Assets; only /api/* and /ws/* run this code first.
import { TableDO } from './table/TableDO.js';
import { HostDO } from './table/HostDO.js';
import { LobbyDO } from './table/lobby.js';
import { hostKeyFor } from './table/core.js';
import { json, readJson, originAllowed } from './lib/http.js';
import { CODE_RE, normalizeCode, isSecret } from './lib/protocol.js';
import { isGame } from './games/index.js';
import { randomInt } from '../public/js/domain/shuffle.js';

export { TableDO, HostDO, LobbyDO };

const WORDS = [
  'BIEN', 'CAU', 'CHE', 'DUA', 'GIO', 'HEO', 'LUA', 'MAI', 'MEO', 'MIT', 'MUA', 'NANG', 'NUI', 'PHO', 'RONG',
  'SAO', 'SEN', 'SONG', 'TRA', 'TRANG', 'XOAI', 'BUN', 'CAM', 'DAO', 'KHE', 'LAN', 'NGAN', 'TRE', 'VAN', 'CUC',
];

function newCode() {
  return `${WORDS[randomInt(WORDS.length)]}-${String(randomInt(1000)).padStart(3, '0')}`;
}

const tableStub = (env, code) => env.TABLE.get(env.TABLE.idFromName(`table:${code}`));
const hostStub = (env, hostKey) => env.HOST.get(env.HOST.idFromName(`host:${hostKey}`));

async function createTable(request, env) {
  const body = await readJson(request);
  if (!body || !isSecret(body.secret) || !isGame(body.game)) return json({ error: 'bad_request' }, 400);
  const options = body.options && typeof body.options === 'object' && !Array.isArray(body.options) ? body.options : {};
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
