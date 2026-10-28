// Mậu binh and Tichu protocol security over real WebSockets: hidden cards, foreign cards, bad shapes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createTable, Client } from '../helpers.mjs';
import { DECK } from '../../public/js/domain/cards.js';
import { TICHU_DECK } from '../../public/js/domain/tichu.js';
import { bestArrangement } from '../../public/js/domain/maubinh.js';

let server;
before(async () => (server = await startServer({ port: 0, quiet: true })));
after(async () => server.close());

const errOf = async (c, msg) => (await c.exchange(msg)).err ?? 'ok';

async function seated(game, n) {
  const { body, secret } = await createTable(server, { game });
  const host = await new Client(server, body.code, { secret, nick: 'Host' }).join();
  const all = [host];
  for (let i = 1; i < n; i++) all.push(await new Client(server, body.code, { nick: `P${i}` }).join());
  await host.act({ t: 'start' });
  await Promise.all(all.map((c) => c.sync()));
  return { host, all, code: body.code };
}

/** Cards from `deck` that appear anywhere in the last state frame this client received. */
const cardsSeen = (c, deck) => {
  const last = c.raw.filter((r) => r.includes('"state"')).pop();
  return deck.filter((card) => last.includes(`"${card}"`));
};

test('Mậu binh: while arranging, each socket only sees its own 13 cards — not even others’ layouts', async () => {
  const { all, code } = await seated('maubinh', 3);
  const watcher = await new Client(server, code, { nick: 'Watch' }).join({ sit: false });
  for (const c of all) {
    const mine = c.state.hand.seats[c.seat].cards;
    assert.equal(mine.length, 13);
    for (const card of cardsSeen(c, DECK)) assert.ok(mine.includes(card), `${c.nick} saw ${card}`);
  }
  // one player locks in; the others still learn nothing
  const [a, b] = all;
  await a.act({ t: 'arrange', cards: bestArrangement(a.state.hand.seats[a.seat].cards) });
  await b.sync();
  for (const card of cardsSeen(b, DECK)) assert.ok(b.state.hand.seats[b.seat].cards.includes(card));
  await watcher.sync();
  assert.equal(cardsSeen(watcher, DECK).length, 0, 'spectators see no cards before the reveal');
  // foreign cards, wrong sizes, wrong types
  const mine = b.state.hand.seats[b.seat].cards;
  const theirs = a.state.hand.seats[a.seat].cards;
  assert.equal(await errOf(b, { t: 'arrange', cards: [...mine.slice(0, 12), theirs[0]] }), 'not_your_cards');
  assert.equal(await errOf(b, { t: 'arrange', cards: mine.slice(0, 5) }), 'bad_cards');
  assert.equal(await errOf(b, { t: 'arrange', cards: mine.concat(['ZZ']) }), 'bad_cards');
  assert.equal(await errOf(b, { t: 'arrange', cards: 13 }), 'bad_cards');
  assert.equal(await errOf(b, { t: 'arrange', cards: mine, extra: 1 }), 'unknown_field');
  assert.equal(await errOf(watcher, { t: 'arrange', cards: mine }), 'not_seated');
  assert.equal(await errOf(b, { t: 'play', cards: [mine[0]] }), 'bad_action');
  // everyone ready → revealed to all
  for (const c of all.slice(1)) await c.act({ t: 'arrange', cards: bestArrangement(c.state.hand.seats[c.seat].cards) });
  await watcher.sync();
  assert.equal(watcher.state.hand.phase, 'done');
  assert.ok(cardsSeen(watcher, DECK).length >= 39, 'revealed (plus the whole deck in the fairness reveal)');
  [...all, watcher].forEach((c) => c.close());
});

test('Tichu: hidden 6 cards during Grand Tichu, hidden passes, no out-of-turn non-bombs, bad wishes and targets', async () => {
  const { all, code } = await seated('tichu', 4);
  const watcher = await new Client(server, code, { nick: 'Watch' }).join({ sit: false });
  for (const c of all) {
    const mine = c.state.hand.seats[c.seat].cards;
    assert.equal(mine.length, 8, 'only the first 8 cards during Grand Tichu');
    for (const card of cardsSeen(c, TICHU_DECK)) assert.ok(mine.includes(card), `${c.nick} saw ${card}`);
  }
  for (const c of all) await c.act({ t: 'grand', call: false });
  await Promise.all(all.map((c) => c.sync()));
  for (const c of all) {
    const mine = c.state.hand.seats[c.seat].cards;
    assert.equal(mine.length, 14);
    for (const card of cardsSeen(c, TICHU_DECK)) assert.ok(mine.includes(card));
  }
  // passing: a gift is invisible to everyone until all four passed, then only to its receiver
  const gifts = all.map((c) => c.state.hand.seats[c.seat].cards.slice(0, 3));
  assert.equal(await errOf(all[0], { t: 'exchange', cards: [gifts[1][0], gifts[0][1], gifts[0][2]] }), 'not_your_cards');
  assert.equal(await errOf(all[0], { t: 'exchange', cards: gifts[0].slice(0, 2) }), 'bad_cards');
  assert.equal(await errOf(all[0], { t: 'exchange', cards: ['MJ', 'MJ', 'DG'] }), 'bad_cards');
  for (let i = 0; i < 3; i++) await all[i].act({ t: 'exchange', cards: gifts[i] });
  await all[3].sync();
  for (const card of cardsSeen(all[3], TICHU_DECK)) assert.ok(all[3].state.hand.seats[all[3].seat].cards.includes(card), 'no gift leaked before the swap');
  await all[3].act({ t: 'exchange', cards: gifts[3] });
  await Promise.all(all.map((c) => c.sync()));
  for (const c of all) {
    const mine = c.state.hand.seats[c.seat].cards;
    assert.equal(mine.length, 14);
    for (const card of cardsSeen(c, TICHU_DECK)) assert.ok(mine.includes(card), `${c.nick} saw ${card} after the swap`);
  }
  await watcher.sync();
  assert.equal(cardsSeen(watcher, TICHU_DECK).length, 0, 'spectator sees no hands');
  // turn order and shapes
  const h = all[0].state.hand;
  const leader = all.find((c) => c.seat === h.turn);
  const other = all.find((c) => c !== leader);
  const lc = leader.state.hand.seats[leader.seat].cards;
  const oc = other.state.hand.seats[other.seat].cards;
  assert.equal(await errOf(other, { t: 'play', cards: [oc.find((x) => x !== 'DG')] }), 'not_your_turn', 'no single out of turn');
  assert.equal(await errOf(leader, { t: 'play', cards: ['MJ'], wish: '9' }), 'bad_wish');
  assert.equal(await errOf(leader, { t: 'play', cards: ['MJ'], wish: 15 }), 'bad_wish');
  assert.equal(await errOf(leader, { t: 'play', cards: [oc[0]] }), 'not_your_cards');
  assert.equal(await errOf(leader, { t: 'pass' }), 'must_lead');
  assert.equal(await errOf(leader, { t: 'giveDragon', seat: 1 }), 'wrong_phase');
  assert.equal(await errOf(leader, { t: 'grand', call: true }), 'wrong_phase');
  assert.equal(await errOf(leader, { t: 'play', cards: lc.slice(0, 1), wish: 9, x: 1 }), 'unknown_field');
  assert.equal(await errOf(watcher, { t: 'tichu' }), 'not_seated');
  [...all, watcher].forEach((c) => c.close());
});
