// Tiến lên flows through the table core (no sockets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable, handle, tick, snapshot, seatOf } from '../../src/table/core.js';
import { suggestPlay, detectCombo, sortCards } from '../../public/js/domain/tienlen.js';

const H = { pid: 'host', isHost: true, nick: 'Host' };
const A = { pid: 'aaaa', isHost: false, nick: 'An' };
const B = { pid: 'bbbb', isHost: false, nick: 'Bình' };
const C = { pid: 'cccc', isHost: false, nick: 'Cúc' };
const ALL = [H, A, B, C];
const none = new Set();

async function table(actors = ALL, game = {}) {
  const t = createTable({ code: 'SONG-002', game: 'tienlen', options: { game }, hostKey: 'k', now: 0 });
  for (const a of actors) await handle(t, a, { t: 'sit' }, 0);
  return t;
}

const err = async (t, actor, msg, now = 1) => {
  try {
    await handle(t, actor, msg, now);
    return 'ok';
  } catch (e) {
    return e.code;
  }
};

const total = (t) => t.seats.reduce((s, x) => s + (x ? x.chips : 0), 0);
const actorAt = (t, seat) => ALL.find((a) => seatOf(t, a.pid) === seat);

/** Plays a whole game with the suggestion engine; returns the number of moves. */
async function playOut(t, now = 1) {
  let moves = 0;
  while (t.hand.phase !== 'done' && moves < 400) {
    const h = t.hand;
    const seat = h.turn;
    const hand = h.hands[seat];
    const cards = suggestPlay(hand, h.trick?.combo ?? null, t.opts.game, h.mustInclude);
    await handle(t, actorAt(t, seat), cards ? { t: 'play', cards } : { t: 'pass' }, (now += 10));
    moves++;
  }
  return moves;
}

test('deal: 13 cards each, 3♠ holder leads with 4 players, chips conserved over a full game', async () => {
  const t = await table(ALL, { instantDragon: false, instantFour2: false, instantSixPairs: false, instantFivePairSeq: false });
  const before = total(t);
  await handle(t, H, { t: 'start' }, 0);
  const h = t.hand;
  for (const p of h.players) assert.equal(h.hands[p].length, 13);
  const all = h.players.flatMap((p) => h.hands[p]);
  assert.equal(new Set(all).size, 52);
  assert.ok(h.hands[h.leader].includes('3S'));
  assert.equal(h.mustInclude, '3S');
  await playOut(t);
  assert.equal(t.hand.phase, 'done');
  assert.equal(total(t), before, 'zero-sum');
  const w = t.hand.result.winner;
  assert.equal(t.hand.hands[w].length, 0);
  assert.equal(t.history.length, 1);
  assert.equal(t.tlWinnerPid, t.seats[w].pid);
});

test('first play must include 3♠; illegal plays are rejected', async () => {
  const t = await table(ALL, { instantDragon: false, instantFour2: false, instantSixPairs: false, instantFivePairSeq: false });
  await handle(t, H, { t: 'start' }, 0);
  const h = t.hand;
  const leader = actorAt(t, h.leader);
  const other = actorAt(t, h.players.find((p) => p !== h.leader));
  const hand = h.hands[h.leader];
  const notThree = hand.find((c) => c !== '3S');
  assert.equal(await err(t, leader, { t: 'play', cards: [notThree] }), 'must_include');
  assert.equal(await err(t, leader, { t: 'pass' }), 'must_lead');
  assert.equal(await err(t, other, { t: 'play', cards: [h.hands[seatOf(t, other.pid)][0]] }), 'not_your_turn');
  const foreign = h.hands[seatOf(t, other.pid)][0];
  assert.equal(await err(t, leader, { t: 'play', cards: ['3S', foreign] }), 'not_your_cards');
  assert.equal(await err(t, leader, { t: 'play', cards: ['3S', '3S'] }), 'bad_cards');
  assert.equal(await err(t, leader, { t: 'play', cards: ['ZZ'] }), 'bad_cards');
  assert.equal(await err(t, leader, { t: 'play', cards: 'nope' }), 'bad_cards');
  const junk = hand.filter((c) => c !== '3S').slice(0, 1);
  if (!detectCombo(['3S', ...junk])) assert.equal(await err(t, leader, { t: 'play', cards: ['3S', ...junk] }), 'bad_combo');
  assert.equal(await err(t, leader, { t: 'play', cards: ['3S'] }), 'ok');
  // the next player cannot play a lower single
  const nxt = actorAt(t, t.hand.turn);
  assert.equal(await err(t, nxt, { t: 'play', cards: ['3S'] }), 'not_your_cards');
});

/** Builds a hand-crafted game: fixed hands, given leader. */
async function rigged(hands, { leader = 0, game = {} } = {}) {
  const t = await table(ALL.slice(0, hands.length), { instantDragon: false, instantFour2: false, instantSixPairs: false, instantFivePairSeq: false, ...game });
  await handle(t, H, { t: 'start' }, 0);
  const h = t.hand;
  hands.forEach((cards, i) => (h.hands[i] = sortCards(cards)));
  h.leader = h.turn = leader;
  h.mustInclude = null;
  return t;
}

test('passing removes you from the round; round resets to the last player', async () => {
  const t = await rigged([
    ['3S', '9H', 'KH'],
    ['4S', '5S'],
    ['6S', '7S'],
  ]);
  await handle(t, H, { t: 'play', cards: ['3S'] }, 1);
  await handle(t, A, { t: 'play', cards: ['4S'] }, 2);
  await handle(t, B, { t: 'pass' }, 3);
  await handle(t, H, { t: 'pass' }, 4);
  // B and H passed → A leads a fresh round
  assert.equal(t.hand.trick, null);
  assert.equal(t.hand.turn, 1);
  assert.ok(t.hand.passed.every((x) => !x), 'passes cleared');
});

test('chặt heo pays immediately; chặt chồng accumulates', async () => {
  const t = await rigged([
    ['2H', '9C', '9D'],
    ['3S', '3H', '4S', '4H', '5S', '5H', 'KC'],
    ['JS', 'JC', 'JD', 'JH', 'QC'],
  ]);
  const unit = t.opts.game.unit;
  const c0 = t.seats.map((s) => s?.chips);
  await handle(t, H, { t: 'play', cards: ['2H'] }, 1);
  await handle(t, A, { t: 'play', cards: ['3S', '3H', '4S', '4H', '5S', '5H'] }, 2); // 3 đôi thông chặt 2♥
  assert.equal(t.seats[0].chips, c0[0] - 10 * unit);
  assert.equal(t.seats[1].chips, c0[1] + 10 * unit);
  await handle(t, B, { t: 'play', cards: ['JS', 'JC', 'JD', 'JH'] }, 3); // tứ quý chặt 3 đôi thông
  assert.deepEqual(t.hand.lastChop, { from: 1, to: 2, points: 10 + 5, chips: 15 * unit });
  assert.equal(t.seats[2].chips, c0[2] + 15 * unit);
});

test('chopPay off: no payment for chặt', async () => {
  const t = await rigged([['2H', '9C'], ['JS', 'JC', 'JD', 'JH', 'QC']], { game: { chopPay: false } });
  const c0 = t.seats.map((s) => s?.chips);
  await handle(t, H, { t: 'play', cards: ['2H'] }, 1);
  await handle(t, A, { t: 'play', cards: ['JS', 'JC', 'JD', 'JH'] }, 2);
  assert.deepEqual(t.seats.map((s) => s?.chips), c0);
});

test('end of game: losers pay per card, cóng and thối 2', async () => {
  const t = await rigged([
    ['3S'],
    ['5S', '2S', '2H'],
    ['6S', '7C', '8D', '9H', 'TC'],
  ]);
  // make seat 1 have played already, seat 2 never played (cóng)
  t.hand.played[1] = true;
  const unit = t.opts.game.unit;
  const D = t.opts.game;
  const c0 = t.seats.map((s) => s?.chips);
  await handle(t, H, { t: 'play', cards: ['3S'] }, 1);
  assert.equal(t.hand.phase, 'done');
  const p1 = 3 * D.perCard + D.thoi2Black + D.thoi2Red;
  const p2 = D.cong;
  assert.equal(t.seats[1].chips, c0[1] - p1 * unit);
  assert.equal(t.seats[2].chips, c0[2] - p2 * unit);
  assert.equal(t.seats[0].chips, c0[0] + (p1 + p2) * unit);
  const rows = t.history[0].rows;
  assert.equal(rows.find((r) => r.nick === 'Bình').kind, 'cong');
});

test('tới trắng ends the game at the deal', async () => {
  // Force a dragon by rigging the deck order: give seat 0 every rank 3..A (+ a 2).
  const t = await table(ALL.slice(0, 2));
  const coreMod = await import('../../src/games/tienlen/engine.js');
  const dragon = ['3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS', 'AS', '2S'];
  const rest = ['3C', '4C', '5C', '6C', '7C', '8C', '9C', 'TC', 'JC', 'QC', 'KC', '2C', '3D']; // no A → not a dragon
  const deck = [];
  for (let i = 12; i >= 0; i--) deck.push(rest[i], dragon[i]); // popped alternately: seat0 then seat1
  const h = coreMod.startHand(t, deck, 0); // pop() deals seat 0 first: dragon[0], rest[0], dragon[1]…
  assert.equal(h.phase, 'done');
  assert.equal(h.result.instant, 'dragon');
  assert.equal(h.result.winner, 0);
  assert.equal(h.result.rows[1].delta, -t.opts.game.toiTrang * t.opts.game.unit);
});

test('only the owner sees their hand; everyone sees counts and the trick', async () => {
  const t = await table();
  await handle(t, H, { t: 'start' }, 0);
  if (t.hand.phase === 'done') return; // tới trắng — all public
  const v = snapshot(t, { ...A, connected: none }, 1);
  const me = seatOf(t, A.pid);
  v.hand.seats.forEach((s, i) => {
    if (!s) return;
    assert.equal(s.count, 13);
    if (i === me) assert.deepEqual(s.cards, t.hand.hands[i]);
    else assert.equal(s.cards, null);
  });
  const blob = JSON.stringify(v);
  for (const p of t.hand.players) if (p !== me) for (const c of t.hand.hands[p]) assert.ok(!blob.includes(`"${c}"`), `${c} leaked`);
});

test('timeouts: leader auto-plays (incl. 3♠), follower auto-passes; bots finish a game', async () => {
  const t = await table([H]);
  for (let i = 0; i < 3; i++) await handle(t, H, { t: 'addBot' }, 0);
  await handle(t, H, { t: 'start' }, 0);
  let now = 0;
  for (let i = 0; i < 400 && t.hand.phase !== 'done'; i++) await tick(t, (now += 31_000));
  assert.equal(t.hand.phase, 'done');
  // next game starts automatically, led by the previous winner
  const winnerPid = t.tlWinnerPid;
  await tick(t, (now += 9000));
  if (t.hand.phase !== 'done') assert.equal(t.seats[t.hand.leader].pid, winnerPid);
});

test('options are sanitised', async () => {
  const t = await table([H, A]);
  await handle(t, H, { t: 'settings', options: { game: { unit: -5, chopPay: 'yes', cong: 999 } } }, 0);
  assert.equal(t.opts.game.unit, 1);
  assert.equal(t.opts.game.chopPay, true);
  assert.equal(t.opts.game.cong, 100);
  assert.equal(t.opts.seats, 4);
});
