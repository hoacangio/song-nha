// Tiến lên miền Nam — pure rules shared by server and client.
// Ranks 3 < 4 < … < K < A < 2; suits ♠ < ♣ < ♦ < ♥.

export const TL_RANKS = '3456789TJQKA2';
export const TL_SUITS = 'SCDH';
const TWO = 12; // rank index of 2 ("heo")

export const rankIdx = (c) => TL_RANKS.indexOf(c[0]);
export const suitIdx = (c) => TL_SUITS.indexOf(c[1]);
/** Total order of single cards: 3♠ = 0 … 2♥ = 51. */
export const cardValue = (c) => rankIdx(c) * 4 + suitIdx(c);
export const sortCards = (cards) => [...cards].sort((a, b) => cardValue(a) - cardValue(b));
export const isTwo = (c) => rankIdx(c) === TWO;
export const isRedTwo = (c) => c === '2D' || c === '2H';

export const TIENLEN_DEFAULTS = Object.freeze({
  unit: 10, // chips per point
  // Chặt heo (each toggle documented in README)
  chop3PairsSingle2: true, // 3 đôi thông chặt 1 heo
  chopQuadSingle2: true, // tứ quý chặt 1 heo
  chopQuadPair2: true, // tứ quý chặt đôi heo
  chopQuad3Pairs: true, // tứ quý chặt 3 đôi thông
  chop4Pairs: true, // 4 đôi thông chặt heo, đôi heo, tứ quý, 3 đôi thông
  chopPay: true, // the chopped player pays immediately (chặt chồng accumulates)
  // Tới trắng (instant wins right after the deal)
  instantDragon: true, // sảnh rồng 3→A
  instantFour2: true, // tứ quý 2
  instantSixPairs: true, // 6 đôi
  instantFivePairSeq: true, // 5 đôi thông
  // Scoring, in points (× unit chips)
  perCard: 1,
  cong: 26, // cóng: never played a card — replaces the card count
  thoi2Black: 5, // each ♠/♣ 2 left in hand
  thoi2Red: 10, // each ♦/♥ 2 left in hand
  thoiQuad: 10, // tứ quý left in hand / chopped
  thoi3Pairs: 5, // 3 đôi thông left in hand / chopped
  toiTrang: 26, // each loser pays this to a tới trắng winner
  thoi: true, // apply "thối" penalties
});

const counts = (cards) => {
  const n = new Array(13).fill(0);
  for (const c of cards) n[rankIdx(c)]++;
  return n;
};

/**
 * Identifies a combo. Returns { type, len, top, rank } or null.
 * type: single | pair | triple | quad | straight | pairseq
 * len: number of ranks for straight / pairseq, otherwise 1; top: value of the highest card.
 */
export function detectCombo(cards) {
  if (!Array.isArray(cards) || !cards.length) return null;
  const s = sortCards(cards);
  const top = cardValue(s[s.length - 1]);
  const topRank = rankIdx(s[s.length - 1]);
  const n = s.length;
  const ranks = s.map(rankIdx);
  const same = ranks.every((r) => r === ranks[0]);
  if (n === 1) return { type: 'single', len: 1, top, rank: topRank };
  if (same && n === 2) return { type: 'pair', len: 1, top, rank: topRank };
  if (same && n === 3) return { type: 'triple', len: 1, top, rank: topRank };
  if (same && n === 4) return { type: 'quad', len: 1, top, rank: topRank };
  if (ranks.includes(TWO)) return null; // no 2 in sequences
  if (n >= 3 && ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1)) {
    return { type: 'straight', len: n, top, rank: topRank };
  }
  if (n >= 6 && n % 2 === 0) {
    for (let i = 0; i < n; i += 2) {
      if (ranks[i] !== ranks[i + 1]) return null;
      if (i > 0 && ranks[i] !== ranks[i - 2] + 1) return null;
    }
    return { type: 'pairseq', len: n / 2, top, rank: topRank };
  }
  return null;
}

const isTwos = (c, type) => c.type === type && c.rank === TWO;

/** Is this play a "chặt" (special beat) of `prev` under the rules? */
export function isChop(prev, next, rules = TIENLEN_DEFAULTS) {
  if (!prev || !next) return false;
  const r = rules;
  const single2 = isTwos(prev, 'single');
  const pair2 = isTwos(prev, 'pair');
  if (next.type === 'pairseq' && next.len === 3) {
    if (single2 && r.chop3PairsSingle2) return true;
  }
  if (next.type === 'quad') {
    if (single2 && r.chopQuadSingle2) return true;
    if (pair2 && r.chopQuadPair2) return true;
    if (prev.type === 'pairseq' && prev.len === 3 && r.chopQuad3Pairs) return true;
  }
  if (next.type === 'pairseq' && next.len === 4 && r.chop4Pairs) {
    if (single2 || pair2 || prev.type === 'quad' || (prev.type === 'pairseq' && prev.len === 3)) return true;
  }
  return false;
}

/** Can `next` be played on top of `prev`? (prev null = leading a new round: any combo.) */
export function canBeat(prev, next, rules = TIENLEN_DEFAULTS) {
  if (!next) return false;
  if (!prev) return true;
  if (prev.type === next.type && prev.len === next.len) return next.top > prev.top;
  return isChop(prev, next, rules);
}

/** Point value of a beaten combo when it is chopped (heo values; quad / đôi thông penalties). */
export function chopValue(cards, combo, rules = TIENLEN_DEFAULTS) {
  if (combo.rank === TWO && (combo.type === 'single' || combo.type === 'pair')) {
    return cards.reduce((s, c) => s + (isRedTwo(c) ? rules.thoi2Red : rules.thoi2Black), 0);
  }
  if (combo.type === 'quad') return rules.thoiQuad;
  if (combo.type === 'pairseq') return combo.len >= 4 ? rules.thoiQuad : rules.thoi3Pairs;
  return 0;
}

/** Longest run of consecutive pairs (no 2) in a hand. */
function longestPairRun(n) {
  let best = 0;
  let run = 0;
  for (let r = 0; r < TWO; r++) {
    run = n[r] >= 2 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Tới trắng check on a freshly dealt 13-card hand. Returns the kind or null. */
export function instantWin(hand, rules = TIENLEN_DEFAULTS) {
  if (hand.length !== 13) return null;
  const n = counts(hand);
  if (rules.instantDragon && n.slice(0, TWO).every((x) => x >= 1)) return 'dragon';
  if (rules.instantFour2 && n[TWO] === 4) return 'four2';
  if (rules.instantFivePairSeq && longestPairRun(n) >= 5) return 'fivePairSeq';
  if (rules.instantSixPairs && n.reduce((s, x) => s + Math.floor(x / 2), 0) >= 6) return 'sixPairs';
  return null;
}

/**
 * Points a loser pays the winner at the end of a game.
 * @returns {{ points:number, cong:boolean, parts: {k:string, v:number}[] }}
 */
export function losePoints(hand, { played }, rules = TIENLEN_DEFAULTS) {
  const parts = [];
  const cong = !played;
  if (cong) parts.push({ k: 'cong', v: rules.cong });
  else if (hand.length) parts.push({ k: 'cards', v: hand.length * rules.perCard });
  if (rules.thoi && hand.length) {
    const blacks = hand.filter((c) => isTwo(c) && !isRedTwo(c)).length;
    const reds = hand.filter(isRedTwo).length;
    if (blacks) parts.push({ k: 'thoi2Black', v: blacks * rules.thoi2Black });
    if (reds) parts.push({ k: 'thoi2Red', v: reds * rules.thoi2Red });
    const n = counts(hand);
    const quads = n.filter((x) => x === 4).length;
    if (quads) parts.push({ k: 'thoiQuad', v: quads * rules.thoiQuad });
    if (longestPairRun(n) >= 3) parts.push({ k: 'thoi3Pairs', v: rules.thoi3Pairs });
  }
  return { points: parts.reduce((s, p) => s + p.v, 0), cong, parts };
}

// ---------- move search (bots, hints, timeouts) ----------

function byRank(hand) {
  const g = Array.from({ length: 13 }, () => []);
  for (const c of sortCards(hand)) g[rankIdx(c)].push(c);
  return g;
}

/** All "natural" combos in a hand of a given shape (lowest suits first, one per top choice). */
function candidates(hand, type, len) {
  const g = byRank(hand);
  const out = [];
  const k = { single: 1, pair: 2, triple: 3, quad: 4 }[type];
  if (k) {
    for (let r = 0; r < 13; r++) {
      const cs = g[r];
      if (cs.length < k) continue;
      // lowest k-1 cards + each possible top card
      for (let top = k - 1; top < cs.length; top++) out.push([...cs.slice(0, k - 1), cs[top]]);
    }
    return out;
  }
  const per = type === 'straight' ? 1 : 2;
  for (let start = 0; start + len <= TWO; start++) {
    let ok = true;
    for (let r = start; r < start + len; r++) if (g[r].length < per) ok = false;
    if (!ok) continue;
    const body = [];
    for (let r = start; r < start + len - 1; r++) body.push(...g[r].slice(0, per));
    const last = g[start + len - 1];
    for (let top = per - 1; top < last.length; top++) out.push([...body, ...last.slice(0, per - 1), last[top]]);
  }
  return out;
}

const SHAPES = [
  ['single', 1],
  ['pair', 1],
  ['triple', 1],
  ['quad', 1],
  ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((l) => ['straight', l]),
  ...[3, 4, 5, 6].map((l) => ['pairseq', l]),
];

/** Every valid play from `hand` that beats `prev` (prev null → every combo), cheapest first. */
export function legalPlays(hand, prev, rules = TIENLEN_DEFAULTS, mustInclude = null) {
  const shapes = prev ? SHAPES.filter(([t, l]) => (t === prev.type && l === prev.len) || ['quad', 'pairseq'].includes(t)) : SHAPES;
  const out = [];
  for (const [t, l] of shapes) {
    for (const cards of candidates(hand, t, l)) {
      if (mustInclude && !cards.includes(mustInclude)) continue;
      const combo = detectCombo(cards);
      if (combo && canBeat(prev, combo, rules)) out.push({ cards, combo });
    }
  }
  const cost = (p) => (isChop(prev, p.combo, rules) ? 1000 : 0) + p.combo.top + (p.combo.rank === TWO ? 500 : 0);
  return out.sort((a, b) => cost(a) - cost(b));
}

/** A reasonable automatic play: lead the cheapest combo containing the lowest card; follow cheaply. */
export function suggestPlay(hand, prev, rules = TIENLEN_DEFAULTS, mustInclude = null) {
  if (!prev) {
    const low = mustInclude || sortCards(hand)[0];
    const plays = legalPlays(hand, null, rules, low);
    // Prefer the longest straight / largest group from the lowest card, so bots shed cards.
    plays.sort((a, b) => b.cards.length - a.cards.length || a.combo.top - b.combo.top);
    return plays[0]?.cards ?? [low];
  }
  return legalPlays(hand, prev, rules)[0]?.cards ?? null;
}
