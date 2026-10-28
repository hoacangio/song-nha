// Storage abuse: junk tables, table-creation floods, unbounded per-table growth, write amplification.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startServer, createTable, Client } from '../helpers.mjs';
import { HOUR, DAY } from '../../src/table/quota.js';
import { UNUSED_EXPIRY_MS, LEDGER_MAX } from '../../src/table/core.js';

let server;
// Production numbers, but a small global ceiling so the distributed-flood test stays quick.
before(async () => (server = await startServer({ port: 0, quiet: true, env: { CREATE_PER_HOUR: '10', CREATE_PER_DAY: '30', CREATE_GLOBAL_PER_HOUR: '60' } })));
after(async () => server.close());

const create = async (ip, extra = {}) => {
  const secret = randomUUID();
  const r = await fetch(`${server.url}/api/tables`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: server.url, 'cf-connecting-ip': ip },
    body: JSON.stringify({ secret, game: 'xidach', ...extra }),
  });
  return { status: r.status, body: await r.json(), retryAfter: r.headers.get('retry-after'), secret };
};
const tableStore = (code) => server.env.TABLE.objects.get(`table:${code}`)?.state.storage;
const info = async (code) => (await fetch(`${server.url}/api/tables/${code}`)).status;

test('a fresh secret per request no longer buys unlimited tables: 10/hour per network', async () => {
  const ip = '203.0.113.7';
  const results = [];
  for (let i = 0; i < 14; i++) results.push(await create(ip));
  assert.equal(results.filter((r) => r.status === 201).length, 10);
  const blocked = results.slice(10);
  for (const r of blocked) {
    assert.equal(r.status, 429);
    assert.equal(r.body.error, 'create_rate');
    assert.ok(Number(r.retryAfter) > 0 && Number(r.retryAfter) <= 3600, 'Retry-After header');
  }
  // Hammering while blocked costs no storage writes and touches no table or host object
  const tables = server.env.TABLE.objects.size;
  const hosts = server.env.HOST.objects.size;
  const stores = [...server.env.QUOTA.objects.values()].map((e) => e.state.storage);
  let puts = 0;
  for (const st of stores) {
    const put = st.put.bind(st);
    st.put = (k, v) => (puts++, put(k, v));
  }
  for (let i = 0; i < 20; i++) assert.equal((await create(ip)).status, 429);
  assert.equal(puts, 0, 'no quota writes while blocked');
  assert.equal(server.env.TABLE.objects.size, tables);
  assert.equal(server.env.HOST.objects.size, hosts);
  // Another network is unaffected
  assert.equal((await create('198.51.100.9')).status, 201);
  // New codes use 4 digits (270,000 codes) — impossible to exhaust within the quota
  assert.match(results[0].body.code, /^[A-Z]{3,8}-\d{4}$/);
});

test('IPv6: the whole /64 shares one quota (rotating addresses does not help)', async () => {
  let ok = 0;
  for (let i = 0; i < 12; i++) if ((await create(`2001:db8:aa:bb::${(i + 1).toString(16)}`)).status === 201) ok++;
  assert.equal(ok, 10);
  assert.equal((await create('2001:db8:aa:cc::1')).status, 201, 'a different /64 is another network');
});

test('the window reopens after an hour; the daily cap still holds; idle quota objects clean up', async () => {
  const ip = '192.0.2.50';
  let made = 0;
  for (let hour = 0; hour < 4; hour++) {
    for (let i = 0; i < 10; i++) if ((await create(ip)).status === 201) made++;
    await server.advance(HOUR);
  }
  assert.equal(made, 30, '30 per day even across several hours');
  await server.advance(DAY);
  assert.equal((await create(ip)).status, 201, 'a new day');
  const quotaObjects = [...server.env.QUOTA.objects.values()];
  await server.advance(2 * DAY);
  assert.ok(quotaObjects.every((e) => e.state.storage.map.size === 0), 'quota counters delete themselves');
});

test('global ceiling stops a distributed flood (many networks)', async () => {
  await server.advance(2 * HOUR); // fresh global window
  let ok = 0;
  let last;
  for (let i = 0; i < 70; i++) {
    last = await create(`100.64.${Math.floor(i / 200)}.${(i % 200) + 1}`);
    if (last.status === 201) ok++;
  }
  assert.equal(ok, 60);
  assert.equal(last.status, 429);
  await server.advance(HOUR);
});

test('a table where no hand was dealt is deleted after 6h idle; a played one is kept', async () => {
  await server.advance(2 * HOUR);
  const junk = await create('203.0.113.80');
  const real = await create('203.0.113.81');
  assert.equal(junk.status, 201);
  // play one hand at the real table
  const c = await new Client(server, real.body.code, { secret: real.secret, nick: 'H' }).join();
  await c.act({ t: 'addBot' });
  await c.act({ t: 'start' });
  c.close();
  await server.advance(UNUSED_EXPIRY_MS + 60_000);
  assert.equal(await info(junk.body.code), 404, 'junk table gone');
  assert.equal(tableStore(junk.body.code).map.size, 0, 'its storage is empty');
  assert.equal(await info(real.body.code), 200, 'a table that was played stays (7-day idle limit)');
});

test('rotating secrets at one table cannot grow its stored score board without limit', async () => {
  const t = await createTable(server);
  const code = t.body.code;
  for (let i = 0; i < LEDGER_MAX + 25; i++) {
    const c = await new Client(server, code, { nick: `Bot${i}` }).join();
    await c.act({ t: 'stand' });
    c.close();
    await c.closed;
  }
  const stored = await tableStore(code).get('table');
  assert.ok(Object.keys(stored.ledger).length <= LEDGER_MAX, `ledger ${Object.keys(stored.ledger).length}`);
  assert.ok(JSON.stringify(stored).length < 64 * 1024, 'stored table stays small');
});

test('reconnect churn does not rewrite storage when nothing changed', async () => {
  const t = await createTable(server);
  const code = t.body.code;
  const first = await new Client(server, code, { secret: t.secret, nick: 'H' }).join();
  first.close();
  await first.closed;
  const store = tableStore(code);
  let puts = 0;
  const put = store.put.bind(store);
  store.put = (k, v) => (puts++, put(k, v));
  for (let i = 0; i < 20; i++) {
    const c = await new Client(server, code, { nick: 'Watcher' }).join({ sit: false });
    c.close();
    await c.closed;
  }
  assert.equal(puts, 0, `spectator hellos wrote storage ${puts} times`);
});

test('a socket to a table that does not exist is refused before any storage is created', async () => {
  const c = new Client(server, 'XOAI-9999', { nick: 'X' });
  await assert.rejects(c.opened);
  const e = server.env.TABLE.objects.get('table:XOAI-9999');
  assert.ok(!e || e.state.storage.map.size === 0);
  assert.equal(await info('SEN-123'), 404, 'old 3-digit codes still parse');
});
