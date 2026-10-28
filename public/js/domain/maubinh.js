// Mậu binh (Vietnamese Chinese poker) — pure rules shared by client and server.
//
// Each player arranges 13 cards into three "chi":
//   chi đầu  (5 cards, the strongest)   — index 0
//   chi giữa (5 cards)                   — index 1
//   chi cuối (3 cards, the weakest)      — index 2
// chi đầu ≥ chi giữa ≥ chi cuối, otherwise the hand is "lủng" (fouled).
// Every pair of players compares chi by chi; special 13-card hands ("mậu binh") win outright.
import { DECK } from './cards.js';

export const MB_RANKS = '23456789TJQKA';
export const rv = (c) => MB_RANKS.indexOf(c[0]) + 2; // 2..14

/** Categories, weakest → strongest. A 3-card chi can only be HIGH, PAIR or TRIPS. */
export const CAT = Object.freeze({ HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL: 6, QUADS: 7, STRAIGHT_FLUSH: 8 });
export const CAT_KEYS = ['high', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'full', 'quads', 'straightFlush'];

/** Special 13-card hands, strongest first. Points 0 = turned off. */
export const SPECIALS = ['sanhRong', 'dongHoa', 'lucPhe', 'baThung', 'baSanh'];

export const MAUBINH_DEFAULTS = Object.freeze({
  unit: 10, // chips per chi
  arrangeSeconds: 90,
  sapMult: 2, // winning all three chi against one player (sập ba chi) multiplies that result
  sapLang: true, // winning sập against every opponent (3+ players) doubles again
  a2345High: true, // A-2-3-4-5 is the second-highest straight (common Vietnamese rule); off = lowest
  // chi bonuses (paid only when that chi wins)
  sfBack: 5,
  quadBack: 4,
  sfMid: 10,
  quadMid: 8,
  fullMid: 2,
  tripsFront: 3,
  // mậu binh (special hands), chi each opponent pays
  sanhRong: 24,
  dongHoa: 12,
  lucPhe: 3,
  baThung: 3,
  baSanh: 3,
});

const countBy = (list) => {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return m;
};

/** Straight top value for 5 distinct ranks, or 0. The wheel A-2-3-4-5 is 13.5 (2nd best) or 5 (lowest). */
function straightTop(vals, o) {
  const s = [...vals].sort((a, b) => b - a);
  if (new Set(s).size !== s.length) return 0;
  if (s.every((v, i) => i === 0 || s[i - 1] - v === 1)) return s[0];
  if (s.join() === '14,5,4,3,2') return o?.a2345High === false ? 5 : 13.5;
  return 0;
}

/**
 * Evaluates a 3- or 5-card chi → { cat, tb } where tb are tie-break values, highest first.
 * Two chi compare by cat, then tb lexicographically (missing values count as lower).
 */
export function evaluate(cards, o = MAUBINH_DEFAULTS) {
  const vals = cards.map(rv);
  const counts = countBy(vals);
  // groups: [count, value] sorted by count desc, then value desc
  const groups = [...counts.entries()].map(([v, n]) => [n, v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const tb = groups.flatMap(([n, v]) => Array(n).fill(v));
  const byGroup = groups.map(([, v]) => v);
  if (cards.length === 3) {
    if (groups[0][0] === 3) return { cat: CAT.TRIPS, tb: byGroup };
    if (groups[0][0] === 2) return { cat: CAT.PAIR, tb: byGroup };
    return { cat: CAT.HIGH, tb };
  }
  const flush = new Set(cards.map((c) => c[1])).size === 1;
  const top = counts.size === 5 ? straightTop(vals, o) : 0;
  if (flush && top) return { cat: CAT.STRAIGHT_FLUSH, tb: [top] };
  if (groups[0][0] === 4) return { cat: CAT.QUADS, tb: byGroup };
  if (groups[0][0] === 3 && groups[1][0] === 2) return { cat: CAT.FULL, tb: byGroup };
  if (flush) return { cat: CAT.FLUSH, tb };
  if (top) return { cat: CAT.STRAIGHT, tb: [top] };
  if (groups[0][0] === 3) return { cat: CAT.TRIPS, tb: byGroup };
  if (groups[0][0] === 2 && groups[1][0] === 2) return { cat: CAT.TWO_PAIR, tb: byGroup };
  if (groups[0][0] === 2) return { cat: CAT.PAIR, tb: byGroup };
  return { cat: CAT.HIGH, tb };
}

/** > 0 when a beats b, < 0 when b wins, 0 on a tie (suits never break ties). */
export function compare(a, b) {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.tb.length, b.tb.length);
  for (let i = 0; i < n; i++) {
    const x = a.tb[i] ?? -1;
    const y = b.tb[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Splits an ordered list of 13 cards into [chi đầu(5), chi giữa(5), chi cuối(3)]. */
export const splitChi = (cards) => [cards.slice(0, 5), cards.slice(5, 10), cards.slice(10, 13)];

/** { evs, valid } for an arrangement (ordered 13 cards). */
export function judge(cards, o = MAUBINH_DEFAULTS) {
  const evs = splitChi(cards).map((c) => evaluate(c, o));
  return { evs, valid: compare(evs[0], evs[1]) >= 0 && compare(evs[1], evs[2]) >= 0 };
}

/** Chi won when this chi (position 0/1/2) beats the opponent's chi. */
export function chiPoints(pos, ev, o = MAUBINH_DEFAULTS) {
  if (pos === 0) {
    if (ev.cat === CAT.STRAIGHT_FLUSH) return o.sfBack;
    if (ev.cat === CAT.QUADS) return o.quadBack;
  } else if (pos === 1) {
    if (ev.cat === CAT.STRAIGHT_FLUSH) return o.sfMid;
    if (ev.cat === CAT.QUADS) return o.quadMid;
    if (ev.cat === CAT.FULL) return o.fullMid;
  } else if (ev.cat === CAT.TRIPS) return o.tripsFront;
  return 1;
}

// ---------- special hands (mậu binh) ----------

/** Can these ranks (multiset of values) be split into straights of the given lengths? Aces count high or low. */
function splitsIntoStraights(vals, lengths) {
  if (!lengths.length) return vals.length === 0;
  const [len, ...rest] = lengths;
  const counts = countBy(vals);
  const starts = [];
  for (let top = 14; top >= len; top--) {
    const run = Array.from({ length: len }, (_, i) => top - i);
    starts.push(run);
  }
  // wheel-style runs using A as 1 (A-2-3, A-2-3-4-5)
  starts.push(Array.from({ length: len }, (_, i) => (i === len - 1 ? 14 : len - i)));
  for (const run of starts) {
    if (run.some((v) => v < 2 || v > 14)) continue;
    const c = new Map(counts);
    let ok = true;
    for (const v of run) {
      if (!c.get(v)) {
        ok = false;
        break;
      }
      c.set(v, c.get(v) - 1);
    }
    if (!ok) continue;
    const left = [...c.entries()].flatMap(([v, n]) => Array(n).fill(v));
    if (splitsIntoStraights(left, rest)) return true;
  }
  return false;
}

/** Which special hand (if any, and enabled) these 13 cards make, strongest first. */
export function specialOf(cards, o = MAUBINH_DEFAULTS) {
  if (cards.length !== 13) return null;
  const vals = cards.map(rv);
  const counts = countBy(vals);
  const suitCounts = [...countBy(cards.map((c) => c[1])).values()].sort((a, b) => b - a);
  const checks = {
    sanhRong: () => counts.size === 13,
    dongHoa: () => cards.every((c) => 'DH'.includes(c[1])) || cards.every((c) => 'SC'.includes(c[1])),
    lucPhe: () => [...counts.values()].reduce((s, n) => s + Math.floor(n / 2), 0) >= 6,
    baThung: () => {
      const key = suitCounts.join(',');
      return ['13', '10,3', '8,5', '5,5,3'].includes(key);
    },
    baSanh: () => splitsIntoStraights(vals, [5, 5, 3]),
  };
  for (const k of SPECIALS) if (o[k] > 0 && checks[k]()) return k;
  return null;
}

// ---------- settlement ----------

/**
 * Result between two players, from a's point of view (chi a wins; negative = a pays).
 * pa/pb: { evs, valid, special }.
 */
export function versus(pa, pb, o = MAUBINH_DEFAULTS) {
  const rank = (k) => (k ? SPECIALS.length - SPECIALS.indexOf(k) : 0);
  if (pa.special || pb.special) {
    const d = rank(pa.special) - rank(pb.special);
    if (d === 0) return { chi: 0, kind: 'special', per: [0, 0, 0] };
    return d > 0 ? { chi: o[pa.special], kind: 'special', per: [0, 0, 0] } : { chi: -o[pb.special], kind: 'special', per: [0, 0, 0] };
  }
  if (!pa.valid && !pb.valid) return { chi: 0, kind: 'lung', per: [0, 0, 0] };
  if (!pa.valid || !pb.valid) {
    // lủng: loses every chi and counts as sập
    const w = pa.valid ? pa : pb;
    const sum = w.evs.reduce((s, ev, i) => s + chiPoints(i, ev, o), 0) * o.sapMult;
    return pa.valid ? { chi: sum, kind: 'lung', per: [1, 1, 1] } : { chi: -sum, kind: 'lung', per: [-1, -1, -1] };
  }
  let chi = 0;
  const per = [0, 1, 2].map((i) => {
    const c = compare(pa.evs[i], pb.evs[i]);
    if (c > 0) chi += chiPoints(i, pa.evs[i], o);
    else if (c < 0) chi -= chiPoints(i, pb.evs[i], o);
    return Math.sign(c);
  });
  if (per.every((x) => x > 0) || per.every((x) => x < 0)) return { chi: chi * o.sapMult, kind: 'sap', per };
  return { chi, kind: 'chi', per };
}

/**
 * Settles a table. hands: { seat: orderedCards }. Returns per-seat rows and the pairwise matrix.
 * Sập làng: a player who sập every opponent (2+ opponents) gets those results doubled again.
 */
export function settle(hands, o = MAUBINH_DEFAULTS) {
  const seats = Object.keys(hands).map(Number);
  const info = {};
  for (const s of seats) {
    const j = judge(hands[s], o);
    info[s] = { ...j, special: specialOf(hands[s], o) };
  }
  const pair = {};
  for (const a of seats) {
    pair[a] = {};
    for (const b of seats) if (a !== b) pair[a][b] = versus(info[a], info[b], o);
  }
  if (o.sapLang && seats.length >= 3) {
    for (const a of seats) {
      const opp = seats.filter((b) => b !== a);
      if (opp.every((b) => pair[a][b].kind === 'sap' && pair[a][b].chi > 0)) {
        for (const b of opp) {
          pair[a][b] = { ...pair[a][b], chi: pair[a][b].chi * 2, lang: true };
          pair[b][a] = { ...pair[b][a], chi: pair[b][a].chi * 2, lang: true };
        }
      }
    }
  }
  const rows = {};
  for (const a of seats) {
    const total = seats.filter((b) => b !== a).reduce((s, b) => s + pair[a][b].chi, 0);
    rows[a] = { valid: info[a].valid, special: info[a].special, cats: info[a].evs.map((e) => e.cat), total };
  }
  return { rows, pair };
}

// ---------- arranging (bots, timeouts and the "Tự xếp" button) ----------

const choose = (n, k) => {
  const out = [];
  const idx = [];
  const rec = (start) => {
    if (idx.length === k) return void out.push(idx.slice());
    for (let i = start; i < n; i++) {
      idx.push(i);
      rec(i + 1);
      idx.pop();
    }
  };
  rec(0);
  return out;
};
const C13_5 = choose(13, 5);
const C8_5 = choose(8, 5);

/** Rough strength of a chi in its position (higher is better), used to rank arrangements. */
function chiValue(pos, ev, o) {
  const top = (ev.tb[0] ?? 0) / 15;
  const base = ev.cat + top;
  const bonus = chiPoints(pos, ev, o) - 1;
  // A strong chi cuối or chi giữa wins more often than the same hand in chi đầu.
  return base * [1, 1.15, 1.6][pos] + bonus * 0.6;
}

/**
 * Best arrangement found by trying every split (13C5 × 8C5 = 72,072). Returns ordered 13 cards.
 * Only valid (non-lủng) arrangements are considered — there always is one (sorted by strength).
 */
export function bestArrangement(hand, o = MAUBINH_DEFAULTS) {
  const cache = new Map();
  const ev = (cards) => {
    const key = cards.join('');
    let e = cache.get(key);
    if (!e) cache.set(key, (e = evaluate(cards, o)));
    return e;
  };
  let best = null;
  let bestScore = -Infinity;
  for (const bi of C13_5) {
    const back = bi.map((i) => hand[i]);
    const eb = ev(back);
    const rest = hand.filter((_, i) => !bi.includes(i));
    for (const mi of C8_5) {
      const mid = mi.map((i) => rest[i]);
      const em = ev(mid);
      if (compare(eb, em) < 0) continue;
      const front = rest.filter((_, i) => !mi.includes(i));
      const ef = ev(front);
      if (compare(em, ef) < 0) continue;
      const score = chiValue(0, eb, o) + chiValue(1, em, o) + chiValue(2, ef, o);
      if (score > bestScore) {
        bestScore = score;
        best = [...back, ...mid, ...front];
      }
    }
  }
  return best ?? greedyArrange(hand, o);
}

/** Best 5 for chi đầu, best 5 of the rest for chi giữa, the last 3 for chi cuối — always valid. */
export function greedyArrange(hand, o = MAUBINH_DEFAULTS) {
  const best5 = (cards) => {
    let top = null;
    for (const idx of choose(cards.length, 5)) {
      const pick = idx.map((i) => cards[i]);
      const e = evaluate(pick, o);
      if (!top || compare(e, top.e) > 0) top = { e, pick };
    }
    return top.pick;
  };
  const back = best5(hand);
  const rest = hand.filter((c) => !back.includes(c));
  const mid = best5(rest);
  return [...back, ...mid, ...rest.filter((c) => !mid.includes(c))];
}

/** Highest cards first — the starting layout the player rearranges (may be lủng). */
export function sortForArrange(hand) {
  return [...hand].sort((a, b) => rv(b) - rv(a) || 'SCDH'.indexOf(b[1]) - 'SCDH'.indexOf(a[1]));
}

export const isSameCards = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
export { DECK };
