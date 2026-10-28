// Tichu rules (pure) and the table engine through the core.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TICHU_DECK,
  detectCombo,
  canBeat,
  allPlays,
  legalPlays,
  wishPlays,
  pointsOf,
  botExchange,
  botPlay,
  isTichuCardList,
} from '../../public/js/domain/tichu.js';
import { createTable, handle, tick, snapshot, seatOf } from '../../src/table/core.js';
import { partnerOf, teamOf } from '../../src/games/tichu/engine.js';

const d = (s, prev) => detectCombo(s.split(' '), prev);

test('deck: 56 distinct cards worth 100 points', () => {
  assert.equal(TICHU_DECK.length, 56);
  assert.equal(new Set(TICHU_DECK).size, 56);
  assert.equal(pointsOf(TICHU_DECK), 100);
  assert.ok(isTichuCardList(['MJ', 'DG', 'PH', 'DR', '2S']));
  assert.ok(!isTichuCardList(['MJ', 'MJ']));
  assert.ok(!isTichuCardList(['XX']));
});

test('combinations, with the Phoenix as a wild card and the Mah Jong as 1', () => {
  assert.deepEqual(d('5S 5D'), { type: 'pair', len: 1, value: 5 });
  assert.deepEqual(d('5S PH'), { type: 'pair', len: 1, value: 5 });
  assert.equal(d('5S 5D PH').type, 'triple');
  assert.equal(d('5S 5D 5C 5H').type, 'bomb4');
  assert.equal(d('5S 5D 5C PH'), null, 'the Phoenix never makes a bomb');
  assert.deepEqual(d('5S 5D 9C 9H PH'), { type: 'full', len: 5, value: 9 }, 'Phoenix joins the higher pair');
  assert.deepEqual(d('MJ 2S 3D 4C 5H'), { type: 'straight', len: 5, value: 5 });
  assert.deepEqual(d('AS KD QS JS PH'), { type: 'straight', len: 5, value: 14 });
  assert.deepEqual(d('3S 4S 5S 6S 7S'), { type: 'bombsf', len: 5, value: 7 });
  assert.deepEqual(d('3S 4S 5S 6S PH').type, 'straight');
  assert.deepEqual(d('3S 3D 4C 4H'), { type: 'pairs', len: 2, value: 4 });
  assert.deepEqual(d('3S 3D 4C PH'), { type: 'pairs', len: 2, value: 4 });
  assert.equal(d('3S 3D 5C 5H'), null, 'pairs must be consecutive');
  assert.equal(d('MJ 2S'), null, 'Mah Jong only in straights');
  assert.equal(d('DR 2S'), null);
  assert.equal(d('DG').type, 'dog');
});

test('beating: same type and size; bombs beat everything; Phoenix ½ above; Dragon only by bombs', () => {
  assert.ok(canBeat(d('9S 9D'), d('TS TD')));
  assert.ok(!canBeat(d('9S 9D'), d('8S 8D')));
  assert.ok(!canBeat(d('9S 9D'), d('TS TD TC')));
  assert.ok(!canBeat(d('3S 4D 5C 6H 7S'), d('4S 5D 6C 7H 8S 9C')), 'straights must be the same length');
  assert.ok(canBeat(d('AS AD'), d('2S 2D 2C 2H')), 'bomb on a pair');
  assert.ok(canBeat(d('KS KD KC KH'), d('3H 4H 5H 6H 7H')), 'straight flush beats four of a kind');
  assert.ok(canBeat(d('3H 4H 5H 6H 7H'), d('2C 3C 4C 5C 6C 7C')), 'longer straight flush wins');
  assert.ok(!canBeat(d('KS KD KC KH'), d('AS AD')));
  const ace = d('AS');
  assert.equal(d('PH', ace).value, 14.5);
  assert.ok(canBeat(ace, d('PH', ace)));
  assert.ok(!canBeat(d('DR'), d('PH', d('DR'))));
  assert.ok(canBeat(d('PH', ace), d('DR')));
  assert.ok(canBeat(d('DR'), d('2S 2D 2C 2H')));
  assert.ok(canBeat(null, d('DG')));
  assert.ok(!canBeat(d('3S'), d('DG')));
});

test('play generator: straights with Mah Jong / Phoenix, pairs runs, bombs; wishes', () => {
  const hand = 'MJ 2S 3D 4C 6H PH 8S 8D 9C 9H KS KD KC KH'.split(' ');
  const types = new Set(allPlays(hand).map((p) => p.combo.type));
  for (const t of ['single', 'pair', 'triple', 'full', 'straight', 'pairs', 'bomb4', 'dog'].filter((x) => x !== 'dog')) assert.ok(types.has(t), t);
  assert.ok(allPlays(hand).some((p) => p.combo.type === 'straight' && p.cards.includes('MJ') && p.cards.includes('PH')), 'MJ-2-3-4-PH(5)-6');
  assert.ok(legalPlays(hand, d('7S 7D')).every((p) => p.combo.type === 'pair' || p.combo.type.startsWith('bomb')));
  assert.ok(wishPlays(hand, d('7S 7D'), 9).length, 'can fulfil a wish for 9 with 9-9');
  assert.equal(wishPlays(hand, d('TS TD'), 9).length, 0, '9-9 cannot beat 10-10');
  assert.equal(wishPlays(hand, null, 5).length, 0, 'no 5 in hand');
  assert.ok(wishPlays(hand, d('QS QD'), 13).every((p) => !p.combo.type.startsWith('bomb')), 'bombs are never compulsory');
});

test('bots: exchange gives three own distinct cards; plays are legal and respect wishes', () => {
  const hand = 'MJ DG PH DR 2S 3S 4S 5S 6S 7D 7H 9C 9H AS'.split(' ');
  const g = botExchange(hand);
  assert.equal(new Set(g).size, 3);
  assert.ok(g.every((c) => hand.includes(c)));
  const lead = botPlay(hand, { prev: null, wish: null, partnerOut: false, partnerCount: 14, oppMinCount: 14, myCount: 14 });
  assert.ok(detectCombo(lead.cards));
  assert.ok(!lead.cards.some((c) => ['2S', '3S', '4S', '5S', '6S'].includes(c)) || detectCombo(lead.cards).type === 'bombsf', 'does not break its bomb');
  const forced = botPlay(hand, { prev: d('8S 8D'), wish: 9, partnerOut: false, partnerCount: 14, oppMinCount: 14, myCount: 14 });
  assert.deepEqual(forced.cards.sort(), ['9C', '9H']);
});

// ---------- engine through the table core ----------
const P = [
  { pid: 'host', isHost: true, nick: 'Host' },
  { pid: 'aaaa', isHost: false, nick: 'An' },
  { pid: 'bbbb', isHost: false, nick: 'Bình' },
  { pid: 'cccc', isHost: false, nick: 'Cúc' },
];
const H = P[0];

async function table4(game = {}) {
  const t = createTable({ code: 'TICH-1234', game: 'tichu', options: { game }, hostKey: 'k', now: 0 });
  for (const a of P) await handle(t, a, { t: 'sit' }, 0);
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
const actorAt = (t, seat) => P.find((a) => seatOf(t, a.pid) === seat);
const view = (t, a) => snapshot(t, { pid: a.pid, isHost: a.isHost, connected: new Set() }, 1).hand;
const total = (t) => t.seats.reduce((s, x) => s + (x ? x.chips : 0), 0);

test('needs exactly four players; teams sit opposite', async () => {
  const t = createTable({ code: 'TICH-1235', game: 'tichu', options: {}, hostKey: 'k', now: 0 });
  assert.equal(t.seats.length, 4);
  await handle(t, H, { t: 'sit' }, 0);
  assert.equal(await err(t, H, { t: 'start' }), 'cannot_start');
  const t4 = await table4();
  await handle(t4, H, { t: 'start' }, 0);
  const h = t4.hand;
  assert.equal(partnerOf(h, 0), 2);
  assert.equal(partnerOf(h, 1), 3);
  assert.equal(teamOf(h, 0), teamOf(h, 2));
  assert.notEqual(teamOf(h, 0), teamOf(h, 1));
});

test('grand phase shows only 8 cards; exchange swaps 3 cards each; received only visible to the receiver; Mah Jong leads', async () => {
  const t = await table4();
  await handle(t, H, { t: 'start' }, 0);
  let h = t.hand;
  assert.equal(h.phase, 'grand');
  for (const a of P) {
    const v = view(t, a);
    assert.equal(v.seats[seatOf(t, a.pid)].cards.length, 8);
    for (const o of P) if (o !== a) assert.equal(v.seats[seatOf(t, o.pid)].cards, null);
  }
  assert.equal(await err(t, P[1], { t: 'grand', call: 'yes' }), 'bad_options');
  assert.equal(await err(t, P[1], { t: 'tichu' }), 'wrong_phase');
  await handle(t, P[1], { t: 'grand', call: true }, 1);
  assert.equal(await err(t, P[1], { t: 'grand', call: false }), 'already_decided');
  for (const a of [P[0], P[2], P[3]]) await handle(t, a, { t: 'grand', call: false }, 1);
  h = t.hand;
  assert.equal(h.phase, 'exchange');
  assert.equal(view(t, P[0]).seats[seatOf(t, P[0].pid)].cards.length, 14);
  const before = P.map((a) => h.hands[seatOf(t, a.pid)].slice());
  const theirs = before[1];
  assert.equal(await err(t, P[0], { t: 'exchange', cards: [theirs[0], before[0][1], before[0][2]] }), 'not_your_cards');
  assert.equal(await err(t, P[0], { t: 'exchange', cards: before[0].slice(0, 2) }), 'bad_cards');
  assert.equal(await err(t, P[0], { t: 'exchange', cards: [before[0][0], before[0][0], before[0][1]] }), 'bad_cards');
  const gifts = P.map((a, i) => before[i].slice(0, 3));
  for (let i = 0; i < 4; i++) {
    await handle(t, P[i], { t: 'exchange', cards: gifts[i] }, 2);
    if (i < 3) assert.equal(view(t, P[(i + 1) % 4]).received, null, 'nothing revealed before everyone passed');
  }
  h = t.hand;
  assert.equal(h.phase, 'play');
  for (let i = 0; i < 4; i++) {
    const s = seatOf(t, P[i].pid);
    assert.equal(h.hands[s].length, 14);
    // seat i received: from previous (toNext), from partner, from next (toPrev)
    const got = view(t, P[i]).received.map((x) => x.card).sort();
    const expect = [gifts[(i + 3) % 4][0], gifts[(i + 2) % 4][1], gifts[(i + 1) % 4][2]].sort();
    assert.deepEqual(got, expect);
  }
  assert.ok(h.hands[h.turn].includes('MJ'), 'Mah Jong holder leads');
  assert.equal(h.calls[seatOf(t, P[1].pid)], 'grand');
});

/** Deals a fixed position: seat hands in play phase (skips grand/exchange). */
function forceHands(t, hands, turn) {
  const h = t.hand;
  h.phase = 'play';
  h.hands = hands.map((x) => x.split(' '));
  h.full = h.hands.map((x) => x.slice());
  h.grand = [false, false, false, false];
  h.give = [[], [], [], []];
  h.turn = turn;
  h.lead = turn;
  h.deadline = 10_000;
}

test('wish, out-of-turn bombs, the Dog and the Dragon', async () => {
  const t = await table4();
  await handle(t, H, { t: 'start' }, 0);
  forceHands(t, ['MJ 3S 9D 9C', '9S 4D 7C 7D 7H 7S QH', 'DG 5S 6S KH', 'DR 2S 3D 2H'], 0);
  const [p0, p1, p2, p3] = P;
  assert.equal(await err(t, p0, { t: 'play', cards: ['MJ'], wish: 'Q' }), 'bad_wish');
  assert.equal(await err(t, p0, { t: 'play', cards: ['3S'], wish: 9 }), 'bad_wish');
  assert.equal(await err(t, p0, { t: 'play', cards: ['MJ'], wish: 1 }), 'bad_wish');
  assert.equal(await err(t, p0, { t: 'play', cards: ['MJ'], wish: 9 }), 'ok');
  assert.equal(t.hand.wish, 9);
  // seat 1 holds a 9 and can play it on the Mah Jong: passing or another card is refused
  assert.equal(await err(t, p1, { t: 'pass' }), 'must_wish');
  assert.equal(await err(t, p1, { t: 'play', cards: ['QH'] }), 'must_wish');
  // …but a bomb is always allowed (and out of turn too, for others)
  assert.equal(await err(t, p2, { t: 'play', cards: ['5S'] }), 'not_your_turn');
  assert.equal(await err(t, p1, { t: 'play', cards: ['9S'] }), 'ok');
  assert.equal(t.hand.wish, null, 'wish fulfilled');
  assert.equal(await err(t, p0, { t: 'play', cards: ['7C', '7D', '7H', '7S'] }), 'not_your_cards');
  // seat 1 bombs out of turn on their own trick? allowed (bomb on a single)
  assert.equal(t.hand.turn, 2);
  assert.equal(await err(t, p1, { t: 'play', cards: ['7C', '7D', '7H', '7S'] }), 'ok');
  assert.equal(t.hand.trick.combo.type, 'bomb4');
  assert.equal(t.hand.turn, 2, 'play continues after the bomber');
  // the Dog can only be led
  assert.equal(await err(t, p2, { t: 'play', cards: ['DG'] }), 'cannot_beat');
  for (const a of [p2, p3, p0]) await handle(t, a, { t: 'pass' }, 3);
  assert.equal(t.hand.turn, 1, 'bomber won the trick and leads');
  assert.equal(await err(t, p1, { t: 'play', cards: ['4D'] }), 'ok');
  assert.equal(await err(t, p2, { t: 'play', cards: ['KH'] }), 'ok');
  assert.equal(await err(t, p3, { t: 'play', cards: ['DR'] }), 'ok');
  for (const a of [p0, p1, p2]) await handle(t, a, { t: 'pass' }, 4);
  assert.equal(t.hand.phase, 'dragon');
  assert.equal(await err(t, p0, { t: 'giveDragon', seat: 1 }), 'not_your_turn');
  assert.equal(await err(t, p3, { t: 'giveDragon', seat: 1 }), 'bad_target', 'not to the partner');
  assert.equal(await err(t, p3, { t: 'giveDragon', seat: 0 }), 'ok');
  assert.ok(t.hand.won[0].includes('DR'));
  assert.equal(t.hand.turn, 3);
  // seat 2 leads the Dog later: the lead goes to the partner (seat 0)
  await handle(t, p3, { t: 'play', cards: ['2S'] }, 5);
  for (const a of [p0, p1]) await handle(t, a, { t: 'pass' }, 5);
  assert.equal(await err(t, p2, { t: 'play', cards: ['5S'] }), 'ok');
  for (const a of [p3, p0, p1]) await handle(t, a, { t: 'pass' }, 5);
  assert.equal(await err(t, p2, { t: 'play', cards: ['DG'] }), 'ok');
  assert.equal(t.hand.turn, 0, 'Dog → partner');
});

test('Tichu calls: only before your first card; double victory scores 200 + the call; chips and match score', async () => {
  const t = await table4();
  await handle(t, H, { t: 'start' }, 0);
  forceHands(t, ['MJ 9S', '2S 3D', 'AS 5D', '5S 6D'], 0);
  const [p0, p1, p2, p3] = P;
  assert.equal(await err(t, p2, { t: 'tichu' }), 'ok');
  assert.equal(await err(t, p2, { t: 'tichu' }), 'already_called');
  await handle(t, p0, { t: 'play', cards: ['MJ'] }, 1);
  assert.equal(await err(t, p0, { t: 'tichu' }), 'too_late');
  const before = total(t);
  await handle(t, p1, { t: 'play', cards: ['2S'] }, 2);
  await handle(t, p2, { t: 'play', cards: ['AS'] }, 2);
  for (const a of [p3, p0, p1]) await handle(t, a, { t: 'pass' }, 3);
  assert.equal(t.hand.turn, 2);
  await handle(t, p2, { t: 'play', cards: ['5D'] }, 3);
  assert.deepEqual(t.hand.out, [2]);
  await handle(t, p3, { t: 'play', cards: ['6D'] }, 4);
  await handle(t, p0, { t: 'play', cards: ['9S'] }, 4);
  const h = t.hand;
  assert.equal(h.phase, 'done');
  assert.equal(h.result.double, true);
  const us = teamOf(h, 0);
  assert.equal(h.result.team[us], 200 + 100);
  assert.equal(h.result.team[1 - us], 0);
  assert.deepEqual(h.result.calls, [{ seat: 2, call: 'tichu', ok: true, points: 100 }]);
  assert.equal(total(t), before, 'chips conserved');
  assert.equal(h.result.delta[1], -300);
  assert.equal(h.result.delta[3], -300);
  assert.deepEqual(t.tichuMatch.score[us], 300);
});

test('a failed Tichu costs the caller’s team; the last player’s hand goes to the opponents', async () => {
  const t = await table4();
  await handle(t, H, { t: 'start' }, 0);
  forceHands(t, ['MJ 5S KD', '2S TD', 'AS', '3S 4H'], 0);
  const [p0, p1, p2, p3] = P;
  await handle(t, p1, { t: 'tichu' }, 0);
  await handle(t, p0, { t: 'play', cards: ['MJ'] }, 1);
  await handle(t, p1, { t: 'play', cards: ['2S'] }, 1);
  await handle(t, p2, { t: 'play', cards: ['AS'] }, 1); // seat 2 out first
  for (const a of [p3, p0, p1]) await handle(t, a, { t: 'pass' }, 2);
  assert.equal(t.hand.turn, 3, 'the winner is out: the next player leads');
  await handle(t, p3, { t: 'play', cards: ['3S'] }, 2);
  await handle(t, p0, { t: 'play', cards: ['5S'] }, 2);
  await handle(t, p1, { t: 'play', cards: ['TD'] }, 2); // seat 1 out second (its Tichu fails)
  await handle(t, p3, { t: 'pass' }, 3);
  await handle(t, p0, { t: 'pass' }, 3);
  assert.equal(t.hand.turn, 3);
  await handle(t, p3, { t: 'play', cards: ['4H'] }, 3); // seat 3 out third; seat 0 is last with K♦
  const h = t.hand;
  assert.equal(h.phase, 'done');
  assert.deepEqual(h.out, [2, 1, 3]);
  assert.deepEqual(h.result.calls, [{ seat: 1, call: 'tichu', ok: false, points: -100 }]);
  // seat 1's trick (3, 5, 10) = 15; seat 0's leftover K♦ (10) goes to the opponents → their cards = 25, minus 100
  assert.equal(h.result.team[teamOf(h, 1)], 25 - 100);
  assert.equal(h.result.team[teamOf(h, 0)], 0);
});

test('bots play whole hands: every card ends somewhere, points add up, chips are conserved, the match resets at the target', async () => {
  const t = createTable({ code: 'TICH-1240', game: 'tichu', options: { game: { target: 300 } }, hostKey: 'k', now: 0 });
  for (let i = 0; i < 4; i++) await handle(t, H, { t: 'addBot' }, 0);
  const before = total(t);
  let now = 0;
  let matches = 0;
  for (let k = 0; k < 25; k++) {
    await handle(t, H, { t: 'start' }, now);
    for (let i = 0; i < 3000 && t.hand.phase !== 'done'; i++) await tick(t, (now += 1000));
    const h = t.hand;
    assert.equal(h.phase, 'done', `hand ${k} finished`);
    const all = [...h.won.flat(), ...h.hands.flat()];
    assert.equal(all.length, 56);
    assert.equal(new Set(all).size, 56);
    const calls = h.result.calls.reduce((s, c) => s + c.points, 0);
    if (!h.result.double) assert.equal(h.result.team[0] + h.result.team[1] - calls, 100);
    if (h.result.match.over != null) matches++;
    if (t.seats.some((s) => s.chips <= 0)) break;
  }
  assert.equal(total(t), before);
  assert.ok(matches >= 1, 'a 300-point match finishes within 25 hands');
});
