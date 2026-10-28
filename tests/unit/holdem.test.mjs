import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestHand, score5, buildPots, splitPot, orderFromButton } from '../../public/js/domain/holdem.js';

const H = (s) => s.split(' ');
const best = (s) => bestHand(H(s));
const cmp = (a, b) => Math.sign(best(a).score - best(b).score);

test('categories of 7-card hands', () => {
  const cases = [
    ['AS KS QS JS TS 2D 3C', 'straightFlush'],
    ['5H 4H 3H 2H AH KD KC', 'straightFlush'], // steel wheel
    ['9C 9D 9H 9S 2C 3D 4H', 'quads'],
    ['KC KD KH 2S 2C 7D 8H', 'fullHouse'],
    ['KC KD KH 2S 2C 2D 8H', 'fullHouse'], // two trips → full house
    ['AH 9H 7H 4H 2H KS KD', 'flush'],
    ['9C TD JH QS KC 2D 2H', 'straight'],
    ['AC 2D 3H 4S 5C 9D KH', 'straight'], // wheel
    ['7C 7D 7H AS KC 2D 4H', 'trips'],
    ['7C 7D 4H 4S KC 2D 9H', 'twoPair'],
    ['7C 7D 4H 3S KC 2D 9H', 'pair'],
    ['AC JD 9H 7S 5C 3D 2H', 'high'],
  ];
  for (const [hand, cat] of cases) assert.equal(best(hand).category, cat, hand);
});

test('rankings and kickers', () => {
  assert.equal(cmp('AS KS QS JS TS 2D 3C', '9C 9D 9H 9S AC 3D 4H'), 1, 'royal > quads');
  assert.equal(cmp('6C 2D 3H 4S 5C 9D KH', 'AC 2D 3H 4S 5C 9D KH'), 1, '6-high straight > wheel');
  assert.equal(cmp('KC KD KH 2S 2C 7D 8H', 'QC QD QH AS AC 7D 8H'), 1, 'trips decide full houses');
  assert.equal(cmp('AH 9H 7H 4H 3H KS KD', 'AH 9H 7H 4H 2H KS KD'), 1, 'flush kickers');
  assert.equal(cmp('7C 7D 4H 4S KC 2D 9H', '7C 7D 4H 4S QC 2D 9H'), 1, 'two pair kicker');
  assert.equal(cmp('AC AD KH 3S 4C 7D 9H', 'AC AD QH JS TC 7D 9H'), 1, 'pair kicker');
  assert.equal(cmp('AC AD 4H 4S 3C 3D 9H', 'AC AD 4H 4S 2C 2D 9H'), 0, 'third pair does not play (A A 4 4 9)');
  assert.equal(cmp('2C 2D AH KS QC JD 9H', '2H 2S AC KD QH JC 9S'), 0, 'exact tie');
  assert.equal(cmp('9C 9D 9H 9S AC 3D 4H', '9C 9D 9H 9S KC QD JH'), 1, 'quads kicker');
  assert.ok(score5(H('AS KS QS JS TS')) > score5(H('KS QS JS TS 9S')));
});

test('best five cards are reported', () => {
  const b = best('AS KS QS JS TS 2D 3C');
  assert.deepEqual([...b.cards].sort(), ['AS', 'JS', 'KS', 'QS', 'TS']);
});

test('pots: single pot, side pots, folded contributions', () => {
  assert.deepEqual(buildPots([100, 100, 100], [false, false, false]), [{ amount: 300, eligible: [0, 1, 2] }]);
  // A all-in 50, B and C 200
  assert.deepEqual(buildPots([50, 200, 200], [false, false, false]), [
    { amount: 150, eligible: [0, 1, 2] },
    { amount: 300, eligible: [1, 2] },
  ]);
  // three all-ins of different sizes + a folded player who put 30 in
  assert.deepEqual(buildPots([30, 50, 120, 300], [true, false, false, false]), [
    { amount: 30 + 50 * 3, eligible: [1, 2, 3] },
    { amount: 70 * 2, eligible: [2, 3] },
    { amount: 180, eligible: [3] }, // uncalled excess returns to its owner
  ]);
  // folded player put in more than the live players: excess goes to the top live pot
  assert.deepEqual(buildPots([0, 40, 100, 40], [false, false, true, false]), [{ amount: 180, eligible: [1, 3] }]);
  const total = (p) => p.reduce((s, x) => s + x.amount, 0);
  assert.equal(total(buildPots([30, 50, 120, 300], [true, false, false, false])), 500);
});

test('split pot with odd chips to the first seats left of the button', () => {
  assert.deepEqual(splitPot(100, [3, 1]), [{ seat: 3, amount: 50 }, { seat: 1, amount: 50 }]);
  assert.deepEqual(splitPot(101, [3, 1]), [{ seat: 3, amount: 51 }, { seat: 1, amount: 50 }]);
  assert.deepEqual(splitPot(11, [0, 2, 4]), [{ seat: 0, amount: 4 }, { seat: 2, amount: 4 }, { seat: 4, amount: 3 }]);
  assert.deepEqual(orderFromButton([0, 2, 4, 5], 2, 6), [4, 5, 0, 2]);
});

test('all 2,598,960 five-card hands fall into the known category counts', async () => {
  const { DECK } = await import('../../public/js/domain/cards.js');
  const { categoryOf, CATEGORIES } = await import('../../public/js/domain/holdem.js');
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const d = DECK;
  const distinct = new Set();
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++)
        for (let e = c + 1; e < 52; e++)
          for (let f = e + 1; f < 52; f++) {
            const sc = score5([d[a], d[b], d[c], d[e], d[f]]);
            counts[categoryOf(sc)]++;
            distinct.add(sc);
          }
  assert.equal(distinct.size, 7462, 'distinct hand ranks');
  assert.deepEqual(counts, {
    high: 1302540,
    pair: 1098240,
    twoPair: 123552,
    trips: 54912,
    straight: 10200,
    flush: 5108,
    fullHouse: 3744,
    quads: 624,
    straightFlush: 40,
  });
});
