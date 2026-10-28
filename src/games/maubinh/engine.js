// Mậu binh table engine (server side). Pure rules: public/js/domain/maubinh.js.
//
// Everyone arranges at the same time. A player sends `arrange {cards}` (13 cards in order:
// chi đầu 5, chi giữa 5, chi cuối 3) which locks it in; `unready` unlocks it to change.
// When all players are locked in, or the timer runs out, every hand is revealed and settled.
// Nobody sees another player's cards (or arrangement) before the reveal.
import { MAUBINH_DEFAULTS, SPECIALS, settle, judge, specialOf, bestArrangement, isSameCards } from '../../../public/js/domain/maubinh.js';
import { isCardList } from '../../../public/js/domain/cards.js';
import { GameError, clampInt } from '../common.js';

export const meta = Object.freeze({ id: 'maubinh', minSeats: 2, maxSeats: 4 });

const POINT_KEYS = ['sfBack', 'quadBack', 'sfMid', 'quadMid', 'fullMid', 'tripsFront', ...SPECIALS];

export function sanitizeOptions(raw = {}) {
  const d = MAUBINH_DEFAULTS;
  const o = {
    unit: clampInt(raw.unit, 1, 10_000, d.unit),
    arrangeSeconds: clampInt(raw.arrangeSeconds, 30, 300, d.arrangeSeconds),
    sapMult: clampInt(raw.sapMult, 1, 4, d.sapMult),
    sapLang: typeof raw.sapLang === 'boolean' ? raw.sapLang : d.sapLang,
    a2345High: typeof raw.a2345High === 'boolean' ? raw.a2345High : d.a2345High,
  };
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
  const hands = Array(n).fill(null);
  for (const p of players) hands[p] = [];
  for (let r = 0; r < 13; r++) for (const p of players) hands[p].push(deck.pop());
  return {
    game: 'maubinh',
    phase: 'arrange',
    players,
    hands, // as dealt (the owner's private cards)
    arr: Array(n).fill(null), // submitted arrangement per seat
    ready: Array(n).fill(false),
    deck,
    deadline: now + t.opts.game.arrangeSeconds * 1000,
    startedAt: now,
    result: null,
  };
}

export function involved(h, seat) {
  return !!h && h.phase !== 'done' && h.players.includes(seat);
}

function arrange(t, h, seat, cards, now) {
  if (h.phase !== 'arrange') throw new GameError('wrong_phase');
  if (!h.players.includes(seat)) throw new GameError('not_playing');
  if (!isCardList(cards, 13) || cards.length !== 13) throw new GameError('bad_cards');
  if (!isSameCards(cards, h.hands[seat])) throw new GameError('not_your_cards');
  h.arr[seat] = cards.slice();
  h.ready[seat] = true;
  if (h.players.every((p) => h.ready[p])) reveal(t, h, now);
}

function unready(h, seat) {
  if (h.phase !== 'arrange') throw new GameError('wrong_phase');
  if (!h.players.includes(seat)) throw new GameError('not_playing');
  h.ready[seat] = false;
}

function transfer(t, from, to, chips) {
  const c = Math.min(chips, Math.max(0, t.seats[from].chips));
  t.seats[from].chips -= c;
  t.seats[to].chips += c;
  return c;
}

function reveal(t, h, now) {
  const o = t.opts.game;
  for (const p of h.players) if (!h.arr[p]) h.arr[p] = bestArrangement(h.hands[p], o);
  const hands = Object.fromEntries(h.players.map((p) => [p, h.arr[p]]));
  const { rows, pair } = settle(hands, o);
  const delta = Array(t.seats.length).fill(0);
  // Pay pairwise, each pair once (a → b when a lost to b).
  for (const a of h.players) {
    for (const b of h.players) {
      if (a >= b) continue;
      const chi = pair[a][b].chi; // a's view
      if (!chi) continue;
      const [from, to] = chi > 0 ? [b, a] : [a, b];
      const paid = transfer(t, from, to, Math.abs(chi) * o.unit);
      delta[from] -= paid;
      delta[to] += paid;
    }
  }
  h.phase = 'done';
  h.deadline = null;
  h.result = {
    rows: Object.fromEntries(h.players.map((p) => [p, { ...rows[p], delta: delta[p] }])),
    pair,
  };
  h.autoNext = true;
  h.nextAt = now + 15000;
}

export function act(t, h, seat, msg, now) {
  if (msg.t === 'arrange') return arrange(t, h, seat, msg.cards, now);
  if (msg.t === 'unready') return unready(h, seat);
  throw new GameError('bad_action');
}

/** Time is up: the last arrangement each player sent stands; anyone who never sent one gets the best one. */
export function timeout(t, h, now) {
  if (h.phase !== 'arrange') return;
  reveal(t, h, now);
}

export function botDue(t, h) {
  if (h.phase !== 'arrange') return -1;
  return h.players.find((p) => t.seats[p]?.bot && !h.ready[p]) ?? -1;
}

export function botAct(t, h, seat, now) {
  return arrange(t, h, seat, bestArrangement(h.hands[seat], t.opts.game), now);
}

/** What `viewer` (seat index, or -1 for spectators) may see. Cards stay private until the reveal. */
export function view(t, h, viewer) {
  const done = h.phase === 'done';
  const o = t.opts.game;
  const seats = t.seats.map((_, i) => {
    if (!h.players.includes(i)) return null;
    const mine = i === viewer;
    const r = done ? h.result.rows[i] : null;
    return {
      count: 13,
      ready: h.ready[i],
      cards: mine && !done ? h.hands[i].slice() : null,
      arr: done || (mine && h.arr[i]) ? h.arr[i].slice() : null,
      result: r ? { valid: r.valid, special: r.special, cats: r.cats, total: r.total, delta: r.delta } : null,
    };
  });
  const v = {
    game: 'maubinh',
    phase: h.phase,
    players: h.players.slice(),
    deadline: h.deadline,
    nextAt: h.nextAt ?? null,
    seats,
    // Your result against each opponent (chi won per position) once revealed.
    vs: done && viewer >= 0 && h.result.pair[viewer] ? h.result.pair[viewer] : null,
    actions: null,
  };
  if (viewer >= 0 && !done && h.players.includes(viewer)) {
    const mine = h.arr[viewer] ? judge(h.arr[viewer], o) : null;
    v.actions = { arrange: !h.ready[viewer], unready: h.ready[viewer], special: specialOf(h.hands[viewer], o), valid: mine?.valid ?? null };
  }
  return v;
}

export function summary(t, h) {
  if (!h.result) return null;
  return h.players.map((p) => {
    const r = h.result.rows[p];
    return {
      nick: t.seats[p]?.nick ?? '?',
      role: 'player',
      cards: h.arr[p].slice(),
      kind: r.special ? `mb_${r.special}` : r.valid ? 'mb_ok' : 'mb_lung',
      total: r.total,
      bet: null,
      delta: r.delta,
    };
  });
}
