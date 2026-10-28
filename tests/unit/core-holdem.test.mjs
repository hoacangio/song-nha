// Hold'em flows through the table core (no sockets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable, handle, tick, snapshot, seatOf } from '../../src/table/core.js';
import * as engine from '../../src/games/holdem/engine.js';

const P = ['host', 'aaaa', 'bbbb', 'cccc', 'dddd'].map((pid, i) => ({ pid, isHost: i === 0, nick: pid }));
const none = new Set();

async function table(n = 3, game = {}, startChips = 1000) {
  const t = createTable({ code: 'SONG-003', game: 'holdem', options: { game, startChips }, hostKey: 'k', now: 0 });
  for (const a of P.slice(0, n)) await handle(t, a, { t: 'sit' }, 0);
  return t;
}
const at = (t, seat) => P.find((a) => seatOf(t, a.pid) === seat);
const turn = (t) => at(t, t.hand.turn);
const chips = (t) => t.seats.reduce((s, x) => s + (x ? x.chips : 0), 0) + (t.hand && t.hand.phase !== 'done' ? t.hand.contrib.reduce((s, x) => s + x, 0) : 0);
const err = async (t, a, msg) => {
  try {
    await handle(t, a, msg, 1);
    return 'ok';
  } catch (e) {
    return e.code;
  }
};

/** Rigs the next hand: fixed hole cards and board (deck order is popped from the end). */
function rig(holes, board, players) {
  // deal order: two rounds over players (left of button first), then burn+3, burn+1, burn+1
  const seq = [];
  for (let r = 0; r < 2; r++) for (const p of players) seq.push(holes[p][r]);
  seq.push('XX', board[0], board[1], board[2], 'XX', board[3], 'XX', board[4]);
  return seq.reverse();
}

test('blinds, button, preflop order (3 players)', async () => {
  const t = await table(3);
  await handle(t, P[0], { t: 'start' }, 0);
  const h = t.hand;
  assert.equal(h.button, 0);
  assert.equal(h.sb, 1);
  assert.equal(h.bb, 2);
  assert.equal(h.bet[1], 5);
  assert.equal(h.bet[2], 10);
  assert.equal(h.turn, 0, 'UTG is the button with 3 players');
  assert.equal(chips(t), 3000);
  for (const p of h.players) assert.equal(h.hole[p].length, 2);
});

test('heads-up: button posts the small blind and acts first preflop, last after', async () => {
  const t = await table(2);
  await handle(t, P[0], { t: 'start' }, 0);
  const h = t.hand;
  assert.equal(h.button, 0);
  assert.equal(h.sb, 0);
  assert.equal(h.bb, 1);
  assert.equal(h.turn, 0);
  await handle(t, P[0], { t: 'call' }, 1);
  await handle(t, P[1], { t: 'check' }, 2);
  assert.equal(h.street, 'flop');
  assert.equal(h.board.length, 3);
  assert.equal(h.turn, 1, 'big blind acts first after the flop');
});

test('check/call/raise validation and minimum raise', async () => {
  const t = await table(3);
  await handle(t, P[0], { t: 'start' }, 0);
  const utg = turn(t);
  assert.equal(await err(t, utg, { t: 'check' }), 'cannot_check');
  assert.equal(await err(t, utg, { t: 'raise', amount: 15 }), 'min_raise', 'raise to 15 < 10 + 10');
  assert.equal(await err(t, utg, { t: 'raise', amount: 19.5 }), 'bad_amount');
  assert.equal(await err(t, utg, { t: 'raise', amount: -20 }), 'bad_amount');
  assert.equal(await err(t, utg, { t: 'raise', amount: 5000 }), 'bad_amount', 'more than the stack');
  assert.equal(await err(t, P[1], { t: 'call' }), 'not_your_turn');
  assert.equal(await err(t, utg, { t: 'raise', amount: 30 }), 'ok');
  assert.equal(t.hand.minRaise, 20);
  const sb = turn(t);
  assert.equal(await err(t, sb, { t: 'raise', amount: 45 }), 'min_raise', 're-raise must be to ≥ 50');
  assert.equal(await err(t, sb, { t: 'raise', amount: 50 }), 'ok');
  assert.equal(chips(t), 3000);
});

test('everyone folds to the big blind: wins the blinds, no showdown', async () => {
  const t = await table(3);
  await handle(t, P[0], { t: 'start' }, 0);
  await handle(t, turn(t), { t: 'fold' }, 1);
  await handle(t, turn(t), { t: 'fold' }, 2);
  assert.equal(t.hand.phase, 'done');
  assert.equal(t.hand.showdown, false);
  assert.equal(t.seats[2].chips, 1005);
  assert.equal(t.seats[1].chips, 995);
  const v = snapshot(t, { ...P[0], connected: none }, 3);
  assert.equal(v.hand.seats[2].cards, null, 'winner does not have to show');
});

test('full hand to showdown: best hand wins, split pot with odd chip', async () => {
  const t = await table(3);
  // seats 0 (button), 1 (sb), 2 (bb); dealing order from left of the button: 1, 2, 0
  t.hdButton = -1;
  const holes = { 0: ['AS', 'AD'], 1: ['KS', 'KD'], 2: ['2C', '7H'] };
  const deck = rig(holes, ['AH', 'KH', '5C', '9D', '3S'], [1, 2, 0]);
  const h = engine.startHand(t, deck, 0);
  t.hand = h;
  // everyone calls to the river, checks down
  await handle(t, at(t, h.turn), { t: 'call' }, 1); // button calls 10
  await handle(t, at(t, h.turn), { t: 'call' }, 2); // sb completes
  await handle(t, at(t, h.turn), { t: 'check' }, 3); // bb checks
  for (let i = 0; i < 9 && h.phase !== 'done'; i++) await handle(t, at(t, h.turn), { t: 'check' }, 4 + i);
  assert.equal(h.phase, 'done');
  assert.equal(h.showdown, true);
  assert.equal(t.seats[0].chips, 1020, 'set of aces wins 30');
  assert.equal(h.result.rows.find((r) => r.seat === 0).category, 'trips');

  // split: board plays (royal on the board)
  const t2 = await table(3);
  t2.hdButton = -1;
  const deck2 = rig({ 0: ['2C', '3D'], 1: ['4C', '5D'], 2: ['7C', '8D'] }, ['AS', 'KS', 'QS', 'JS', 'TS'], [1, 2, 0]);
  const h2 = engine.startHand(t2, deck2, 0);
  t2.hand = h2;
  await handle(t2, at(t2, h2.turn), { t: 'raise', amount: 21 }, 1); // button raises to 21 (odd total)
  await handle(t2, at(t2, h2.turn), { t: 'fold' }, 2); // sb folds 5
  await handle(t2, at(t2, h2.turn), { t: 'call' }, 3); // bb calls → pot 47
  for (let i = 0; i < 9 && h2.phase !== 'done'; i++) await handle(t2, at(t2, h2.turn), { t: 'check' }, 4 + i);
  // 47 split between seats 2 and 0; odd chip to the first left of the button (seat 2)
  assert.equal(t2.seats[2].chips, 1000 - 21 + 24);
  assert.equal(t2.seats[0].chips, 1000 - 21 + 23);
  assert.equal(chips(t2), 3000);
});

test('all-in with side pots and automatic run-out', async () => {
  const t = createTable({ code: 'SONG-004', game: 'holdem', options: {}, hostKey: 'k', now: 0 });
  for (const a of P.slice(0, 3)) await handle(t, a, { t: 'sit' }, 0);
  t.seats[0].chips = 300;
  t.seats[1].chips = 50; // short stack
  t.seats[2].chips = 1000;
  t.hdButton = -1;
  // best: seat 1 (short) has aces, seat 2 kings, seat 0 queens
  const deck = rig({ 0: ['QS', 'QD'], 1: ['AS', 'AD'], 2: ['KS', 'KD'] }, ['2C', '7H', '9D', '4S', 'JC'], [1, 2, 0]);
  const h = engine.startHand(t, deck, 0);
  t.hand = h;
  await handle(t, at(t, h.turn), { t: 'allin' }, 1); // button all-in 300
  await handle(t, at(t, h.turn), { t: 'allin' }, 2); // sb all-in 50 (short call)
  await handle(t, at(t, h.turn), { t: 'call' }, 3); // bb calls 300
  assert.equal(h.runout, true, 'no one left to bet → run-out');
  const v = snapshot(t, { ...P[0], connected: none }, 4);
  assert.deepEqual(v.hand.seats[1].cards, ['AS', 'AD'], 'hands are shown during the run-out');
  let now = 10;
  for (let i = 0; i < 5 && h.phase !== 'done'; i++) await tick(t, (now += 1500));
  assert.equal(h.phase, 'done');
  assert.equal(h.board.length, 5);
  // main pot 150 → seat 1 (aces); side pot 500 → seat 2 (kings beat queens)
  assert.equal(t.seats[1].chips, 150);
  assert.equal(t.seats[2].chips, 1000 - 300 + 500);
  assert.equal(t.seats[0].chips, 0);
  assert.deepEqual(h.pots.map((p) => p.amount), [150, 500]);
});

test('incomplete all-in raise does not reopen raising for players who already acted', async () => {
  const t = createTable({ code: 'SONG-005', game: 'holdem', options: {}, hostKey: 'k', now: 0 });
  for (const a of P.slice(0, 3)) await handle(t, a, { t: 'sit' }, 0);
  t.seats[0].chips = 1000;
  t.seats[1].chips = 1000;
  t.seats[2].chips = 1000;
  t.hdButton = -1;
  const h = engine.startHand(t, rig({ 0: ['2C', '3C'], 1: ['4D', '5D'], 2: ['6H', '7H'] }, ['AS', 'KD', 'QC', 'JH', '9S'], [1, 2, 0]), 0);
  t.hand = h;
  await handle(t, at(t, 0), { t: 'raise', amount: 100 }, 1); // button raises to 100 (raise of 90)
  t.seats[1].chips = 130; // sb has 125 more → all-in to 135 is only +35 (< 90)
  await handle(t, at(t, 1), { t: 'allin' }, 2);
  assert.equal(h.currentBet, 135);
  await handle(t, at(t, 2), { t: 'call' }, 3);
  // back to the button, who already acted: may call or fold, not re-raise
  assert.equal(h.turn, 0);
  assert.equal(await err(t, at(t, 0), { t: 'raise', amount: 400 }), 'cannot_raise');
  const v = snapshot(t, { ...P[0], connected: none }, 4);
  assert.equal(v.hand.actions.raise, null);
  assert.equal(await err(t, at(t, 0), { t: 'call' }), 'ok');
});

test('privacy: only own hole cards before showdown, never the deck', async () => {
  const t = await table(4);
  await handle(t, P[0], { t: 'start' }, 0);
  const me = seatOf(t, P[1].pid);
  const v = snapshot(t, { ...P[1], connected: none }, 1);
  v.hand.seats.forEach((s, i) => {
    if (!s) return;
    if (i === me) assert.deepEqual(s.cards, t.hand.hole[i]);
    else assert.equal(s.cards, null);
  });
  const blob = JSON.stringify(v);
  for (const c of t.hand.deck) assert.ok(!blob.includes(`"${c}"`));
});

test('timeouts check or fold; bots play whole hands; chips are conserved over many hands', async () => {
  const t = await table(1);
  for (let i = 0; i < 4; i++) await handle(t, P[0], { t: 'addBot' }, 0);
  await handle(t, P[0], { t: 'start' }, 0);
  let now = 0;
  let hands = 0;
  for (let i = 0; i < 4000 && hands < 25; i++) {
    const before = t.handNo;
    await tick(t, (now += 2000));
    if (t.handNo !== before) hands++;
    assert.equal(chips(t), 5000);
  }
  assert.ok(hands >= 10, `played ${hands} hands`);
});
