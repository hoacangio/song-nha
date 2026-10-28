// Hold'em protocol security over real WebSockets.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createTable, Client } from '../helpers.mjs';
import { DECK } from '../../public/js/domain/cards.js';

let server;
before(async () => (server = await startServer({ port: 0, quiet: true })));
after(async () => server.close());

async function table4() {
  const { body, secret } = await createTable(server, { game: 'holdem' });
  const host = await new Client(server, body.code, { secret, nick: 'Host' }).join();
  const all = [host];
  for (const nick of ['An', 'Binh', 'Cuc']) all.push(await new Client(server, body.code, { nick }).join());
  await host.act({ t: 'start' });
  await Promise.all(all.map((c) => c.sync()));
  return { host, all };
}
const errOf = async (c, msg) => (await c.exchange(msg)).err ?? 'ok';
const turnClient = (all) => all.find((c) => c.state.hand.turn === c.seat);

test('hole cards: each socket only ever sees its own two cards before showdown', async () => {
  const { all } = await table4();
  // play pre-flop and flop by calling/checking, collecting every frame
  for (let i = 0; i < 12; i++) {
    await Promise.all(all.map((c) => c.sync()));
    const h = all[0].state.hand;
    if (h.phase === 'done' || h.street === 'turn') break;
    const c = turnClient(all);
    await c.act(c.state.hand.actions.check ? { t: 'check' } : { t: 'call' });
  }
  for (const c of all) {
    for (const m of c.messages) {
      if (m.t !== 'state' || !m.hand || m.hand.phase === 'done' || m.hand.runout) continue;
      const mine = m.hand.seats[m.you.seat]?.cards || [];
      const visible = new Set([...mine, ...m.hand.board]);
      const frame = JSON.stringify(m);
      for (const card of DECK) if (frame.includes(`"${card}"`)) assert.ok(visible.has(card), `${c.nick} saw ${card}`);
    }
  }
  all.forEach((c) => c.close());
});

test('bets: out of turn, negative, fractional, overflow, below min-raise, over stack are rejected', async () => {
  const { all } = await table4();
  const me = turnClient(all);
  const other = all.find((c) => c !== me);
  assert.equal(await errOf(other, { t: 'call' }), 'not_your_turn');
  assert.equal(await errOf(other, { t: 'fold' }), 'not_your_turn');
  for (const amount of [-50, 0, 25.5, 1e15, '40', null, [40], { a: 1 }]) {
    assert.notEqual(await errOf(me, { t: 'raise', amount }), 'ok', JSON.stringify(amount));
  }
  assert.equal(await errOf(me, { t: 'raise', amount: 15 }), 'min_raise');
  assert.equal(await errOf(me, { t: 'raise', amount: 5000 }), 'bad_amount');
  assert.equal(await errOf(me, { t: 'check' }), 'cannot_check');
  assert.equal(await errOf(me, { t: 'raise', amount: 30, extra: 1 }), 'unknown_field');
  assert.equal(await errOf(me, { t: 'play', cards: ['AS'] }), 'bad_action', 'Tiến lên intents do nothing here');
  assert.equal(await errOf(me, { t: 'raise', amount: 30 }), 'ok');
  all.forEach((c) => c.close());
});

test('fold-out: the winner is not forced to show; chips conserved', async () => {
  const { all } = await table4();
  const sum = (st) => st.seats.reduce((s, x) => s + (x ? x.chips : 0), 0);
  for (let i = 0; i < 6; i++) {
    await Promise.all(all.map((c) => c.sync()));
    if (all[0].state.hand.phase === 'done') break;
    await turnClient(all).act({ t: 'fold' });
  }
  await Promise.all(all.map((c) => c.sync()));
  const st = all[0].state;
  assert.equal(st.hand.phase, 'done');
  assert.equal(st.hand.showdown, false);
  assert.equal(sum(st), 4000);
  const winner = st.hand.seats.findIndex((s) => s && s.result?.won > 0);
  for (const c of all) if (c.seat !== winner) assert.equal(c.state.hand.seats[winner].cards, null);
  all.forEach((c) => c.close());
});
