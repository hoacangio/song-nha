import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handTotal,
  classify,
  compareHands,
  settleDelta,
  instantKind,
  canHit,
  canStand,
  XIDACH_DEFAULTS as D,
} from '../../public/js/domain/xidach.js';

const P = (cards) => classify(cards, { minAge: 16 });
const DL = (cards) => classify(cards, { minAge: 15 });

test('totals: faces are 10, numbers face value', () => {
  assert.equal(handTotal(['KS', 'QH']), 20);
  assert.equal(handTotal(['9S', '7H']), 16);
  assert.equal(handTotal(['TS', '5H', '6C']), 21);
});

test('flex aces pick best total ≤ 21 from 1/10/11', () => {
  assert.equal(handTotal(['AS', '9H']), 20); // A=11
  assert.equal(handTotal(['AS', '5H', '5C']), 21); // A=11
  assert.equal(handTotal(['AS', '6H', '5C']), 21); // A=10
  assert.equal(handTotal(['AS', '9H', '9C']), 19); // A=1
  assert.equal(handTotal(['AS', 'AH', '9C']), 21); // 11+1+9 → 21
});

test('classic aces: 2 cards 10/11, 3 cards 1/10, 4+ cards 1', () => {
  assert.equal(handTotal(['AS', '9H'], 'classic'), 20);
  assert.equal(handTotal(['AS', '5H', '5C'], 'classic'), 20);
  assert.equal(handTotal(['AS', '5H', '5C', '2D'], 'classic'), 13);
});

test('instant hands', () => {
  assert.equal(instantKind(['AS', 'AH']), 'xibang');
  assert.equal(instantKind(['AS', 'KH']), 'xidach');
  assert.equal(instantKind(['TS', 'AH']), 'xidach');
  assert.equal(instantKind(['AS', '9H']), null);
  assert.equal(instantKind(['AS', 'KH', '2C']), null);
});

test('classification: quắc, non, ngũ linh, normal', () => {
  assert.equal(P(['KS', 'QH', '5C']).kind, 'quac');
  assert.equal(P(['9S', '6H']).kind, 'non');
  assert.equal(P(['2S', '3H', '4C', '2D', '5C']).kind, 'ngulinh');
  assert.equal(P(['KS', '7H']).kind, 'normal');
  assert.equal(DL(['9S', '6H']).kind, 'normal'); // dealer đủ tuổi at 15
});

test('ranking: xì bàng > xì dách > ngũ linh > normal', () => {
  const xb = P(['AS', 'AH']);
  const xd = P(['AS', 'KH']);
  const nl = P(['2S', '3H', '4C', '2D', '5C']);
  const n21 = P(['KS', '5H', '6C']);
  assert.equal(compareHands(xb, xd).outcome, 1);
  assert.equal(compareHands(xd, nl).outcome, 1);
  assert.equal(compareHands(nl, n21).outcome, 1);
  assert.equal(compareHands(n21, xd).outcome, -1);
  assert.equal(compareHands(xd, P(['AC', 'QD'])).outcome, 0);
});

test('normal totals compare; ties push', () => {
  assert.deepEqual(compareHands(P(['KS', '9H']), DL(['KC', '8D'])), { outcome: 1, mult: 1 });
  assert.equal(compareHands(P(['KS', '8H']), DL(['KC', '9D'])).outcome, -1);
  assert.equal(compareHands(P(['KS', '8H']), DL(['QC', '8D'])).outcome, 0);
});

test('busts and under-age', () => {
  const bust = P(['KS', 'QH', '5C']);
  const non = P(['9S', '6H']);
  const dBust = DL(['KS', 'QH', '2C']);
  assert.equal(compareHands(bust, DL(['KC', '7D'])).outcome, -1);
  assert.equal(compareHands(bust, dBust).outcome, 0, 'both quắc → hòa by default');
  assert.equal(compareHands(bust, dBust, { ...D, bothBustPush: false }).outcome, -1);
  assert.equal(compareHands(non, dBust).outcome, -1, 'non always pays');
  assert.equal(compareHands(P(['KS', '7H']), dBust).outcome, 1);
});

test('two ngũ linh: lower total wins', () => {
  const low = P(['2S', '3H', '4C', '2D', '5C']); // 16
  const high = DL(['2C', '3D', '4H', '5S', '6H']); // 20
  assert.equal(compareHands(low, high).outcome, 1);
  assert.equal(compareHands(high, low).outcome, -1);
});

test('payout multipliers by winning hand', () => {
  const bet = 10;
  assert.equal(settleDelta(bet, compareHands(P(['AS', 'AH']), DL(['KC', '7D']))), 30);
  assert.equal(settleDelta(bet, compareHands(P(['AS', 'KH']), DL(['KC', '7D']))), 20);
  assert.equal(settleDelta(bet, compareHands(P(['2S', '3H', '4C', '2D', '5C']), DL(['KC', '7D']))), 20);
  assert.equal(settleDelta(bet, compareHands(P(['KS', '9H']), DL(['AC', 'KD']))), -20);
  assert.equal(settleDelta(bet, compareHands(P(['KS', '9H']), DL(['AC', 'AD']))), -30);
  assert.equal(settleDelta(bet, compareHands(P(['KS', 'QH', '5C']), DL(['KC', '7D']))), -10);
  const custom = { ...D, payouts: { normal: 1, xidach: 3, xibang: 5, ngulinh: 4 } };
  assert.equal(settleDelta(bet, compareHands(P(['AS', 'AH']), DL(['KC', '7D']), custom)), 50);
});

test('hit / stand rules', () => {
  assert.equal(canHit(['KS', '5H']), true);
  assert.equal(canHit(['KS', 'AH']), false, 'xì dách cannot draw');
  assert.equal(canHit(['2S', '3H', '4C', '2D', '5C']), false, '5 cards stop');
  assert.equal(canHit(['KS', 'QH', '5C']), false, 'bust stops');
  assert.equal(canStand(['9S', '6H'], 16), false);
  assert.equal(canStand(['9S', '7H'], 16), true);
});
