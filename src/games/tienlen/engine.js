// Tiến lên miền Nam table engine (server side). Pure rules: public/js/domain/tienlen.js.
import {
  TIENLEN_DEFAULTS,
  detectCombo,
  canBeat,
  isChop,
  chopValue,
  instantWin,
  losePoints,
  suggestPlay,
  sortCards,
} from '../../../public/js/domain/tienlen.js';
import { isCardList } from '../../../public/js/domain/cards.js';
import { GameError, clampInt } from '../common.js';

export const meta = Object.freeze({ id: 'tienlen', minSeats: 2, maxSeats: 4 });

const BOOL_KEYS = [
  'chop3PairsSingle2',
  'chopQuadSingle2',
  'chopQuadPair2',
  'chopQuad3Pairs',
  'chop4Pairs',
  'chopPay',
  'instantDragon',
  'instantFour2',
  'instantSixPairs',
  'instantFivePairSeq',
  'thoi',
];
const POINT_KEYS = ['perCard', 'cong', 'thoi2Black', 'thoi2Red', 'thoiQuad', 'thoi3Pairs', 'toiTrang', 'rankTop', 'rankMid'];

export function sanitizeOptions(raw = {}) {
  const d = TIENLEN_DEFAULTS;
  const o = { unit: clampInt(raw.unit, 1, 10_000, d.unit), endMode: ['rank', 'first'].includes(raw.endMode) ? raw.endMode : d.endMode };
  for (const k of BOOL_KEYS) o[k] = typeof raw[k] === 'boolean' ? raw[k] : d[k];
  for (const k of POINT_KEYS) o[k] = clampInt(raw[k], 0, 100, d[k]);
  return o;
}

const activeSeat = (t, i) => {
  const s = t.seats[i];
  return s && !s.leaving && !s.away && s.chips > 0;
};

export function canStart(t) {
  return t.seats.filter((_, i) => activeSeat(t, i)).length >= 2;
}

export function startHand(t, deck, now) {
  const players = t.seats.map((_, i) => i).filter((i) => activeSeat(t, i));
  if (players.length < 2) throw new GameError('cannot_start');
  const n = t.seats.length;
  const o = t.opts.game;
  const hands = Array(n).fill(null);
  for (const p of players) hands[p] = [];
  for (let r = 0; r < 13; r++) for (const p of players) hands[p].push(deck.pop());
  for (const p of players) hands[p] = sortCards(hands[p]);

  const h = {
    game: 'tienlen',
    phase: 'play',
    players,
    hands,
    played: Array(n).fill(false),
    passed: Array(n).fill(false),
    out: Array(n).fill(false), // finished (or cóng) — no longer takes turns
    finished: [], // seats in the order they went out (rank mode)
    cong: [], // seats that had not played a card when the first player went out (rank mode)
    trick: null, // { seat, cards, combo, chop }
    chain: 0, // accumulated chặt chồng value (points)
    leader: null,
    turn: null,
    mustInclude: null,
    lastChop: null,
    deck,
    deadline: null,
    startedAt: now,
    result: null,
  };

  // Tới trắng
  for (const p of players) {
    const kind = instantWin(hands[p], o);
    if (kind) {
      finish(t, h, now, p, kind);
      return h;
    }
  }

  // Who leads: last winner if still playing; otherwise the holder of the lowest card (3♠ with 4 players),
  // whose first play must include that card.
  const lastWinner = players.find((p) => t.seats[p].pid === t.tlWinnerPid);
  if (lastWinner != null) h.leader = lastWinner;
  else {
    let best = null;
    for (const p of players) {
      const low = hands[p][0];
      if (!best || sortCards([low, best.card])[0] === low) best = { p, card: low };
    }
    h.leader = best.p;
    h.mustInclude = best.card;
  }
  h.turn = h.leader;
  h.deadline = now + t.opts.turnSeconds * 1000;
  return h;
}

export function involved(h, seat) {
  return !!h && h.phase !== 'done' && h.players.includes(seat);
}

const liveSeats = (h) => h.players.filter((p) => !h.out[p]);

/** Next seat after `from` (in seat order) that satisfies `pred`. */
function nextWhere(h, from, pred) {
  const order = h.players;
  const i = order.indexOf(from);
  for (let k = 1; k <= order.length; k++) {
    const p = order[(i + k) % order.length];
    if (pred(p)) return p;
  }
  return -1;
}

function transfer(t, from, to, points) {
  const chips = Math.min(points * t.opts.game.unit, Math.max(0, t.seats[from].chips));
  t.seats[from].chips -= chips;
  t.seats[to].chips += chips;
  return chips;
}

function play(t, h, seat, cards, now) {
  const o = t.opts.game;
  if (h.phase !== 'play') throw new GameError('wrong_phase');
  if (h.turn !== seat) throw new GameError('not_your_turn');
  if (!isCardList(cards, 13) || !cards.length) throw new GameError('bad_cards');
  const hand = h.hands[seat];
  if (!cards.every((c) => hand.includes(c))) throw new GameError('not_your_cards');
  const combo = detectCombo(cards);
  if (!combo) throw new GameError('bad_combo');
  if (h.mustInclude && !cards.includes(h.mustInclude)) throw new GameError('must_include');
  const prev = h.trick?.combo ?? null;
  if (!canBeat(prev, combo, o)) throw new GameError('cannot_beat');

  const chop = !!prev && isChop(prev, combo, o);
  const chopsChop = !!prev && h.trick.chop && prev.type === combo.type ? true : false;
  h.lastChop = null;
  if ((chop || chopsChop) && o.chopPay) {
    const beaten = chopValue(h.trick.cards, prev, o);
    h.chain = h.trick.chop ? h.chain + beaten : beaten;
    const paid = transfer(t, h.trick.seat, seat, h.chain);
    h.lastChop = { from: h.trick.seat, to: seat, points: h.chain, chips: paid };
  }
  h.hands[seat] = hand.filter((c) => !cards.includes(c));
  h.played[seat] = true;
  h.mustInclude = null;
  h.trick = { seat, cards: sortCards(cards), combo, chop: chop || chopsChop };
  if (!h.hands[seat].length) {
    if (o.endMode === 'first') return finish(t, h, now, seat, null);
    // Rank mode: this player goes out (Nhất, Nhì, …) and the others play on.
    h.out[seat] = true;
    h.finished.push(seat);
    if (h.finished.length === 1) {
      for (const p of h.players) {
        if (!h.out[p] && !h.played[p]) {
          h.out[p] = true;
          h.cong.push(p);
        }
      }
    }
    const live = liveSeats(h);
    if (live.length <= 1) return finishRank(t, h, now, live);
  }
  advance(t, h, seat, now);
}

function advance(t, h, from, now) {
  // Players who may still beat the table: in the game, not passed, not the owner of the trick.
  const canAnswer = (p) => !h.out[p] && !h.passed[p] && p !== h.trick.seat;
  if (!h.players.some(canAnswer)) {
    // Everyone passed → new round. The trick owner leads; if they already went out,
    // the next player still holding cards leads.
    const owner = h.trick.seat;
    h.passed.fill(false);
    h.trick = null;
    h.chain = 0;
    h.leader = h.out[owner] ? nextWhere(h, owner, (p) => !h.out[p]) : owner;
    h.turn = h.leader;
  } else {
    h.turn = nextWhere(h, from, canAnswer);
  }
  h.deadline = now + t.opts.turnSeconds * 1000;
}

function pass(t, h, seat, now) {
  if (h.phase !== 'play') throw new GameError('wrong_phase');
  if (h.turn !== seat) throw new GameError('not_your_turn');
  if (!h.trick) throw new GameError('must_lead');
  h.passed[seat] = true;
  h.lastChop = null;
  advance(t, h, seat, now);
}

function finish(t, h, now, winner, instant) {
  const o = t.opts.game;
  h.phase = 'done';
  h.turn = null;
  h.deadline = null;
  const rows = Array(t.seats.length).fill(null);
  let won = 0;
  for (const p of h.players) {
    if (p === winner) continue;
    const lp = instant ? { points: o.toiTrang, cong: false, parts: [{ k: 'toiTrang', v: o.toiTrang }] } : losePoints(h.hands[p], { played: h.played[p] }, o);
    const chips = transfer(t, p, winner, lp.points);
    won += chips;
    rows[p] = { rank: 0, last: false, delta: -chips, points: lp.points, cong: lp.cong, parts: lp.parts };
  }
  rows[winner] = { rank: 1, last: false, delta: won, points: 0, cong: false, parts: [] };
  h.result = { winner, instant, mode: 'first', order: [winner], rows };
  h.autoNext = true;
  h.nextAt = now + 8000;
  t.tlWinnerPid = t.seats[winner].pid;
}

/**
 * Rank-mode settlement. Order: players who went out, then the last one holding cards, then cóng players.
 * Bét pays Nhất `rankTop`; with 4+ players Ba pays Nhì `rankMid`. A cóng player pays Nhất 2×rankTop instead
 * of a positional payment. Everyone still holding cards pays Nhất the thối penalties left in their hand.
 */
function finishRank(t, h, now, live) {
  const o = t.opts.game;
  const order = [...h.finished, ...live, ...h.cong];
  const n = order.length;
  const first = order[0];
  const delta = Array(t.seats.length).fill(0);
  const parts = Array(t.seats.length).fill(null).map(() => []);
  const pay = (from, to, points, k) => {
    if (points <= 0 || from === to) return;
    const chips = transfer(t, from, to, points);
    delta[from] -= chips;
    delta[to] += chips;
    parts[from].push({ k, v: points });
  };
  const isCong = (p) => h.cong.includes(p);
  if (n >= 2 && !isCong(order[n - 1])) pay(order[n - 1], first, o.rankTop, 'rankTop');
  if (n >= 4 && !isCong(order[n - 2])) pay(order[n - 2], order[1], o.rankMid, 'rankMid');
  for (const p of h.cong) pay(p, first, o.rankTop * 2, 'cong');
  if (o.thoi) {
    for (const p of [...live, ...h.cong]) {
      const thoi = losePoints(h.hands[p], { played: true }, o).parts.filter((x) => x.k.startsWith('thoi'));
      for (const x of thoi) pay(p, first, x.v, x.k);
    }
  }
  h.phase = 'done';
  h.turn = null;
  h.deadline = null;
  const rows = Array(t.seats.length).fill(null);
  order.forEach((p, i) => {
    rows[p] = { rank: i + 1, last: i === n - 1, delta: delta[p], points: 0, cong: isCong(p), parts: parts[p] };
  });
  h.result = { winner: first, instant: null, mode: 'rank', order, rows };
  h.autoNext = true;
  h.nextAt = now + 10000;
  t.tlWinnerPid = t.seats[first].pid;
}

export function act(t, h, seat, msg, now) {
  if (!h.out) {
    h.out = Array(t.seats.length).fill(false);
    h.finished = [];
    h.cong = [];
  }
  if (msg.t === 'play') return play(t, h, seat, msg.cards, now);
  if (msg.t === 'pass') return pass(t, h, seat, now);
  throw new GameError('bad_action');
}

function autoMove(t, h, seat, now) {
  const o = t.opts.game;
  const prev = h.trick?.combo ?? null;
  const cards = suggestPlay(h.hands[seat], prev, o, h.mustInclude);
  if (cards) return play(t, h, seat, cards, now);
  return pass(t, h, seat, now);
}

/** Timeout: leaders auto-play their cheapest lead, followers auto-pass. */
export function timeout(t, h, now) {
  if (h.phase !== 'play') return;
  if (!h.trick) return autoMove(t, h, h.turn, now);
  return pass(t, h, h.turn, now);
}

export function botDue(t, h) {
  return h.phase === 'play' && h.turn != null && t.seats[h.turn]?.bot ? h.turn : -1;
}

export function botAct(t, h, seat, now) {
  return autoMove(t, h, seat, now);
}

export function view(t, h, viewer) {
  const done = h.phase === 'done';
  const seats = t.seats.map((_, i) => {
    if (!h.players.includes(i)) return null;
    return {
      count: h.hands[i].length,
      cards: i === viewer || done ? h.hands[i].slice() : null,
      passed: h.passed[i],
      played: h.played[i],
      // Public progress in rank mode: who already went out (and in which place) and who is cóng.
      rank: h.finished ? h.finished.indexOf(i) + 1 : 0,
      out: !!h.out?.[i],
      cong: !!h.cong?.includes(i),
      result: done ? h.result.rows[i] : null,
    };
  });
  const v = {
    game: 'tienlen',
    phase: h.phase,
    players: h.players.slice(),
    turn: h.turn,
    leader: h.leader,
    deadline: h.deadline,
    nextAt: h.nextAt ?? null,
    trick: h.trick ? { seat: h.trick.seat, cards: h.trick.cards.slice(), combo: h.trick.combo, chop: h.trick.chop } : null,
    // Only the leader needs to know which card the first play must contain.
    mustInclude: viewer >= 0 && viewer === h.turn ? h.mustInclude : null,
    firstLead: !!h.mustInclude,
    lastChop: h.lastChop,
    mode: t.opts.game.endMode,
    result: done ? { winner: h.result.winner, instant: h.result.instant, mode: h.result.mode, order: h.result.order } : null,
    seats,
    actions: null,
  };
  if (viewer >= 0 && !done && h.turn === viewer) v.actions = { play: true, pass: !!h.trick };
  return v;
}

export function summary(t, h) {
  if (!h.result) return null;
  const nick = (i) => t.seats[i]?.nick ?? '?';
  return h.players.map((p) => {
    const r = h.result.rows[p];
    const isWin = p === h.result.winner;
    const kind =
      h.result.mode === 'rank'
        ? r.cong
          ? 'cong'
          : r.last
            ? 'rank_last'
            : `rank_${r.rank}`
        : isWin
          ? h.result.instant
            ? `toi_${h.result.instant}`
            : 'win'
          : r.cong
            ? 'cong'
            : 'lose';
    return {
      nick: nick(p),
      role: isWin ? 'winner' : 'player',
      cards: h.hands[p].slice(),
      kind,
      total: h.hands[p].length,
      bet: null,
      delta: r.delta,
    };
  });
}
