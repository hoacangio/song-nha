// Texas Hold'em — pure rules shared by server and client: hand evaluation, pots, splitting.

export const HOLDEM_DEFAULTS = Object.freeze({
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
});

const RANK_VALUE = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
export const CATEGORIES = ['high', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'];

const B = 15; // base for packing tiebreak ranks (values 2..14)

/** Score of exactly five cards: higher is better; equal scores tie. */
export function score5(cards) {
  const vals = cards.map((c) => RANK_VALUE[c[0]]).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const uniq = [...new Set(vals)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals[0] === 14 && vals[1] === 5 && vals[4] === 2) straightHigh = 5; // wheel A-2-3-4-5
  }
  const counts = new Map();
  for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
  // Ranks ordered by (count desc, rank desc) give the kicker order for every made hand.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join('');
  let cat;
  let ranks = groups.map((g) => g[0]);
  if (straightHigh && flush) cat = 8;
  else if (shape === '41') cat = 7;
  else if (shape === '32') cat = 6;
  else if (flush) cat = 5;
  else if (straightHigh) cat = 4;
  else if (shape === '311') cat = 3;
  else if (shape === '221') cat = 2;
  else if (shape === '2111') cat = 1;
  else cat = 0;
  if (cat === 8 || cat === 4) ranks = [straightHigh];
  let packed = 0;
  for (let i = 0; i < 5; i++) packed = packed * B + (ranks[i] || 0);
  return cat * B ** 5 + packed;
}

export const categoryOf = (score) => CATEGORIES[Math.floor(score / B ** 5)];

/** Best five of 5–7 cards: { score, category, cards }. */
export function bestHand(cards) {
  const n = cards.length;
  let best = null;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            const s = score5(five);
            if (!best || s > best.score) best = { score: s, cards: five };
          }
  if (!best) return null;
  best.category = categoryOf(best.score);
  return best;
}

/**
 * Splits contributions into main and side pots.
 * @param {number[]} contrib chips each seat put in (index = seat; 0 / undefined = none)
 * @param {boolean[]} folded folded seats contribute but cannot win
 * @returns {{ amount:number, eligible:number[] }[]} main pot first
 */
export function buildPots(contrib, folded) {
  const seats = contrib.map((c, i) => [i, c || 0]).filter(([, c]) => c > 0);
  const levels = [...new Set(seats.filter(([i]) => !folded[i]).map(([, c]) => c))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const [, c] of seats) amount += Math.max(0, Math.min(c, level) - prev);
    const eligible = seats.filter(([i, c]) => !folded[i] && c >= level).map(([i]) => i);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  // Chips above the highest live level (bets folded to) go to the top pot.
  let rest = 0;
  for (const [, c] of seats) rest += Math.max(0, c - prev);
  if (rest > 0) {
    if (pots.length) pots[pots.length - 1].amount += rest;
    else pots.push({ amount: rest, eligible: seats.filter(([i]) => !folded[i]).map(([i]) => i) });
  }
  return pots;
}

/**
 * Splits `amount` among `winners` (already ordered from the first seat left of the button):
 * equal shares, odd chips one each to the earliest winners.
 */
export function splitPot(amount, winners) {
  const share = Math.floor(amount / winners.length);
  let odd = amount - share * winners.length;
  return winners.map((seat) => ({ seat, amount: share + (odd-- > 0 ? 1 : 0) }));
}

/** Seats ordered clockwise starting left of `button`. */
export function orderFromButton(seats, button, total) {
  return [...seats].sort((a, b) => ((a - button - 1 + total) % total) - ((b - button - 1 + total) % total));
}

/** Rough pre-flop strength 0..1 for bots (Chen-like, simplified). */
export function preflopStrength(c1, c2) {
  const v1 = RANK_VALUE[c1[0]];
  const v2 = RANK_VALUE[c2[0]];
  const hi = Math.max(v1, v2);
  const lo = Math.min(v1, v2);
  let s = hi / 14 * 0.5 + lo / 14 * 0.2;
  if (v1 === v2) s += 0.35 + v1 / 14 * 0.1;
  if (c1[1] === c2[1]) s += 0.06;
  const gap = hi - lo;
  if (gap === 1) s += 0.05;
  else if (gap >= 4 && v1 !== v2) s -= 0.08;
  return Math.max(0, Math.min(1, s));
}
