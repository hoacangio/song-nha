import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCombo as C,
  canBeat,
  isChop,
  chopValue,
  instantWin,
  losePoints,
  legalPlays,
  suggestPlay,
  cardValue,
  sortCards,
  TIENLEN_DEFAULTS as D,
} from '../../public/js/domain/tienlen.js';

const beats = (a, b, r = D) => canBeat(C(a), C(b), r);

test('card order: 3♠ lowest, 2♥ highest; suits ♠ < ♣ < ♦ < ♥', () => {
  assert.equal(cardValue('3S'), 0);
  assert.equal(cardValue('2H'), 51);
  assert.ok(cardValue('3H') > cardValue('3D') && cardValue('3D') > cardValue('3C') && cardValue('3C') > cardValue('3S'));
  assert.ok(cardValue('AS') < cardValue('2S'));
  assert.deepEqual(sortCards(['2S', '3H', 'AS', '3S']), ['3S', '3H', 'AS', '2S']);
});

test('combo detection', () => {
  assert.equal(C(['7H']).type, 'single');
  assert.equal(C(['7H', '7S']).type, 'pair');
  assert.equal(C(['7H', '7S', '7D']).type, 'triple');
  assert.equal(C(['7H', '7S', '7D', '7C']).type, 'quad');
  assert.deepEqual(C(['5S', '3H', '4D']), { type: 'straight', len: 3, top: cardValue('5S'), rank: 2 });
  assert.equal(C(['QS', 'KH', 'AD']).type, 'straight');
  assert.equal(C(['KS', 'AH', '2D']), null, 'no 2 in a straight');
  assert.equal(C(['3S', '4S', '6S']), null, 'gap');
  assert.equal(C(['3S', '3H', '4S', '4H', '5S', '5H']).type, 'pairseq');
  assert.equal(C(['3S', '3H', '4S', '4H', '5S', '5H', '6C', '6D']).len, 4);
  assert.equal(C(['KS', 'KH', 'AS', 'AH', '2S', '2H']), null, 'no 2 in đôi thông');
  assert.equal(C(['3S', '3H', '4S', '4H']), null, 'two pairs are not a combo');
  assert.equal(C(['3S', '4S']), null);
  assert.equal(C([]), null);
});

test('beating: same type and length, higher top card', () => {
  assert.ok(beats(['7S'], ['7H']));
  assert.ok(!beats(['7H'], ['7S']));
  assert.ok(beats(['AS'], ['2S']));
  assert.ok(beats(['9S', '9C'], ['9D', '9H']), 'pair with ♥ beats pair with ♣');
  assert.ok(!beats(['9D', '9H'], ['9S', '9C']));
  assert.ok(beats(['3S', '4S', '5S'], ['3H', '4H', '5H']));
  assert.ok(beats(['3S', '4S', '5S'], ['4C', '5C', '6C']));
  assert.ok(!beats(['3S', '4S', '5S'], ['4C', '5C', '6C', '7C']), 'different length');
  assert.ok(!beats(['7S'], ['8S', '8C']), 'different type');
  assert.ok(beats(null, ['8S', '8C']), 'leading: anything');
});

const threePairs = ['3S', '3H', '4S', '4H', '5S', '5H'];
const fourPairs = ['6S', '6H', '7S', '7H', '8S', '8H', '9S', '9H'];
const quad = ['JS', 'JC', 'JD', 'JH'];

test('chặt heo with default rules', () => {
  assert.ok(beats(['2H'], threePairs), '3 đôi thông chặt 1 heo');
  assert.ok(!beats(['2H', '2S'], threePairs), '3 đôi thông does not beat đôi heo');
  assert.ok(beats(['2H'], quad), 'tứ quý chặt heo');
  assert.ok(beats(['2H', '2S'], quad), 'tứ quý chặt đôi heo');
  assert.ok(beats(threePairs, quad), 'tứ quý chặt 3 đôi thông');
  assert.ok(beats(['2D', '2H'], fourPairs), '4 đôi thông chặt đôi heo');
  assert.ok(beats(quad, fourPairs), '4 đôi thông chặt tứ quý');
  assert.ok(beats(threePairs, fourPairs), '4 đôi thông chặt 3 đôi thông');
  assert.ok(beats(['2H'], fourPairs));
  assert.ok(!beats(['AH'], quad), 'tứ quý only chops 2s / đôi thông');
  assert.ok(!beats(fourPairs, quad), 'tứ quý does not beat 4 đôi thông');
  assert.ok(beats(['3S', '3C', '3D', '3H'], quad), 'bigger tứ quý (chặt chồng)');
  assert.ok(beats(threePairs, ['4C', '4D', '5C', '5D', '6C', '6D']), 'bigger 3 đôi thông');
  assert.ok(isChop(C(['2H']), C(quad)));
  assert.ok(!isChop(C(['7H']), C(['8H'])));
});

test('each chặt rule can be switched off', () => {
  const off = (k) => ({ ...D, [k]: false });
  assert.ok(!beats(['2H'], threePairs, off('chop3PairsSingle2')));
  assert.ok(!beats(['2H'], quad, off('chopQuadSingle2')));
  assert.ok(!beats(['2H', '2S'], quad, off('chopQuadPair2')));
  assert.ok(!beats(threePairs, quad, off('chopQuad3Pairs')));
  assert.ok(!beats(quad, fourPairs, off('chop4Pairs')));
  assert.ok(!beats(['2H', '2D'], fourPairs, off('chop4Pairs')));
});

test('chop values: heo by colour, quad and đôi thông penalties', () => {
  assert.equal(chopValue(['2S'], C(['2S'])), D.thoi2Black);
  assert.equal(chopValue(['2H'], C(['2H'])), D.thoi2Red);
  assert.equal(chopValue(['2C', '2D'], C(['2C', '2D'])), D.thoi2Black + D.thoi2Red);
  assert.equal(chopValue(quad, C(quad)), D.thoiQuad);
  assert.equal(chopValue(threePairs, C(threePairs)), D.thoi3Pairs);
});

test('tới trắng', () => {
  const dragon = ['3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS', 'AS', '2S'];
  assert.equal(instantWin(dragon), 'dragon');
  const four2 = ['2S', '2C', '2D', '2H', '3S', '5C', '7D', '9H', 'JS', 'KC', 'AD', '4H', '6S'];
  assert.equal(instantWin(four2), 'four2');
  const sixPairs = ['3S', '3H', '5S', '5H', '7S', '7H', '9S', '9H', 'JS', 'JH', 'KS', 'KH', 'AS'];
  assert.equal(instantWin(sixPairs), 'sixPairs');
  const fivePS = ['3S', '3H', '4S', '4H', '5S', '5H', '6S', '6H', '7S', '7H', '9C', 'JD', '2S'];
  assert.equal(instantWin(fivePS), 'fivePairSeq');
  const normal = ['3S', '3H', '5S', '6H', '7S', '8H', '9S', '9H', 'JS', 'QH', 'KS', 'AH', '2C'];
  assert.equal(instantWin(normal), null);
  assert.equal(instantWin(sixPairs, { ...D, instantSixPairs: false }), null);
  assert.equal(instantWin(dragon, { ...D, instantDragon: false }), null);
});

test('scoring: per card, cóng, thối heo / tứ quý / 3 đôi thông', () => {
  assert.deepEqual(losePoints(['3S', '5H'], { played: true }).points, 2);
  const cong = losePoints(Array(13).fill('3S'), { played: false });
  assert.equal(cong.cong, true);
  assert.ok(cong.points >= D.cong);
  const thoi = losePoints(['2S', '2H', '7C'], { played: true });
  assert.equal(thoi.points, 3 + D.thoi2Black + D.thoi2Red);
  assert.equal(losePoints(quad, { played: true }).points, 4 + D.thoiQuad);
  assert.equal(losePoints(threePairs, { played: true }).points, 6 + D.thoi3Pairs);
  assert.equal(losePoints(['2S'], { played: true }, { ...D, thoi: false }).points, 1);
});

test('move search finds legal, cheap plays', () => {
  const hand = ['3S', '4C', '5D', '7S', '7H', '9C', 'JD', 'QS', 'KH', '2S'];
  assert.deepEqual(suggestPlay(hand, C(['6H'])), ['7S']);
  assert.deepEqual(suggestPlay(hand, C(['6H', '6S'])), ['7S', '7H']);
  assert.equal(suggestPlay(hand, C(['2H'])), null, 'nothing beats 2♥ here');
  const lead = suggestPlay(hand, null);
  assert.ok(lead.includes('3S'), 'lead includes the lowest card');
  assert.ok(C(lead));
  const first = suggestPlay(hand, null, D, '3S');
  assert.ok(first.includes('3S'));
  for (const p of legalPlays(hand, C(['8D']))) assert.ok(canBeat(C(['8D']), p.combo));
  // will chop when that is the only way
  assert.deepEqual(sortCards(suggestPlay(['5S', ...quad], C(['2H']))), sortCards(quad));
});
