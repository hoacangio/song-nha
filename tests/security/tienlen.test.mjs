// Tiến lên protocol security over real WebSockets.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, createTable, Client } from '../helpers.mjs';
import { DECK } from '../../public/js/domain/cards.js';
import { suggestPlay } from '../../public/js/domain/tienlen.js';

let server;
before(async () => (server = await startServer({ port: 0, quiet: true })));
after(async () => server.close());

const NO_INSTANT = { instantDragon: false, instantFour2: false, instantSixPairs: false, instantFivePairSeq: false };

async function table4() {
  const { body, secret } = await createTable(server, { game: 'tienlen', options: { game: NO_INSTANT } });
  const host = await new Client(server, body.code, { secret, nick: 'Host' }).join();
  const others = [];
  for (const nick of ['An', 'Binh', 'Cuc']) others.push(await new Client(server, body.code, { nick }).join());
  const all = [host, ...others];
  await host.act({ t: 'start' });
  await Promise.all(all.map((c) => c.sync()));
  return { host, all };
}

const errOf = async (c, msg) => (await c.exchange(msg)).err ?? 'ok';

test('each socket only ever receives its own 13 cards', async () => {
  const { all } = await table4();
  for (const c of all) {
    const st = c.state;
    const mine = st.hand.seats[st.you.seat].cards;
    assert.equal(mine.length, 13);
    const last = c.raw.filter((r) => r.includes('"state"')).pop();
    const seen = DECK.filter((card) => last.includes(`"${card}"`));
    for (const card of seen) assert.ok(mine.includes(card), `${c.nick} received ${card}`);
    st.hand.seats.forEach((s, i) => s && i !== st.you.seat && assert.equal(s.cards, null));
  }
  all.forEach((c) => c.close());
});

test('plays out of turn, with foreign cards, invalid combos or bad shapes are rejected', async () => {
  const { all } = await table4();
  const leader = all.find((c) => c.state.hand.turn === c.seat);
  const other = all.find((c) => c !== leader);
  const mine = leader.state.hand.seats[leader.seat].cards;
  const theirs = other.state.hand.seats[other.seat].cards;
  assert.equal(await errOf(other, { t: 'play', cards: [theirs[0]] }), 'not_your_turn');
  assert.equal(await errOf(leader, { t: 'play', cards: [theirs[0]] }), 'not_your_cards');
  assert.equal(await errOf(leader, { t: 'play', cards: [mine[0], mine[0]] }), 'bad_cards');
  assert.equal(await errOf(leader, { t: 'play', cards: ['1X'] }), 'bad_cards');
  assert.equal(await errOf(leader, { t: 'play', cards: mine.concat(['ZZ']) }), 'bad_cards');
  assert.equal(await errOf(leader, { t: 'play', cards: {} }), 'bad_cards');
  assert.equal(await errOf(leader, { t: 'play', cards: [] }), 'bad_cards');
  assert.equal(await errOf(leader, { t: 'pass' }), 'must_lead');
  assert.equal(await errOf(leader, { t: 'play', cards: ['3S'], extra: 1 }), 'unknown_field');
  assert.equal(await errOf(leader, { t: 'bet', amount: 10 }), 'bad_action', 'Xì dách intents do nothing here');
  // the 3♠ requirement is only revealed to the leader
  assert.equal(leader.state.hand.mustInclude, '3S');
  assert.equal(other.state.hand.mustInclude, null);
  all.forEach((c) => c.close());
});

test('a whole game over sockets: hands revealed only at the end, chips conserved', async () => {
  const { all } = await table4();
  const sum = (st) => st.seats.reduce((s, x) => s + (x ? x.chips : 0), 0);
  const before = sum(all[0].state);
  for (let i = 0; i < 300; i++) {
    await Promise.all(all.map((c) => c.sync()));
    const h = all[0].state.hand;
    if (h.phase === 'done') break;
    const c = all.find((x) => x.seat === h.turn);
    const ch = c.state.hand;
    const cards = suggestPlay(ch.seats[c.seat].cards, ch.trick?.combo ?? null, c.state.opts.game, ch.mustInclude);
    await c.act(cards ? { t: 'play', cards } : { t: 'pass' });
  }
  const end = all[0].state;
  assert.equal(end.hand.phase, 'done');
  assert.equal(sum(end), before);
  // before the end no frame to a player contained another player's cards (checked on the last pre-end frame)
  for (const c of all) {
    const frames = c.messages.filter((m) => m.t === 'state' && m.hand && m.hand.phase !== 'done');
    for (const m of frames) m.hand.seats.forEach((s, i) => s && i !== m.you.seat && assert.equal(s.cards, null));
  }
  all.forEach((c) => c.close());
});
