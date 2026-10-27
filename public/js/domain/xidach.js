// Xì dách (Vietnamese blackjack) — pure rules shared by server and client.
import { rankOf } from './cards.js';

export const XIDACH_DEFAULTS = Object.freeze({
  dealerMode: 'rotate', // 'rotate' | 'host'
  minBet: 10,
  maxBet: 200,
  playerMin: 16, // "đủ tuổi"
  dealerMin: 15,
  aceRule: 'flex', // 'flex': A = 1/10/11 always; 'classic': 2 cards 10/11, 3 cards 1/10, 4+ cards 1
  bothBustPush: true, // player quắc + dealer quắc = hòa
  payouts: Object.freeze({ normal: 1, xidach: 2, xibang: 3, ngulinh: 2 }),
});

export const KIND_RANK = Object.freeze({ xibang: 5, xidach: 4, ngulinh: 3, normal: 2, non: 0, quac: 0 });

const TEN = new Set(['T', 'J', 'Q', 'K']);

function aceChoices(n, aceRule) {
  if (aceRule === 'classic') {
    if (n <= 2) return [10, 11];
    if (n === 3) return [1, 10];
    return [1];
  }
  return [1, 10, 11];
}

/** Best total ≤ 21 if one exists, otherwise the smallest (bust) total. */
export function handTotal(cards, aceRule = 'flex') {
  let base = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === 'A') aces++;
    else if (TEN.has(r)) base += 10;
    else base += Number(r);
  }
  if (!aces) return base;
  const choices = aceChoices(cards.length, aceRule);
  let best = -1;
  let min = Infinity;
  const walk = (i, sum) => {
    if (i === aces) {
      if (sum <= 21 && sum > best) best = sum;
      if (sum < min) min = sum;
      return;
    }
    for (const v of choices) walk(i + 1, sum + v);
  };
  walk(0, base);
  return best >= 0 ? best : min;
}

export function isXiBang(cards) {
  return cards.length === 2 && rankOf(cards[0]) === 'A' && rankOf(cards[1]) === 'A';
}

export function isXiDach(cards) {
  if (cards.length !== 2) return false;
  const [a, b] = cards.map(rankOf);
  return (a === 'A' && TEN.has(b)) || (b === 'A' && TEN.has(a));
}

/** Instant hand dealt in the first two cards. */
export function instantKind(cards) {
  if (isXiBang(cards)) return 'xibang';
  if (isXiDach(cards)) return 'xidach';
  return null;
}

/**
 * Classifies a finished hand.
 * @param {string[]} cards
 * @param {{aceRule?:string, minAge?:number}} o minAge = 16 for players, dealerMin for dealer
 */
export function classify(cards, { aceRule = 'flex', minAge = 16 } = {}) {
  const inst = instantKind(cards);
  const total = handTotal(cards, aceRule);
  if (inst) return { kind: inst, total };
  if (total > 21) return { kind: 'quac', total };
  if (cards.length >= 5) return { kind: 'ngulinh', total };
  if (total < minAge) return { kind: 'non', total };
  return { kind: 'normal', total };
}

/**
 * Compares a player hand with the dealer hand.
 * @returns {{outcome: 1|0|-1, mult: number}} outcome from the player's point of view; mult is the
 * payout multiple of the bet (by the winning hand's kind).
 */
export function compareHands(p, d, opts = XIDACH_DEFAULTS) {
  const pay = opts.payouts || XIDACH_DEFAULTS.payouts;
  const multOf = (h) => pay[h.kind] ?? pay.normal ?? 1;
  const win = (h) => ({ outcome: 1, mult: multOf(h) });
  const lose = (h) => ({ outcome: -1, mult: KIND_RANK[h.kind] >= 2 ? multOf(h) : pay.normal ?? 1 });
  const push = { outcome: 0, mult: 0 };

  if (p.kind === 'quac' && d.kind === 'quac') return opts.bothBustPush === false ? lose(d) : push;
  if (p.kind === 'quac' || p.kind === 'non') return lose(d);
  if (d.kind === 'quac' || d.kind === 'non') return win(p);

  const pr = KIND_RANK[p.kind];
  const dr = KIND_RANK[d.kind];
  if (pr > dr) return win(p);
  if (pr < dr) return lose(d);
  if (p.kind === 'normal') {
    if (p.total > d.total) return win(p);
    if (p.total < d.total) return lose(d);
    return push;
  }
  if (p.kind === 'ngulinh') {
    // Two ngũ linh: the lower total wins.
    if (p.total < d.total) return win(p);
    if (p.total > d.total) return lose(d);
  }
  return push;
}

/** Chip change for the player given a bet (dealer receives the negation). */
export function settleDelta(bet, result) {
  return result.outcome * result.mult * bet;
}

export function canHit(cards, aceRule = 'flex') {
  return cards.length < 5 && !instantKind(cards) && handTotal(cards, aceRule) < 21;
}

export function canStand(cards, minAge, aceRule = 'flex') {
  const t = handTotal(cards, aceRule);
  return t >= minAge || t > 21 || cards.length >= 5;
}
