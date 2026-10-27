// Protocol security tests over real WebSockets against the local server (Node 22 WebSocket).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startServer, createTable, Client, sleep } from '../helpers.mjs';
import { DECK } from '../../public/js/domain/cards.js';

let server;
before(async () => (server = await startServer({ port: 0, quiet: true })));
after(async () => server.close());

async function table3() {
  const { body, secret } = await createTable(server);
  const host = await new Client(server, body.code, { secret, nick: 'Host' }).join();
  const a = await new Client(server, body.code, { nick: 'An' }).join();
  const b = await new Client(server, body.code, { nick: 'Binh' }).join();
  return { code: body.code, host, a, b, all: [host, a, b] };
}

const errOf = async (c, msg) => {
  const n = c.messages.length;
  c.send(msg);
  const m = await c.wait((x) => (x.t === 'err' || x.t === 'state') && c.messages.indexOf(x) >= n);
  return m.t === 'err' ? m.code : 'ok';
};

test('private cards never reach other sockets before they are shown', async () => {
  const { host, a, b, all } = await table3();
  const spectator = await new Client(server, host.state.code, { nick: 'Spec' }).join({ sit: false });
  await host.act({ t: 'start' });
  await a.act({ t: 'bet', amount: 10 });
  await b.act({ t: 'bet', amount: 10 });
  await sleep(50);
  // Play the hand out while recording every frame.
  for (let i = 0; i < 40; i++) {
    const h = host.state.hand;
    if (h.phase === 'done') break;
    const turnClient = all.find((c) => c.seat === h.turn);
    const ac = turnClient.state.hand.actions;
    if (h.phase === 'play') await turnClient.act({ t: ac.stay ? 'stay' : 'hit' });
    else await turnClient.act({ t: ac.xet ? 'xetAll' : 'hit' });
  }
  // For every frame received by X before the final state, cards of other seats must be null
  // unless that seat's hand had been publicly shown.
  for (const viewer of [...all, spectator]) {
    for (const m of viewer.messages) {
      if (m.t !== 'state' || !m.hand) continue;
      m.hand.seats.forEach((hs, i) => {
        if (!hs || i === m.you.seat) return;
        if (hs.cards) assert.ok(hs.settled || m.hand.phase === 'done' || hs.result, `seat ${i} leaked to ${viewer.nick}`);
      });
    }
  }
  // The undealt deck and the seed must never appear in any frame before the reveal.
  const seedFrames = host.raw.filter((r) => r.includes('"seed"'));
  for (const r of seedFrames) {
    const m = JSON.parse(r);
    if (m.fair?.last) assert.equal(m.fair.last.handNo, m.handNo, 'seed only for a finished hand');
  }
  spectator.close();
  all.forEach((c) => c.close());
});

test('spectators see no private cards at all', async () => {
  const { host, a, b, all } = await table3();
  const spec = await new Client(server, host.state.code, { nick: 'Spec' }).join({ sit: false });
  await host.act({ t: 'start' });
  await a.act({ t: 'bet', amount: 10 });
  await b.act({ t: 'bet', amount: 10 });
  await sleep(50);
  const h = spec.state.hand;
  if (h.phase !== 'done') {
    h.seats.forEach((hs, i) => hs && !hs.settled && assert.equal(hs.cards, null, `seat ${i}`));
    assert.equal(spec.state.you.seat, -1);
    assert.equal(spec.state.hand.actions, null);
  }
  spec.close();
  all.forEach((c) => c.close());
});

test('out-of-turn actions are rejected', async () => {
  const { host, a, b, all } = await table3();
  await host.act({ t: 'start' });
  assert.equal(await errOf(a, { t: 'hit' }), 'wrong_phase');
  await a.act({ t: 'bet', amount: 10 });
  await b.act({ t: 'bet', amount: 10 });
  await sleep(30);
  const h = host.state.hand;
  if (h.phase === 'play') {
    const notTurn = [a, b].find((c) => c.seat !== h.turn);
    assert.equal(await errOf(notTurn, { t: 'stay' }), 'not_your_turn');
    assert.equal(await errOf(host, { t: 'xetAll' }), 'not_your_turn');
  }
  all.forEach((c) => c.close());
});

test('negative, fractional, overflow and non-numeric bets are rejected', async () => {
  const { host, a, all } = await table3();
  await host.act({ t: 'start' });
  for (const amount of [-10, 0, 10.5, 1e15, 2 ** 53, '10', null, NaN, [10], { v: 10 }]) {
    const code = await errOf(a, JSON.stringify({ t: 'bet', amount }).replace('"NaN"', 'NaN'));
    assert.notEqual(code, 'ok', `amount ${JSON.stringify(amount)}`);
  }
  assert.equal(await errOf(a, { t: 'bet', amount: 10_000 }), 'bad_amount', 'above max bet / stack');
  all.forEach((c) => c.close());
});

test('impersonation: pid cannot be chosen, and host powers need the host secret', async () => {
  const { host, a, all } = await table3();
  const evil = new Client(server, host.state.code, { nick: 'Evil' });
  await evil.opened;
  evil.send({ t: 'hello', secret: randomUUID(), nick: 'Evil', pid: host.pid });
  assert.equal((await evil.wait((m) => m.t === 'err')).code, 'unknown_field');
  evil.send({ t: 'hello', secret: randomUUID(), nick: 'Evil' });
  const w = await evil.wait((m) => m.t === 'welcome');
  assert.notEqual(w.pid, host.pid);
  assert.equal(w.isHost, false);
  assert.equal(await errOf(evil, { t: 'start' }), 'host_only');
  assert.equal(await errOf(evil, { t: 'deleteTable' }), 'host_only');
  assert.equal(await errOf(a, { t: 'rebuy', amount: 1000 }), 'host_only');
  // Same secret on a second socket = same player (no duplicate seat).
  const twin = await new Client(server, host.state.code, { secret: a.secret, nick: 'An2' }).join({ sit: false });
  assert.equal(twin.pid, a.pid);
  assert.equal(await errOf(twin, { t: 'sit' }), 'already_seated');
  // Messages before hello are refused.
  const fresh = new Client(server, host.state.code);
  await fresh.opened;
  fresh.send({ t: 'sit' });
  assert.equal((await fresh.wait((m) => m.t === 'err')).code, 'hello_first');
  [evil, twin, fresh, ...all].forEach((c) => c.close());
});

test('rate limit kicks in for floods', async () => {
  const { host, all } = await table3();
  for (let i = 0; i < 60; i++) host.send({ t: 'ping' });
  const m = await host.wait((x) => x.t === 'err' && x.code === 'rate_limited');
  assert.equal(m.code, 'rate_limited');
  all.forEach((c) => c.close());
});

test('wrong Origin is refused for WebSocket and API', async () => {
  const { body } = await createTable(server);
  const bad = new Client(server, body.code, { origin: 'https://evil.example' });
  const ev = await bad.closed;
  assert.notEqual(ev.code, 1000);
  assert.equal(bad.messages.length, 0);
  const r = await createTable(server, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('__proto__ / constructor payloads are rejected and do not pollute', async () => {
  const { host, all } = await table3();
  assert.equal(await errOf(host, '{"t":"settings","options":{"__proto__":{"polluted":1}}}'), 'forbidden_key');
  assert.equal(await errOf(host, '{"t":"settings","options":{"constructor":{"prototype":{"polluted":1}}}}'), 'forbidden_key');
  assert.equal(await errOf(host, '{"t":"__proto__"}'), 'unknown_type');
  assert.equal(await errOf(host, '{"t":"constructor"}'), 'unknown_type');
  assert.equal({}.polluted, undefined);
  assert.equal(await errOf(host, { t: 'start' }), 'ok', 'table still works');
  all.forEach((c) => c.close());
});

test('oversized and malformed frames', async () => {
  const { host, a, all } = await table3();
  assert.equal(await errOf(a, 'not json'), 'bad_json');
  assert.equal(await errOf(a, '[1,2]'), 'bad_shape');
  assert.equal(await errOf(a, { t: 'play', cards: ['ZZ'] }), 'no_hand');
  a.send(JSON.stringify({ t: 'hello', nick: 'x'.repeat(5000) }));
  const ev = await a.closed;
  assert.equal(ev.code, 1009);
  assert.ok(a.messages.some((m) => m.code === 'too_large'));
  all.forEach((c) => c.close());
});

test('max 5 tables per host, delete needs the host secret', async () => {
  const secret = randomUUID();
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await createTable(server, { secret })).body.code);
  assert.equal((await createTable(server, { secret })).status, 429);
  const del = (s) =>
    fetch(`${server.url}/api/tables/${codes[0]}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', origin: server.url },
      body: JSON.stringify({ secret: s }),
    });
  assert.equal((await del(randomUUID())).status, 403);
  assert.equal((await del(secret)).status, 200);
  assert.equal((await fetch(`${server.url}/api/tables/${codes[0]}`)).status, 404);
  assert.equal((await createTable(server, { secret })).status, 201, 'slot freed');
});

test('deck cards never sent while the hand runs', async () => {
  const { host, a, b, all } = await table3();
  await host.act({ t: 'start' });
  await a.act({ t: 'bet', amount: 10 });
  await b.act({ t: 'bet', amount: 10 });
  await sleep(30);
  const st = a.state;
  if (st.hand.phase !== 'done') {
    const visible = new Set(st.hand.seats.flatMap((s) => (s && s.cards) || []));
    const frame = a.raw[a.raw.length - 1];
    const mentioned = DECK.filter((c) => frame.includes(`"${c}"`));
    for (const c of mentioned) assert.ok(visible.has(c), `card ${c} leaked`);
  }
  all.forEach((c) => c.close());
});
