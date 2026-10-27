#!/usr/bin/env node
// Offline smoke test: boots the local server, creates a Xì dách table, plays one hand with
// two humans + a bot over real WebSockets, and checks that static assets are served.
import assert from 'node:assert/strict';
import { startServer, createTable, Client } from '../tests/helpers.mjs';

const server = await startServer({ port: 0, quiet: true });
try {
  const home = await fetch(server.url + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<div id="app"/);
  assert.ok(home.headers.get('content-security-policy'), 'CSP header present');
  const spa = await fetch(server.url + '/t/SONG-123');
  assert.equal(spa.status, 200, 'SPA fallback');

  const { status, body, secret } = await createTable(server);
  assert.equal(status, 201);
  const code = body.code;
  const info = await (await fetch(`${server.url}/api/tables/${code}`)).json();
  assert.equal(info.game, 'xidach');

  const host = await new Client(server, code, { secret, nick: 'Host' }).join();
  const a = await new Client(server, code, { nick: 'An' }).join();
  await host.act({ t: 'addBot' });
  assert.equal(host.state.you.isHost, true);
  assert.equal(a.state.you.isHost, false);

  await host.act({ t: 'start' });
  // Everyone who must bet bets the minimum; then players stay/hit; dealer checks all.
  for (let i = 0; i < 80; i++) {
    for (const c of [host, a]) {
      const h = c.state.hand;
      if (!h || h.phase === 'done' || !h.actions) continue;
      const act = h.actions;
      if (act.bet) await c.act({ t: 'bet', amount: act.bet.min });
      else if (h.phase === 'play') await c.act({ t: act.stay ? 'stay' : 'hit' });
      else if (h.phase === 'dealer') await c.act({ t: act.xet ? 'xetAll' : 'hit' });
    }
    if (host.state.hand?.phase === 'done') break;
    await server.advance(1000); // let the bot act
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(host.state.hand.phase, 'done', 'hand finished');
  assert.ok(host.state.fair.last?.seed, 'seed revealed after the hand');
  host.send({ t: 'history' });
  const hist = await host.wait((m) => m.t === 'history');
  assert.equal(hist.items.length, 1, 'hand recorded in history');
  host.close();
  a.close();
  console.log('smoke ok:', code);
} finally {
  await server.close();
}
