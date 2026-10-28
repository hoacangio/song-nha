// Random table: only tables whose host allowed it, with a free seat and someone online.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createTable, Client, sleep } from '../helpers.mjs';

let server;
before(async () => (server = await startServer({ port: 0, quiet: true })));
after(async () => server.close());

const random = async (game) => {
  const r = await fetch(`${server.url}/api/random${game ? `?game=${game}` : ''}`);
  return { status: r.status, body: await r.json() };
};

test('private tables are never offered; a public one is; turning it off removes it', async () => {
  assert.equal((await random()).status, 404, 'empty lobby');
  const priv = await createTable(server);
  const ph = await new Client(server, priv.body.code, { secret: priv.secret, nick: 'P' }).join();
  await sleep(30);
  assert.equal((await random()).status, 404, 'private table not listed');

  const pub = await createTable(server, { options: { public: true } });
  const host = await new Client(server, pub.body.code, { secret: pub.secret, nick: 'H' }).join();
  await sleep(30);
  const r = await random('xidach');
  assert.equal(r.status, 200);
  assert.equal(r.body.code, pub.body.code);
  assert.deepEqual(Object.keys(r.body).sort(), ['code', 'game'], 'nothing else is exposed');
  assert.equal((await random('holdem')).status, 404, 'game filter');

  // A guest cannot change it; the host can switch it off at any time.
  const guest = await new Client(server, pub.body.code, { nick: 'G' }).join();
  assert.equal((await guest.exchange({ t: 'setPublic', on: false })).err, 'host_only');
  await host.act({ t: 'setPublic', on: false });
  await sleep(30);
  assert.equal((await random()).status, 404, 'removed when turned off');
  await host.act({ t: 'setPublic', on: true });
  await sleep(30);
  assert.equal((await random()).body.code, pub.body.code);
  [ph, host, guest].forEach((c) => c.close());
});

test('full tables and tables with nobody online are skipped; deleted tables disappear', async () => {
  const pub = await createTable(server, { game: 'tienlen', options: { public: true } });
  const host = await new Client(server, pub.body.code, { secret: pub.secret, nick: 'H' }).join();
  for (let i = 0; i < 3; i++) await host.act({ t: 'addBot' });
  await sleep(30);
  assert.equal((await random('tienlen')).status, 404, '4/4 seats taken');
  await host.act({ t: 'removeBot', seat: 3 });
  await sleep(30);
  assert.equal((await random('tienlen')).body.code, pub.body.code);
  host.close();
  await sleep(80);
  assert.equal((await random('tienlen')).status, 404, 'no human online');

  const again = await new Client(server, pub.body.code, { secret: pub.secret, nick: 'H' }).join({ sit: false });
  await sleep(30);
  assert.equal((await random('tienlen')).body.code, pub.body.code);
  await again.act({ t: 'deleteTable' }).catch(() => {});
  await sleep(50);
  assert.equal((await random('tienlen')).status, 404, 'deleted table removed');
});
