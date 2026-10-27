import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, shuffle, commitment, verifyCommitment, randomHex } from '../../public/js/domain/shuffle.js';
import { DECK, isCardList } from '../../public/js/domain/cards.js';

test('shuffle is a permutation of the deck', () => {
  const d = shuffle([...DECK]);
  assert.equal(d.length, 52);
  assert.ok(isCardList(d));
});

test('randomInt rejects bad bounds and stays in range', () => {
  assert.throws(() => randomInt(0));
  assert.throws(() => randomInt(1.5));
  for (let i = 0; i < 2000; i++) {
    const v = randomInt(7);
    assert.ok(v >= 0 && v < 7 && Number.isInteger(v));
  }
});

test('rejection sampling: biased source values are discarded', () => {
  // A fake RNG that first yields a value inside the biased tail, then a normal value.
  const n = 3;
  const limit = 2 ** 32 - (2 ** 32 % n);
  const values = [limit + 0, 5];
  const rng = { getRandomValues: (a) => ((a[0] = values.shift()), a) };
  assert.equal(randomInt(n, rng), 5 % n);
  assert.equal(values.length, 0);
});

test('chi-square smoke test: position of a card is uniform', () => {
  // Track where card 0 lands over many shuffles of a 10-card deck.
  const N = 10;
  const trials = 20000;
  const counts = Array(N).fill(0);
  for (let t = 0; t < trials; t++) {
    const a = shuffle([...Array(N).keys()]);
    counts[a.indexOf(0)]++;
  }
  const expected = trials / N;
  const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
  // df = 9; p = 0.001 critical value ≈ 27.88
  assert.ok(chi2 < 27.88, `chi2=${chi2.toFixed(2)} counts=${counts}`);
});

test('chi-square smoke test: all 6 permutations of 3 items appear evenly', () => {
  const trials = 12000;
  const counts = new Map();
  for (let t = 0; t < trials; t++) {
    const k = shuffle([0, 1, 2]).join('');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  assert.equal(counts.size, 6);
  const expected = trials / 6;
  const chi2 = [...counts.values()].reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
  assert.ok(chi2 < 20.52, `chi2=${chi2}`); // df=5, p=0.001
});

test('commit–reveal verifies only the exact seed and deck', async () => {
  const seed = randomHex(32);
  const deck = shuffle([...DECK]);
  const c = await commitment(seed, deck);
  assert.match(c, /^[0-9a-f]{64}$/);
  assert.equal(await verifyCommitment(c, seed, deck), true);
  const swapped = deck.slice();
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.equal(await verifyCommitment(c, seed, swapped), false);
  assert.equal(await verifyCommitment(c, randomHex(32), deck), false);
});
