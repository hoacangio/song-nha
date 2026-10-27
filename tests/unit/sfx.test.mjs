// Sound cues are derived from consecutive snapshots — no Web Audio needed to test them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuesFor } from '../../public/js/ui/sfx.js';

const names = (cues) => cues.map(([n]) => n);
const seat = (o = {}) => ({ cards: null, count: 0, bet: null, settled: null, ...o });
const state = (hand, handNo = 1, mySeat = 1) => ({ handNo, you: { seat: mySeat }, hand });

test('Xì dách: shuffle + deal on a new hand, chip on a bet, turn chime, win on settlement', () => {
  const bet = state({ game: 'xidach', phase: 'bet', dealer: 0, seats: [seat(), seat(), seat()], actions: { bet: {} } });
  assert.deepEqual(names(cuesFor(state({ game: 'xidach', phase: 'done', dealer: 0, seats: [] }, 0), bet)).slice(0, 1), ['shuffle']);
  const afterBet = state({ game: 'xidach', phase: 'bet', dealer: 0, seats: [seat(), seat(), seat({ bet: 10 })], actions: { bet: {} } });
  assert.ok(names(cuesFor(bet, afterBet)).includes('chip'));
  const dealt = state({
    game: 'xidach', phase: 'play', dealer: 0, turn: 1, actions: { hit: true, stay: true },
    seats: [seat({ count: 2 }), seat({ count: 2, cards: ['AS', '7H'], bet: 10 }), seat({ count: 2, bet: 10 })],
  });
  const c = names(cuesFor(afterBet, dealt));
  assert.equal(c.filter((n) => n === 'deal').length, 6);
  const won = state({
    game: 'xidach', phase: 'done', dealer: 0, actions: null,
    seats: [seat({ count: 2, cards: ['9S', '8H'] }), seat({ count: 2, cards: ['AS', '9H'], settled: { delta: 10 } }), seat({ count: 2 })],
  });
  const w = names(cuesFor(dealt, won));
  assert.ok(w.includes('win'));
  assert.ok(w.includes('flip'), 'dealer cards revealed');
});

test('Tiến lên: play, chop and pass cues; lose at the end', () => {
  const base = { game: 'tienlen', phase: 'play', turn: 2, actions: null };
  const s0 = state({ ...base, trick: null, seats: [seat({ count: 13 }), seat({ count: 13 }), seat({ count: 13 })] });
  const s1 = state({ ...base, trick: { seat: 0, cards: ['2H'], chop: false }, seats: s0.hand.seats });
  assert.deepEqual(names(cuesFor(s0, s1)), ['play']);
  const s2 = state({ ...base, trick: { seat: 2, cards: ['JS', 'JC', 'JD', 'JH'], chop: true }, seats: s0.hand.seats });
  assert.deepEqual(names(cuesFor(s1, s2)), ['chop']);
  const s3 = state({ ...base, trick: s2.hand.trick, seats: [seat({ count: 13, passed: true }), seat({ count: 13 }), seat({ count: 9 })] });
  assert.deepEqual(names(cuesFor(s2, s3)), ['pass']);
  const mine = state({ ...base, turn: 1, actions: { play: true }, trick: s2.hand.trick, seats: s3.hand.seats });
  assert.ok(names(cuesFor(s3, mine)).includes('turn'));
  const lost = state({ ...base, phase: 'done', actions: null, trick: null, seats: [seat(), seat({ result: { delta: -30 } }), seat({ result: { delta: 30 } })] });
  assert.ok(names(cuesFor(mine, lost)).includes('lose'));
});
