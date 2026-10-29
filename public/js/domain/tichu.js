// Tichu — pure rules shared by client and server.
//
// 56 cards: the 52 normal cards (id = rank + suit, like the rest of the app) plus four specials:
//   MJ Mạt chược (Mah Jong, value 1, leads first, may make a wish)
//   DG Chó (Dog, led only: passes the lead to your partner)
//   PH Phượng (Phoenix, wild card in combinations; as a single it is ½ above the last single; −25 points)
//   DR Rồng (Dragon, the highest single; +25 points, but the trick must be given to an opponent)
import { DECK as NORMAL } from './cards.js';

export const MJ = 'MJ';
export const DG = 'DG';
export const PH = 'PH';
export const DR = 'DR';
export const SPECIAL_CARDS = Object.freeze([MJ, DG, PH, DR]);
export const TICHU_DECK = Object.freeze([...NORMAL, ...SPECIAL_CARDS]);
const CARD_SET = new Set(TICHU_DECK);

export const isTichuCard = (c) => typeof c === 'string' && CARD_SET.has(c);
export const isSpecial = (c) => SPECIAL_CARDS.includes(c);

/** Validates a list of distinct Tichu card ids. */
export function isTichuCardList(list, max = 14) {
  if (!Array.isArray(list) || list.length > max) return false;
  const seen = new Set();
  for (const c of list) {
    if (!isTichuCard(c) || seen.has(c)) return false;
    seen.add(c);
  }
  return true;
}

export const RANKS = '23456789TJQKA';
/** Value of a normal card 2..14, Mah Jong 1. */
export const val = (c) => (c === MJ ? 1 : RANKS.indexOf(c[0]) + 2);
export const DRAGON_VALUE = 15;
export const rankChar = (v) => RANKS[v - 2];

export const TICHU_DEFAULTS = Object.freeze({
  target: 1000, // match length (points)
  unit: 10, // chips per 10 points of difference in a hand
  tichuBonus: 100,
  grandBonus: 200,
  doubleWin: 200, // partners go out 1st and 2nd
});

/** Card points: 5 → 5, 10 and K → 10, Dragon +25, Phoenix −25. A hand totals 100. */
export function cardPoints(c) {
  if (c === DR) return 25;
  if (c === PH) return -25;
  if (isSpecial(c)) return 0;
  return c[0] === '5' ? 5 : c[0] === 'T' || c[0] === 'K' ? 10 : 0;
}
export const pointsOf = (cards) => cards.reduce((s, c) => s + cardPoints(c), 0);

/** Sort for display: by value, specials at their natural place (Dog first, Dragon last). */
export function sortTichu(cards) {
  const key = (c) => (c === DG ? -1 : c === MJ ? 1 : c === PH ? 15.5 : c === DR ? 16 : val(c) + 'SCDH'.indexOf(c[1]) / 10);
  return [...cards].sort((a, b) => key(a) - key(b));
}

// ---------- combinations ----------
// combo = { type, len, value }   type: single | pair | triple | full | straight | pairs | bomb4 | bombsf | dog
// len: cards for straights/bombsf, pairs for 'pairs'. value: the top (for full house: the triple).

const isBomb = (c) => c && (c.type === 'bomb4' || c.type === 'bombsf');
export { isBomb };

/** Interpretation of cards without the Phoenix (normal cards and maybe Mah Jong). */
function plain(cards) {
  const n = cards.length;
  const vs = cards.map(val).sort((a, b) => a - b);
  const counts = new Map();
  for (const v of vs) counts.set(v, (counts.get(v) || 0) + 1);
  const hasMJ = cards.includes(MJ);
  if (n === 1) return { type: 'single', len: 1, value: vs[0] };
  if (hasMJ && n < 5) return null; // Mah Jong only goes in straights
  if (n === 2 && counts.size === 1) return { type: 'pair', len: 1, value: vs[0] };
  if (n === 3 && counts.size === 1) return { type: 'triple', len: 1, value: vs[0] };
  if (n === 4 && counts.size === 1) return { type: 'bomb4', len: 4, value: vs[0] };
  if (n === 5 && counts.size === 2 && !hasMJ) {
    const [a, b] = [...counts.entries()];
    const three = a[1] === 3 ? a : b[1] === 3 ? b : null;
    if (three) return { type: 'full', len: 5, value: three[0] };
  }
  if (n >= 5 && counts.size === n && vs[n - 1] - vs[0] === n - 1) {
    const flush = !hasMJ && new Set(cards.map((c) => c[1])).size === 1;
    return { type: flush ? 'bombsf' : 'straight', len: n, value: vs[n - 1] };
  }
  if (n >= 4 && n % 2 === 0 && !hasMJ && [...counts.values()].every((k) => k === 2)) {
    const keys = [...counts.keys()];
    if (keys[keys.length - 1] - keys[0] === keys.length - 1) return { type: 'pairs', len: n / 2, value: keys[keys.length - 1] };
  }
  return null;
}

/**
 * Detects the combination these cards form, or null. With the Phoenix in a multi-card combination,
 * the strongest valid reading is used (the Phoenix never makes a bomb).
 * A single Phoenix returns { type:'single', phoenix:true, value: (prevSingle + 0.5) or 1.5 }.
 */
export function detectCombo(cards, prev = null) {
  if (!isTichuCardList(cards, 14) || !cards.length) return null;
  if (cards.length === 1) {
    const c = cards[0];
    if (c === DG) return { type: 'dog', len: 1, value: 0 };
    if (c === DR) return { type: 'single', len: 1, value: DRAGON_VALUE, dragon: true };
    if (c === PH) {
      const base = prev && prev.type === 'single' ? prev.value : 1;
      return { type: 'single', len: 1, value: base + 0.5, phoenix: true };
    }
    return { type: 'single', len: 1, value: val(c) };
  }
  if (cards.includes(DG) || cards.includes(DR)) return null;
  if (!cards.includes(PH)) return plain(cards);
  // Phoenix as a wild card: try every normal value; keep the best non-bomb reading.
  const rest = cards.filter((c) => c !== PH);
  let best = null;
  for (let v = 2; v <= 14; v++) {
    const sub = RANKS[v - 2] + 'X'; // a stand-in card of value v (suit X never forms a flush)
    const k = plainWith(rest, sub);
    if (!k || isBomb(k)) continue;
    if (!best || typeRank(k) > typeRank(best) || (typeRank(k) === typeRank(best) && k.value > best.value)) best = k;
  }
  return best;
}

const TYPE_ORDER = ['single', 'pair', 'triple', 'pairs', 'straight', 'full'];
const typeRank = (k) => TYPE_ORDER.indexOf(k.type);

function plainWith(rest, stand) {
  // the stand-in has an impossible suit so it can never complete a flush
  const cards = [...rest, stand];
  const n = cards.length;
  const vs = cards.map((c) => (c === MJ ? 1 : RANKS.indexOf(c[0]) + 2)).sort((a, b) => a - b);
  const counts = new Map();
  for (const v of vs) counts.set(v, (counts.get(v) || 0) + 1);
  const hasMJ = rest.includes(MJ);
  if (hasMJ && n < 5) return null;
  if (n === 2 && counts.size === 1) return { type: 'pair', len: 1, value: vs[0] };
  if (n === 3 && counts.size === 1) return { type: 'triple', len: 1, value: vs[0] };
  if (n === 4 && counts.size === 1) return null; // would be a bomb
  if (n === 5 && counts.size === 2 && !hasMJ) {
    const e = [...counts.entries()];
    const three = e.find((x) => x[1] === 3);
    if (three) return { type: 'full', len: 5, value: three[0] };
  }
  if (n >= 5 && counts.size === n && vs[n - 1] - vs[0] === n - 1) return { type: 'straight', len: n, value: vs[n - 1] };
  if (n >= 4 && n % 2 === 0 && !hasMJ && [...counts.values()].every((k) => k === 2)) {
    const keys = [...counts.keys()];
    if (keys[keys.length - 1] - keys[0] === keys.length - 1) return { type: 'pairs', len: n / 2, value: keys[keys.length - 1] };
  }
  return null;
}

/** Does `cur` beat `prev` (null = leading)? */
export function canBeat(prev, cur) {
  if (!cur) return false;
  if (!prev) return true;
  if (cur.type === 'dog') return false;
  if (isBomb(cur)) {
    if (!isBomb(prev)) return true;
    if (cur.type !== prev.type) return cur.type === 'bombsf';
    if (cur.type === 'bombsf' && cur.len !== prev.len) return cur.len > prev.len;
    return cur.value > prev.value;
  }
  if (isBomb(prev)) return false;
  if (cur.type !== prev.type || cur.len !== prev.len) return false;
  if (cur.phoenix) return !prev.dragon; // ½ above any single except the Dragon
  return cur.value > prev.value;
}

// ---------- generating plays (hints, bots, wish checks) ----------

/** Every distinct play available from a hand (one representative per shape and value). */
export function allPlays(hand, prev = null) {
  const out = [];
  const normal = hand.filter((c) => !isSpecial(c));
  const by = new Map();
  for (const c of normal) {
    const v = val(c);
    if (!by.has(v)) by.set(v, []);
    by.get(v).push(c);
  }
  const has = (c) => hand.includes(c);
  const add = (cards) => {
    const k = detectCombo(cards, prev);
    if (k) out.push({ cards, combo: k });
  };
  // singles
  for (const c of hand) add([c]);
  // groups
  for (const [v, cs] of by) {
    if (cs.length >= 2) add(cs.slice(0, 2));
    if (cs.length >= 3) add(cs.slice(0, 3));
    if (cs.length === 4) add(cs.slice(0, 4));
    if (has(PH) && cs.length >= 1) add([cs[0], PH]);
    if (has(PH) && cs.length >= 2) add([cs[0], cs[1], PH]);
  }
  // full houses
  for (const [t, ts] of by) {
    for (const [p, ps] of by) {
      if (p === t) continue;
      if (ts.length >= 3 && ps.length >= 2) add([...ts.slice(0, 3), ...ps.slice(0, 2)]);
      if (has(PH) && ts.length >= 2 && ps.length >= 2) add([...ts.slice(0, 2), PH, ...ps.slice(0, 2)]);
      if (has(PH) && ts.length >= 3 && ps.length >= 1) add([...ts.slice(0, 3), ps[0], PH]);
    }
  }
  // straights (one card per value, Mah Jong as 1, at most one Phoenix gap)
  const present = (v) => (v === 1 ? has(MJ) : by.has(v));
  const pickV = (v) => (v === 1 ? MJ : by.get(v)[0]);
  for (let len = 5; len <= 14; len++) {
    for (let top = len; top <= 14; top++) {
      const low = top - len + 1;
      if (low < 1) continue;
      const missing = [];
      for (let v = low; v <= top; v++) if (!present(v)) missing.push(v);
      if (missing.length === 0) add(Array.from({ length: len }, (_, i) => pickV(low + i)));
      else if (missing.length === 1 && has(PH) && missing[0] !== 1) {
        add(Array.from({ length: len }, (_, i) => (low + i === missing[0] ? PH : pickV(low + i))));
      }
    }
  }
  // consecutive pairs
  for (let len = 2; len <= 7; len++) {
    for (let top = len + 1; top <= 14; top++) {
      const low = top - len + 1;
      if (low < 2) continue;
      let short = 0;
      for (let v = low; v <= top; v++) short += Math.max(0, 2 - (by.get(v)?.length || 0));
      if (short === 0) add(Array.from({ length: len }, (_, i) => by.get(low + i).slice(0, 2)).flat());
      else if (short === 1 && has(PH)) {
        add(Array.from({ length: len }, (_, i) => {
          const cs = by.get(low + i) || [];
          return cs.length >= 2 ? cs.slice(0, 2) : [cs[0], PH];
        }).flat());
      }
    }
  }
  // straight-flush bombs
  for (const s of 'SCDH') {
    const vs = new Set(normal.filter((c) => c[1] === s).map(val));
    for (let len = 5; len <= 13; len++) {
      for (let top = len + 1; top <= 14; top++) {
        const low = top - len + 1;
        let ok = true;
        for (let v = low; v <= top; v++) if (!vs.has(v)) ok = false;
        if (ok) add(Array.from({ length: len }, (_, i) => RANKS[low + i - 2] + s));
      }
    }
  }
  return out;
}

/** Plays that beat `prev` (all of them, bombs included). */
export const legalPlays = (hand, prev) => allPlays(hand, prev).filter((p) => canBeat(prev, p.combo));

/** Must the player fulfil the wish (holds the wished value and can legally play it)? Returns those plays. */
export function wishPlays(hand, prev, wish) {
  if (!wish) return [];
  if (!hand.some((c) => !isSpecial(c) && val(c) === wish)) return [];
  // Bombs are never compulsory: the wish only forces a normal play (house rule kept simple and stated in the course).
  return legalPlays(hand, prev).filter((p) => !isBomb(p.combo) && p.cards.some((c) => !isSpecial(c) && val(c) === wish));
}

// ---------- bots / hints ----------

const strengthOf = (hand) => {
  const n = (v) => hand.filter((c) => !isSpecial(c) && val(c) === v).length;
  const bombs = allPlays(hand).filter((p) => isBomb(p.combo)).length;
  return (hand.includes(DR) ? 2 : 0) + (hand.includes(PH) ? 2 : 0) + n(14) + n(13) * 0.4 + bombs * 2;
};

/** Grand Tichu (on 8 cards): only with an exceptional start. */
export const botGrand = (eight, at = 5.5) => strengthOf(eight) >= at;
/** Tichu (on 14 cards before playing). */
export const botTichu = (hand, at = 7) => strengthOf(hand) >= at;

/** Three cards to give: [to next player, to partner, to previous player]. */
export function botExchange(hand) {
  const bombCards = new Set(allPlays(hand).filter((p) => isBomb(p.combo)).flatMap((p) => p.cards));
  const pool = sortTichu(hand).filter((c) => !bombCards.has(c));
  const keep = new Set([DR, PH, MJ]);
  const normals = pool.filter((c) => !keep.has(c) && c !== DG);
  const toPartner = normals[normals.length - 1] ?? pool.find((c) => c !== DR && c !== PH) ?? hand[0];
  const low = pool.filter((c) => c !== toPartner && !keep.has(c));
  const a = hand.includes(DG) ? DG : low[0];
  const b = low.find((c) => c !== a) ?? hand.find((c) => c !== toPartner && c !== a);
  const third = b ?? hand.find((c) => ![toPartner, a].includes(c));
  return [a, toPartner, third];
}

let bombCards = new Set();
const cost = (p) => {
  // prefer shedding many low cards, keep Dragon/Phoenix/bombs for later, don't break a bomb
  const special = p.cards.includes(DR) ? 30 : p.cards.includes(PH) ? 20 : 0;
  const breaks = !isBomb(p.combo) && p.cards.some((c) => bombCards.has(c)) ? 25 : 0;
  return p.combo.value + special + breaks + (isBomb(p.combo) ? 50 : 0) - p.cards.length * 1.5;
};

/**
 * A bot's play: { cards, wish? } or null to pass.
 * ctx: { prev, partnerOwns, partnerOut, partnerCount, oppMinCount, wish, myCount }
 */
export function botPlay(hand, ctx) {
  const { prev, wish } = ctx;
  bombCards = new Set(allPlays(hand).filter((p) => isBomb(p.combo)).flatMap((p) => p.cards));
  const forced = wishPlays(hand, prev, wish);
  if (forced.length) return { cards: forced.sort((a, b) => cost(a) - cost(b))[0].cards };
  const plays = legalPlays(hand, prev);
  // Going out with this play? Do it.
  const finishing = plays.find((p) => p.cards.length === hand.length);
  if (finishing) return withWish(finishing.cards, hand);
  if (!prev) {
    if (hand.includes(DG) && !ctx.partnerOut && ctx.partnerCount <= 4) return { cards: [DG] };
    const lead = plays.filter((p) => !isBomb(p.combo) && p.combo.type !== 'dog' && !p.cards.includes(DR) && !p.cards.includes(PH));
    const pool = lead.length ? lead : plays.filter((p) => p.combo.type !== 'dog' || !ctx.partnerOut);
    if (!pool.length) return { cards: [hand[0]] };
    pool.sort((a, b) => cost(a) - cost(b));
    return withWish(pool[0].cards, hand);
  }
  if (ctx.partnerOwns) return null;
  const normalBeats = plays.filter((p) => !isBomb(p.combo));
  const urgent = ctx.oppMinCount <= 2 || ctx.myCount <= 4;
  const cheap = normalBeats.filter((p) => urgent || (!p.cards.includes(DR) && !p.cards.includes(PH)));
  if (cheap.length) return withWish(cheap.sort((a, b) => cost(a) - cost(b))[0].cards, hand);
  if (ctx.oppMinCount <= (ctx.bombAt ?? 2)) {
    const bombs = plays.filter((p) => isBomb(p.combo)).sort((a, b) => cost(a) - cost(b));
    if (bombs.length) return { cards: bombs[0].cards };
  }
  return null;
}

/** When leading the Mah Jong, wish for a high value the bot does not hold. */
function withWish(cards, hand) {
  if (!cards.includes(MJ)) return { cards };
  const mine = new Set(hand.filter((c) => !isSpecial(c)).map(val));
  const wish = [14, 13, 12, 11, 10].find((v) => !mine.has(v)) ?? null;
  return { cards, wish };
}

/** The opponent who gets a Dragon trick: the one with more cards left (less likely to go out). */
export const botDragonTarget = (opponents, counts) => [...opponents].sort((a, b) => counts[b] - counts[a])[0];
