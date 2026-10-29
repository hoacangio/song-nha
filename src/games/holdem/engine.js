// Texas Hold'em No-Limit table engine (server side). Pure rules: public/js/domain/holdem.js.
import {
  HOLDEM_DEFAULTS,
  bestHand,
  buildPots,
  splitPot,
  orderFromButton,
  preflopStrength,
} from '../../../public/js/domain/holdem.js';
import { isChipAmount } from '../../lib/protocol.js';
import { personaOf } from '../personas.js';
import { GameError, clampInt } from '../common.js';

export const meta = Object.freeze({ id: 'holdem', minSeats: 2, maxSeats: 9 });

const RUNOUT_MS = 1400;
const STREETS = ['preflop', 'flop', 'turn', 'river'];

export function sanitizeOptions(raw = {}) {
  const d = HOLDEM_DEFAULTS;
  const bigBlind = clampInt(raw.bigBlind, 2, 100_000, d.bigBlind);
  const smallBlind = clampInt(raw.smallBlind, 1, bigBlind, Math.min(d.smallBlind, bigBlind));
  const ante = clampInt(raw.ante, 0, bigBlind, d.ante);
  return { smallBlind, bigBlind, ante };
}

const activeSeat = (t, i) => {
  const s = t.seats[i];
  return s && !s.leaving && !s.away && s.chips > 0;
};

export function canStart(t) {
  return t.seats.filter((_, i) => activeSeat(t, i)).length >= 2;
}

/** Next seat after `from` (clockwise) among `list` satisfying `pred`. */
function nextIn(list, from, total, pred = () => true) {
  for (let k = 1; k <= total; k++) {
    const i = (from + k) % total;
    if (list.includes(i) && pred(i)) return i;
  }
  return -1;
}

export function startHand(t, deck, now) {
  const o = t.opts.game;
  const n = t.seats.length;
  const players = t.seats.map((_, i) => i).filter((i) => activeSeat(t, i));
  if (players.length < 2) throw new GameError('cannot_start');
  const prevButton = Number.isInteger(t.hdButton) ? t.hdButton : -1;
  const button = nextIn(players, prevButton, n);
  t.hdButton = button;
  const headsUp = players.length === 2;
  const sb = headsUp ? button : nextIn(players, button, n);
  const bb = nextIn(players, sb, n);

  const h = {
    game: 'holdem',
    phase: 'play',
    street: 'preflop',
    players,
    button,
    sb,
    bb,
    hole: Array(n).fill(null),
    board: [],
    folded: Array(n).fill(false),
    allIn: Array(n).fill(false),
    acted: Array(n).fill(false),
    canRaise: Array(n).fill(true),
    bet: Array(n).fill(0),
    contrib: Array(n).fill(0),
    lastAction: Array(n).fill(null),
    currentBet: 0,
    minRaise: o.bigBlind,
    turn: null,
    deck,
    runout: false,
    showdown: false,
    deadline: null,
    result: null,
    startedAt: now,
  };
  // Deal two cards each, one at a time starting left of the button.
  const order = orderFromButton(players, button, n);
  for (const p of order) h.hole[p] = [];
  for (let r = 0; r < 2; r++) for (const p of order) h.hole[p].push(deck.pop());

  if (o.ante > 0) for (const p of players) put(t, h, p, o.ante, { ante: true });
  put(t, h, sb, o.smallBlind);
  put(t, h, bb, o.bigBlind);
  h.lastAction[sb] = 'sb';
  h.lastAction[bb] = 'bb';
  h.currentBet = Math.max(...h.bet);
  h.minRaise = o.bigBlind;
  const first = nextIn(players, bb, n, (i) => canAct(h, i));
  if (first < 0 || everyoneAllInOrDone(h)) {
    startRunout(t, h, now);
    return h;
  }
  h.turn = first;
  h.deadline = now + t.opts.turnSeconds * 1000;
  return h;
}

/** Moves chips from a seat's stack into its current bet (all-in when the stack runs out). */
function put(t, h, seat, amount, { ante = false } = {}) {
  const s = t.seats[seat];
  const x = Math.min(amount, s.chips);
  s.chips -= x;
  h.contrib[seat] += x;
  if (!ante) h.bet[seat] += x;
  if (s.chips === 0) h.allIn[seat] = true;
  return x;
}

const live = (h) => h.players.filter((p) => !h.folded[p]);
const canAct = (h, p) => !h.folded[p] && !h.allIn[p];
const everyoneAllInOrDone = (h) => {
  const actors = live(h).filter((p) => !h.allIn[p]);
  return actors.length === 0 || (actors.length === 1 && h.bet[actors[0]] >= h.currentBet);
};

/**
 * Seats dealt into the running hand keep their seat until it ends — including folded players,
 * whose chips are already in the pot and are settled at the end.
 */
export function involved(h, seat) {
  return !!h && h.phase !== 'done' && h.players.includes(seat);
}

function roundComplete(h) {
  return live(h)
    .filter((p) => !h.allIn[p])
    .every((p) => h.acted[p] && h.bet[p] === h.currentBet);
}

function afterAction(t, h, seat, now) {
  const n = t.seats.length;
  if (live(h).length === 1) return finish(t, h, now);
  if (roundComplete(h)) return nextStreet(t, h, now);
  const next = nextIn(h.players, seat, n, (i) => canAct(h, i) && (!h.acted[i] || h.bet[i] < h.currentBet));
  if (next < 0) return nextStreet(t, h, now);
  h.turn = next;
  h.deadline = now + t.opts.turnSeconds * 1000;
}

function dealStreet(h) {
  h.deck.pop(); // burn
  const k = h.board.length === 0 ? 3 : 1;
  for (let i = 0; i < k; i++) h.board.push(h.deck.pop());
  h.street = STREETS[STREETS.indexOf(h.street) + 1];
}

function nextStreet(t, h, now) {
  for (const p of h.players) {
    h.bet[p] = 0;
    h.acted[p] = false;
    h.canRaise[p] = true;
    if (!h.folded[p] && !h.allIn[p]) h.lastAction[p] = null;
  }
  h.currentBet = 0;
  h.minRaise = t.opts.game.bigBlind;
  if (h.street === 'river') return finish(t, h, now);
  if (everyoneAllInOrDone(h)) return startRunout(t, h, now);
  dealStreet(h);
  const first = nextIn(h.players, h.button, t.seats.length, (i) => canAct(h, i));
  h.turn = first;
  h.deadline = now + t.opts.turnSeconds * 1000;
}

/** Nobody can bet any more: show the live hands and deal the rest of the board street by street. */
function startRunout(t, h, now) {
  h.runout = true;
  h.turn = null;
  for (const p of h.players) h.bet[p] = 0;
  h.currentBet = 0;
  if (h.board.length >= 5) return finish(t, h, now);
  h.deadline = now + RUNOUT_MS;
}

function finish(t, h, now) {
  h.phase = 'done';
  h.turn = null;
  h.deadline = null;
  const n = t.seats.length;
  const alive = live(h);
  const won = Array(n).fill(0);
  const hands = Array(n).fill(null);
  if (alive.length === 1) {
    // Everyone else folded: no showdown, cards stay hidden.
    const total = h.contrib.reduce((s, x) => s + x, 0);
    won[alive[0]] = total;
    h.showdown = false;
  } else {
    while (h.board.length < 5) dealStreet(h);
    h.showdown = true;
    for (const p of alive) hands[p] = bestHand([...h.hole[p], ...h.board]);
    h.pots = buildPots(h.contrib, h.folded).map((pot) => {
      const top = Math.max(...pot.eligible.map((p) => hands[p].score));
      const winners = orderFromButton(pot.eligible.filter((p) => hands[p].score === top), h.button, n);
      const shares = splitPot(pot.amount, winners);
      for (const s of shares) won[s.seat] += s.amount;
      return { amount: pot.amount, winners };
    });
  }
  for (const p of h.players) if (t.seats[p]) t.seats[p].chips += won[p];
  h.result = {
    rows: h.players.map((p) => ({
      seat: p,
      won: won[p],
      delta: won[p] - h.contrib[p],
      category: hands[p]?.category ?? null,
      best: hands[p]?.cards ?? null,
    })),
  };
  h.autoNext = true;
  h.nextAt = now + 8000;
}

export function act(t, h, seat, msg, now) {
  if (h.phase !== 'play' || h.runout) throw new GameError('wrong_phase');
  if (h.turn !== seat) throw new GameError('not_your_turn');
  const stack = t.seats[seat].chips;
  const toCall = h.currentBet - h.bet[seat];
  switch (msg.t) {
    case 'fold':
      h.folded[seat] = true;
      h.lastAction[seat] = 'fold';
      break;
    case 'check':
      if (toCall > 0) throw new GameError('cannot_check');
      h.lastAction[seat] = 'check';
      break;
    case 'call':
      if (toCall <= 0) throw new GameError('nothing_to_call');
      put(t, h, seat, toCall);
      h.lastAction[seat] = h.allIn[seat] ? 'allin' : 'call';
      break;
    case 'raise':
    case 'allin': {
      const maxTo = h.bet[seat] + stack;
      const to = msg.t === 'allin' ? maxTo : msg.amount;
      if (msg.t === 'raise' && !isChipAmount(to, { min: 1, max: 1_000_000_000 })) throw new GameError('bad_amount');
      if (to > maxTo) throw new GameError('bad_amount');
      if (to <= h.currentBet) {
        // An "all-in" that does not exceed the current bet is just a (partial) call.
        if (msg.t === 'raise') throw new GameError('bad_amount');
        if (toCall <= 0) throw new GameError('cannot_check');
        put(t, h, seat, toCall);
        h.lastAction[seat] = 'allin';
        break;
      }
      const raiseBy = to - h.currentBet;
      const full = raiseBy >= h.minRaise;
      if (!h.canRaise[seat]) throw new GameError('cannot_raise');
      if (!full && to !== maxTo) throw new GameError('min_raise');
      put(t, h, seat, to - h.bet[seat]);
      h.lastAction[seat] = h.allIn[seat] ? 'allin' : h.currentBet === 0 ? 'bet' : 'raise';
      for (const p of h.players) {
        if (p === seat || !canAct(h, p)) continue;
        // A full raise reopens the betting; an incomplete all-in only lets players who already
        // acted call or fold.
        if (full) h.canRaise[p] = true;
        else if (h.acted[p]) h.canRaise[p] = false;
        h.acted[p] = false;
      }
      if (full) h.minRaise = raiseBy;
      h.currentBet = to;
      break;
    }
    default:
      throw new GameError('bad_action');
  }
  h.acted[seat] = true;
  afterAction(t, h, seat, now);
}

export function timeout(t, h, now) {
  if (h.runout) {
    dealStreet(h);
    if (h.board.length >= 5) return finish(t, h, now);
    h.deadline = now + RUNOUT_MS;
    return;
  }
  if (h.phase !== 'play' || h.turn == null) return;
  const seat = h.turn;
  const toCall = h.currentBet - h.bet[seat];
  return act(t, h, seat, { t: toCall > 0 ? 'fold' : 'check' }, now);
}

export function botDue(t, h) {
  if (h.phase !== 'play' || h.runout || h.turn == null) return -1;
  return t.seats[h.turn]?.bot ? h.turn : -1;
}

/** A simple, readable bot: strength from hole cards / made hand, pot odds, some randomness. */
export function botAct(t, h, seat, now) {
  const o = t.opts.game;
  const stack = t.seats[seat].chips;
  const toCall = h.currentBet - h.bet[seat];
  const pot = h.contrib.reduce((s, x) => s + x, 0);
  let strength;
  if (h.board.length === 0) strength = preflopStrength(h.hole[seat][0], h.hole[seat][1]);
  else {
    const cat = bestHand([...h.hole[seat], ...h.board]).score / 15 ** 5;
    strength = Math.min(1, 0.25 + Math.floor(cat) * 0.17 + (cat % 1) * 0.1);
  }
  const pz = personaOf(t, seat);
  strength += (Math.random() - 0.5) * 0.15;
  // A bluffer sometimes plays a weak hand as if it were strong.
  if (Math.random() < pz.hdBluff) strength = Math.max(strength, pz.hdRaise + 0.02);
  const odds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const raiseTo = (mult) => {
    const target = Math.max(h.currentBet + h.minRaise, h.currentBet + Math.round((pot * mult) / o.bigBlind) * o.bigBlind);
    return Math.min(target, h.bet[seat] + stack);
  };
  if (strength > pz.hdRaise && h.canRaise[seat] && stack > toCall) {
    const to = raiseTo(strength > 0.9 ? 1 : 0.6);
    return act(t, h, seat, to >= h.bet[seat] + stack ? { t: 'allin' } : { t: 'raise', amount: to }, now);
  }
  if (toCall === 0) return act(t, h, seat, { t: 'check' }, now);
  if (strength >= odds + pz.hdCall || toCall <= o.bigBlind) return act(t, h, seat, { t: 'call' }, now);
  return act(t, h, seat, { t: 'fold' }, now);
}

export function view(t, h, viewer) {
  const done = h.phase === 'done';
  const reveal = (p) => p === viewer || (h.players.includes(p) && !h.folded[p] && ((done && h.showdown) || h.runout));
  const resultBy = Object.fromEntries((h.result?.rows ?? []).map((r) => [r.seat, r]));
  const seats = t.seats.map((_, i) => {
    if (!h.players.includes(i)) return null;
    return {
      cards: reveal(i) && h.hole[i] ? h.hole[i].slice() : null,
      count: h.hole[i] ? 2 : 0,
      bet: h.bet[i],
      contrib: h.contrib[i],
      folded: h.folded[i],
      allIn: h.allIn[i],
      last: h.lastAction[i],
      result: done ? resultBy[i] ?? null : null,
    };
  });
  const pot = h.contrib.reduce((s, x) => s + x, 0);
  const v = {
    game: 'holdem',
    phase: h.phase,
    street: h.street,
    board: h.board.slice(),
    button: h.button,
    sb: h.sb,
    bb: h.bb,
    turn: h.turn,
    deadline: h.deadline,
    runout: h.runout,
    showdown: !!h.showdown,
    nextAt: h.nextAt ?? null,
    pot,
    pots: done && h.pots ? h.pots.map((p) => ({ amount: p.amount, winners: p.winners })) : null,
    currentBet: h.currentBet,
    seats,
    actions: null,
  };
  if (viewer >= 0 && h.turn === viewer && !done && !h.runout) {
    const stack = t.seats[viewer].chips;
    const toCall = Math.min(h.currentBet - h.bet[viewer], stack);
    const maxTo = h.bet[viewer] + stack;
    const minTo = Math.min(h.currentBet + h.minRaise, maxTo);
    v.actions = {
      fold: true,
      check: toCall <= 0,
      call: toCall > 0 ? toCall : 0,
      raise: h.canRaise[viewer] && maxTo > h.currentBet ? { min: minTo, max: maxTo, bet: h.currentBet === 0 } : null,
      allin: stack > 0,
      bigBlind: t.opts.game.bigBlind,
      pot,
      myBet: h.bet[viewer],
    };
  }
  return v;
}

export function summary(t, h) {
  if (!h.result) return null;
  const nick = (i) => t.seats[i]?.nick ?? '?';
  return h.result.rows.map((r) => ({
    nick: nick(r.seat),
    role: r.won > 0 ? 'winner' : h.folded[r.seat] ? 'folded' : 'player',
    cards: h.showdown && !h.folded[r.seat] ? h.hole[r.seat].slice() : [],
    kind: r.category ?? (h.folded[r.seat] ? 'fold' : ''),
    total: 0,
    bet: h.contrib[r.seat],
    delta: r.delta,
    board: h.board.slice(),
  }));
}
