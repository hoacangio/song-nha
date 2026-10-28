// Mậu binh rules (pure) and the table engine through the core.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate,
  compare,
  judge,
  chiPoints,
  specialOf,
  versus,
  settle,
  bestArrangement,
  greedyArrange,
  CAT,
  MAUBINH_DEFAULTS as D,
  DECK,
} from '../../public/js/domain/maubinh.js';
import { createTable, handle, tick, snapshot, seatOf } from '../../src/table/core.js';

const C = (s) => s.split(' ');
const ev = (s) => evaluate(C(s));

test('categories for 5- and 3-card chi', () => {
  assert.equal(ev('9H TH JH QH KH').cat, CAT.STRAIGHT_FLUSH);
  assert.equal(ev('7S 7C 7D 7H 2S').cat, CAT.QUADS);
  assert.equal(ev('QS QD QH 4C 4D').cat, CAT.FULL);
  assert.equal(ev('2D 6D 9D JD KD').cat, CAT.FLUSH);
  assert.equal(ev('5C 6D 7S 8H 9C').cat, CAT.STRAIGHT);
  assert.equal(ev('8S 8D 8H KC 3D').cat, CAT.TRIPS);
  assert.equal(ev('JS JH 5C 5D AS').cat, CAT.TWO_PAIR);
  assert.equal(ev('AS AD 9C 6H 3S').cat, CAT.PAIR);
  assert.equal(ev('KS TD 8C 5H 2D').cat, CAT.HIGH);
  // the front chi never makes straights or flushes
  assert.equal(ev('2H 3H 4H').cat, CAT.HIGH);
  assert.equal(ev('9S 9D 9C').cat, CAT.TRIPS);
  assert.equal(ev('9S 9D 2C').cat, CAT.PAIR);
});

test('A-2-3-4-5 is the second-highest straight by default, the lowest when the option is off', () => {
  const wheel = ev('AS 2D 3C 4H 5S');
  assert.ok(compare(ev('TS JD QC KH AS'), wheel) > 0, 'broadway is highest');
  assert.ok(compare(wheel, ev('9S TD JC QH KS')) > 0, 'wheel beats K-high');
  const low = evaluate(C('AS 2D 3C 4H 5S'), { ...D, a2345High: false });
  assert.ok(compare(low, evaluate(C('2S 3D 4C 5H 6S'))) < 0);
});

test('kickers decide; suits never do; a 3-card pair compares against a 5-card pair by rank then kickers', () => {
  assert.ok(compare(ev('AS AD 9C 6H 3S'), ev('AH AC 9D 6S 2S')) > 0);
  assert.equal(compare(ev('AS AD 9C 6H 3S'), ev('AH AC 9D 6S 3D')), 0);
  assert.ok(compare(ev('9S 9D 5C 3H 2S'), ev('9H 9C 4D')) > 0);
  assert.ok(compare(ev('9S 9D 4C 3H 2S'), ev('9H 9C 5D')) < 0, 'middle pair 9 with 4 kicker loses to front pair 9 with 5');
});

test('judge: valid layouts and lủng', () => {
  assert.equal(judge(C('7S 7C 7D 7H 2S QS QD QH 4C 4D 9S 9D 3C')).valid, true);
  assert.equal(judge(C('KS TD 8C 5H 2D AS AD 9C 6H 3S 9H JC 4D')).valid, false, 'pair in the middle over high card in the back');
  assert.equal(judge(C('AS AD 9C 6H 3S KS KD 8C 5H 2D QS QD QC')).valid, false, 'trips in the front over a pair');
});

test('chi bonuses only for the listed hands in their place', () => {
  assert.equal(chiPoints(0, ev('9H TH JH QH KH')), D.sfBack);
  assert.equal(chiPoints(0, ev('7S 7C 7D 7H 2S')), D.quadBack);
  assert.equal(chiPoints(1, ev('9H TH JH QH KH')), D.sfMid);
  assert.equal(chiPoints(1, ev('7S 7C 7D 7H 2S')), D.quadMid);
  assert.equal(chiPoints(1, ev('QS QD QH 4C 4D')), D.fullMid);
  assert.equal(chiPoints(0, ev('QS QD QH 4C 4D')), 1);
  assert.equal(chiPoints(2, ev('9S 9D 9C')), D.tripsFront);
  assert.equal(chiPoints(2, ev('9S 9D 2C')), 1);
});

test('special hands are recognised (and can be turned off)', () => {
  assert.equal(specialOf(C('2S 3D 4C 5H 6S 7D 8C 9H TS JD QC KH AS')), 'sanhRong');
  assert.equal(specialOf(C('2D 3D 4H 5H 6D 7H 8D 9H TD JH QD KH 2H')), 'dongHoa');
  assert.equal(specialOf(C('2S 2D 4D 4H 6H 6C 8C 8S TS TD QD QH AH')), 'lucPhe');
  assert.equal(specialOf(C('2S 5S 9S JS KS 3D 5D 8D TD QD 6C 9C AC')), 'baThung');
  assert.equal(specialOf(C('2S 3D 4C 5H 6S 8D 9C TH JS QD AH 2D 3C')), 'baSanh', 'A-2-3 front + 2..6 + 8..Q');
  assert.equal(specialOf(C('2S 3D 4C 5H 6S 7D 8C 9H TS JD QC KH AS'), { ...D, sanhRong: 0 }), 'baSanh', 'with sảnh rồng off, the next one counts');
  assert.equal(specialOf(C('2S 2D 4C 5H 9S 8D 9C TH JS QD AH KD 3C')), null);
});

const info = (cards) => ({ ...judge(C(cards)), special: specialOf(C(cards)) });

test('versus: chi by chi, sập ×2, lủng counts as sập, special wins outright', () => {
  const strong = info('7S 7C 7D 7H 2S QS QD QH 4C 4D 9S 9D 3C'); // quads / full / pair
  const weak = info('AS KD 9C 6H 3S JS TD 8C 5H 2D 8S 6D 4H'); // high / high / high
  const r = versus(strong, weak);
  assert.equal(r.kind, 'sap');
  assert.equal(r.chi, (D.quadBack + D.fullMid + 1) * D.sapMult);
  assert.equal(versus(weak, strong).chi, -r.chi, 'symmetric');
  const lung = info('KS TD 8C 5H 2D AS AD 9C 6H 3S 9H JC 4D');
  assert.equal(versus(weak, lung).kind, 'lung');
  assert.equal(versus(weak, lung).chi, 3 * D.sapMult);
  assert.equal(versus(lung, lung).chi, 0);
  const rong = info('2S 3D 4C 5H 6S 7D 8C 9H TS JD QC KH AS');
  assert.equal(versus(rong, strong).chi, D.sanhRong);
  assert.equal(versus(strong, rong).chi, -D.sanhRong);
});

test('settle: the chi matrix is zero-sum; sập làng doubles a full sweep of 3+ players', () => {
  const hands = {
    0: C('7S 7C 7D 7H 2S QS QD QH 4C 4D 9S 9D 3C'),
    1: C('AS KD 9C 6H 3S JS TD 8C 5H 2D 8S 6D 4H'),
    2: C('AD KC 9D 6C 3H JH TC 8D 5D 2C 8H 6S 4S'),
  };
  const { rows, pair } = settle(hands);
  assert.equal(rows[0].total + rows[1].total + rows[2].total, 0);
  assert.ok(pair[0][1].lang && pair[0][2].lang);
  assert.equal(pair[0][1].chi, (D.quadBack + D.fullMid + 1) * D.sapMult * 2);
  const off = settle(hands, { ...D, sapLang: false });
  assert.equal(off.pair[0][1].chi, (D.quadBack + D.fullMid + 1) * D.sapMult);
});

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dealHand = (r) => {
  const d = [...DECK];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d.slice(0, 13);
};

test('the arranger always returns a valid layout of the same 13 cards, quickly', () => {
  const r = rng(7);
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) {
    const hand = dealHand(r);
    for (const arr of [bestArrangement(hand), greedyArrange(hand)]) {
      assert.deepEqual([...arr].sort(), [...hand].sort());
      assert.ok(judge(arr).valid, arr.join(' '));
    }
  }
  assert.ok(Date.now() - t0 < 8000, 'fast enough for a bot turn');
});

// ---------- engine through the table core ----------
const H = { pid: 'host', isHost: true, nick: 'Host' };
const A = { pid: 'aaaa', isHost: false, nick: 'An' };
const B = { pid: 'bbbb', isHost: false, nick: 'Bình' };
const ALL = [H, A, B];

async function table(actors = ALL) {
  const t = createTable({ code: 'MAU-1234', game: 'maubinh', options: {}, hostKey: 'k', now: 0 });
  for (const a of actors) await handle(t, a, { t: 'sit' }, 0);
  await handle(t, H, { t: 'start' }, 0);
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
const view = (t, a) => snapshot(t, { pid: a.pid, isHost: a.isHost, connected: new Set() }, 1).hand;
const total = (t) => t.seats.reduce((s, x) => s + (x ? x.chips : 0), 0);

test('engine: deal, validation, hidden cards, unready, reveal when all ready, chips conserved', async () => {
  const t = await table();
  const before = total(t);
  const h = t.hand;
  assert.equal(h.phase, 'arrange');
  const seat = (a) => seatOf(t, a.pid);
  for (const a of ALL) assert.equal(h.hands[seat(a)].length, 13);
  assert.equal(new Set(ALL.flatMap((a) => h.hands[seat(a)])).size, 39);
  // nobody sees anybody else's cards, spectators see nothing
  const v = view(t, A);
  assert.equal(v.seats[seat(A)].cards.length, 13);
  for (const o of [H, B]) assert.equal(v.seats[seat(o)].cards, null);
  const spec = snapshot(t, { pid: 'zzzz', isHost: false, connected: new Set() }, 1).hand;
  for (const a of ALL) assert.equal(spec.seats[seat(a)].cards, null);
  const mine = h.hands[seat(A)];
  const theirs = h.hands[seat(B)];
  assert.equal(await err(t, A, { t: 'arrange', cards: mine.slice(0, 12) }), 'bad_cards');
  assert.equal(await err(t, A, { t: 'arrange', cards: [...mine.slice(0, 12), theirs[0]] }), 'not_your_cards');
  assert.equal(await err(t, A, { t: 'arrange', cards: [...mine.slice(0, 12), mine[0]] }), 'bad_cards');
  assert.equal(await err(t, A, { t: 'arrange', cards: 'x' }), 'bad_cards');
  assert.equal(await err(t, A, { t: 'arrange', cards: bestArrangement(mine) }), 'ok');
  assert.equal(view(t, A).seats[seat(A)].arr.length, 13, 'own arrangement visible to me');
  assert.equal(view(t, B).seats[seat(A)].arr, null, 'not to others');
  assert.equal(view(t, B).seats[seat(A)].ready, true, 'readiness is public');
  assert.equal(await err(t, A, { t: 'unready' }), 'ok');
  assert.equal(view(t, B).seats[seat(A)].ready, false);
  for (const a of ALL) await handle(t, a, { t: 'arrange', cards: bestArrangement(h.hands[seat(a)]) }, 2);
  assert.equal(t.hand.phase, 'done');
  assert.equal(total(t), before, 'zero-sum');
  const done = view(t, B);
  for (const a of ALL) assert.equal(done.seats[seat(a)].arr.length, 13, 'revealed');
  assert.equal(await err(t, A, { t: 'arrange', cards: mine }), 'no_hand');
});

test('engine: time-out reveals, using the best layout for anyone who never sent one; bots arrange themselves', async () => {
  const t = createTable({ code: 'MAU-1235', game: 'maubinh', options: {}, hostKey: 'k', now: 0 });
  await handle(t, H, { t: 'sit' }, 0);
  await handle(t, H, { t: 'addBot' }, 0);
  await handle(t, H, { t: 'addBot' }, 0);
  await handle(t, H, { t: 'start' }, 0);
  for (let now = 1000; now < 10_000; now += 1000) await tick(t, now);
  const h = t.hand;
  const bots = h.players.filter((p) => t.seats[p].bot);
  assert.ok(bots.every((p) => h.ready[p]), 'bots are ready');
  assert.equal(h.phase, 'arrange', 'still waiting for the human');
  await tick(t, h.deadline + 1);
  assert.equal(t.hand.phase, 'done');
  const me = seatOf(t, H.pid);
  assert.ok(judge(t.hand.arr[me]).valid, 'auto layout is valid');
});
