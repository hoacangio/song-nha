// Xì dách table engine (server side). Mutates the plain-object table/hand state it is given;
// the table core persists and broadcasts. Pure rules live in public/js/domain/xidach.js.
import {
  XIDACH_DEFAULTS,
  handTotal,
  instantKind,
  classify,
  compareHands,
  settleDelta,
  canHit,
  canStand,
} from '../../../public/js/domain/xidach.js';
import { isChipAmount, isSeatIndex } from '../../lib/protocol.js';
import { personaOf } from '../personas.js';
import { GameError, clampInt, pick } from '../common.js';

export const meta = Object.freeze({ id: 'xidach', minSeats: 2, maxSeats: 8 });

export function sanitizeOptions(raw = {}) {
  const d = XIDACH_DEFAULTS;
  const o = {
    dealerMode: pick(raw.dealerMode, ['rotate', 'host'], d.dealerMode),
    minBet: clampInt(raw.minBet, 1, 100_000, d.minBet),
    maxBet: clampInt(raw.maxBet, 1, 1_000_000, d.maxBet),
    playerMin: clampInt(raw.playerMin, 14, 18, d.playerMin),
    dealerMin: clampInt(raw.dealerMin, 14, 18, d.dealerMin),
    aceRule: pick(raw.aceRule, ['flex', 'classic'], d.aceRule),
    bothBustPush: typeof raw.bothBustPush === 'boolean' ? raw.bothBustPush : d.bothBustPush,
    payouts: {},
  };
  if (o.maxBet < o.minBet) o.maxBet = o.minBet;
  const p = raw.payouts && typeof raw.payouts === 'object' ? raw.payouts : {};
  for (const k of ['normal', 'xidach', 'xibang', 'ngulinh']) o.payouts[k] = clampInt(p[k], 1, 10, d.payouts[k]);
  return o;
}

const activeSeat = (t, i) => {
  const s = t.seats[i];
  return s && !s.leaving && !s.away;
};

function chooseDealer(t, o) {
  const n = t.seats.length;
  if (o.dealerMode === 'host') {
    const hi = t.seats.findIndex((s) => s && s.pid === t.hostPid);
    if (hi >= 0 && activeSeat(t, hi)) return hi;
  }
  const from = Number.isInteger(t.lastDealer) ? t.lastDealer : -1;
  for (let k = 1; k <= n; k++) {
    const i = (from + k + n) % n;
    if (activeSeat(t, i)) return i;
  }
  return -1;
}

function eligiblePlayers(t, o, dealer) {
  const n = t.seats.length;
  const out = [];
  for (let k = 1; k < n; k++) {
    const i = (dealer + k) % n;
    if (activeSeat(t, i) && t.seats[i].chips >= o.minBet) out.push(i);
  }
  return out;
}

export function canStart(t) {
  const o = t.opts.game;
  const dealer = chooseDealer(t, o);
  return dealer >= 0 && eligiblePlayers(t, o, dealer).length >= 1;
}

export function startHand(t, deck, now) {
  const o = t.opts.game;
  const dealer = chooseDealer(t, o);
  const players = eligiblePlayers(t, o, dealer);
  if (dealer < 0 || !players.length) throw new GameError('cannot_start');
  t.lastDealer = dealer;
  const n = t.seats.length;
  return {
    game: 'xidach',
    phase: 'bet',
    dealer,
    players,
    bets: Array(n).fill(null),
    cards: Array(n).fill(null),
    done: Array(n).fill(false),
    shown: Array(n).fill(false),
    settled: Array(n).fill(null),
    turn: null,
    deck,
    deadline: now + t.opts.turnSeconds * 1000,
    startedAt: now,
  };
}

/** True while this seat is part of an unfinished hand (cannot leave the table yet). */
export function involved(h, seat) {
  if (!h || h.phase === 'done') return false;
  return h.dealer === seat || h.players.includes(seat);
}

function draw(h) {
  const c = h.deck.pop();
  if (!c) throw new GameError('deck_empty');
  return c;
}

function deal(t, h, now) {
  h.players = h.players.filter((p) => h.bets[p] != null);
  if (!h.players.length) return finish(t, h, now, { noBets: true });
  for (const p of [...h.players, h.dealer]) h.cards[p] = [];
  for (let r = 0; r < 2; r++) for (const p of [...h.players, h.dealer]) h.cards[p].push(draw(h));
  h.phase = 'play';
  if (instantKind(h.cards[h.dealer])) {
    for (const p of h.players) settle(t, h, p);
    return finish(t, h, now);
  }
  for (const p of h.players) {
    if (instantKind(h.cards[p])) {
      h.done[p] = true;
      settle(t, h, p);
    }
  }
  advance(t, h, now);
}

function advance(t, h, now) {
  const next = h.players.find((p) => !h.done[p]);
  if (next != null) {
    h.turn = next;
    h.deadline = now + t.opts.turnSeconds * 1000;
    return;
  }
  if (h.players.every((p) => h.settled[p])) return finish(t, h, now);
  h.phase = 'dealer';
  h.turn = h.dealer;
  h.deadline = now + t.opts.turnSeconds * 2000;
}

function classifyFor(t, h, seat) {
  const o = t.opts.game;
  const minAge = seat === h.dealer ? o.dealerMin : o.playerMin;
  return classify(h.cards[seat], { aceRule: o.aceRule, minAge });
}

function settle(t, h, p) {
  if (h.settled[p]) return;
  const o = t.opts.game;
  const pc = classifyFor(t, h, p);
  const dc = classifyFor(t, h, h.dealer);
  const r = compareHands(pc, dc, o);
  let delta = settleDelta(h.bets[p], r);
  const ps = t.seats[p];
  const ds = t.seats[h.dealer];
  if (delta < 0) delta = -Math.min(-delta, Math.max(0, ps.chips));
  ps.chips += delta;
  ds.chips -= delta;
  h.settled[p] = { outcome: r.outcome, mult: r.mult, delta, kind: pc.kind, total: pc.total };
  h.shown[p] = true;
  if (instantKind(h.cards[h.dealer]) || h.phase === 'dealer') h.shown[h.dealer] = true;
}

function finish(t, h, now, { noBets = false } = {}) {
  for (const p of h.players) settle(t, h, p);
  h.phase = 'done';
  h.turn = null;
  h.deadline = null;
  h.noBets = noBets;
  h.autoNext = !noBets;
  h.nextAt = noBets ? null : now + 7000;
  h.shown = h.shown.map((v, i) => v || !!h.cards[i]);
  h.dealerResult = h.cards[h.dealer] ? classifyFor(t, h, h.dealer) : null;
}

function dealerFinished(t, h) {
  const c = h.cards[h.dealer];
  return c.length >= 5 || handTotal(c, t.opts.game.aceRule) > 21;
}

function dealerCanCheck(t, h) {
  const c = h.cards[h.dealer];
  return handTotal(c, t.opts.game.aceRule) >= t.opts.game.dealerMin || dealerFinished(t, h);
}

export function act(t, h, seat, msg, now) {
  const o = t.opts.game;
  switch (msg.t) {
    case 'bet': {
      if (h.phase !== 'bet') throw new GameError('wrong_phase');
      if (!h.players.includes(seat)) throw new GameError('not_in_hand');
      if (h.bets[seat] != null) throw new GameError('already_bet');
      const max = Math.min(o.maxBet, t.seats[seat].chips);
      if (!isChipAmount(msg.amount, { min: o.minBet, max })) throw new GameError('bad_amount');
      h.bets[seat] = msg.amount;
      if (h.players.every((p) => h.bets[p] != null)) deal(t, h, now);
      return;
    }
    case 'hit': {
      if (h.phase === 'play') {
        if (h.turn !== seat) throw new GameError('not_your_turn');
        if (!canHit(h.cards[seat], o.aceRule)) throw new GameError('cannot_hit');
        h.cards[seat].push(draw(h));
        if (!canHit(h.cards[seat], o.aceRule)) {
          h.done[seat] = true;
          advance(t, h, now);
        } else h.deadline = now + t.opts.turnSeconds * 1000;
        return;
      }
      if (h.phase === 'dealer') {
        if (h.dealer !== seat) throw new GameError('not_your_turn');
        if (!canHit(h.cards[seat], o.aceRule)) throw new GameError('cannot_hit');
        h.cards[seat].push(draw(h));
        if (dealerFinished(t, h)) return finish(t, h, now);
        h.deadline = now + t.opts.turnSeconds * 2000;
        return;
      }
      throw new GameError('wrong_phase');
    }
    case 'stay': {
      if (h.phase !== 'play') throw new GameError('wrong_phase');
      if (h.turn !== seat) throw new GameError('not_your_turn');
      if (!canStand(h.cards[seat], o.playerMin, o.aceRule)) throw new GameError('too_young');
      h.done[seat] = true;
      advance(t, h, now);
      return;
    }
    case 'xet': {
      if (h.phase !== 'dealer' || h.dealer !== seat) throw new GameError('not_your_turn');
      if (!dealerCanCheck(t, h)) throw new GameError('too_young');
      if (!isSeatIndex(msg.seat, t.seats.length) || !h.players.includes(msg.seat) || h.settled[msg.seat]) {
        throw new GameError('bad_target');
      }
      settle(t, h, msg.seat);
      if (h.players.every((p) => h.settled[p])) finish(t, h, now);
      else h.deadline = now + t.opts.turnSeconds * 2000;
      return;
    }
    case 'xetAll': {
      if (h.phase !== 'dealer' || h.dealer !== seat) throw new GameError('not_your_turn');
      if (!dealerCanCheck(t, h)) throw new GameError('too_young');
      finish(t, h, now);
      return;
    }
    default:
      throw new GameError('bad_action');
  }
}

/** Turn timer expired: auto-stand / sit out / dealer auto-play. */
export function timeout(t, h, now) {
  const o = t.opts.game;
  if (h.phase === 'bet') return deal(t, h, now);
  if (h.phase === 'play') {
    h.done[h.turn] = true;
    return advance(t, h, now);
  }
  if (h.phase === 'dealer') {
    const c = h.cards[h.dealer];
    while (handTotal(c, o.aceRule) < o.dealerMin && canHit(c, o.aceRule)) c.push(draw(h));
    return finish(t, h, now);
  }
}

/** Seat of a bot that must act now, or -1. */
export function botDue(t, h) {
  const isBot = (i) => !!t.seats[i]?.bot;
  if (h.phase === 'bet') return h.players.find((p) => h.bets[p] == null && isBot(p)) ?? -1;
  if ((h.phase === 'play' || h.phase === 'dealer') && h.turn != null && isBot(h.turn)) return h.turn;
  return -1;
}

export function botAct(t, h, seat, now) {
  const o = t.opts.game;
  const pz = personaOf(t, seat);
  if (h.phase === 'bet') {
    const want = Math.min(o.maxBet ?? Infinity, o.minBet * pz.xdBet);
    return act(t, h, seat, { t: 'bet', amount: Math.max(1, Math.min(want, t.seats[seat].chips)) }, now);
  }
  const c = h.cards[seat];
  const total = handTotal(c, o.aceRule);
  if (h.phase === 'play') {
    return act(t, h, seat, { t: canHit(c, o.aceRule) && total < Math.max(pz.xdStand, o.playerMin) ? 'hit' : 'stay' }, now);
  }
  if (h.phase === 'dealer') {
    if (canHit(c, o.aceRule) && total < Math.max(16, o.dealerMin)) return act(t, h, seat, { t: 'hit' }, now);
    return act(t, h, seat, { t: 'xetAll' }, now);
  }
}

/** What `viewer` (seat index, or -1 for spectators) is allowed to see. */
export function view(t, h, viewer) {
  const o = t.opts.game;
  const seats = h.cards.map((cards, i) => {
    if (!cards && h.bets[i] == null && !h.players.includes(i) && i !== h.dealer) return null;
    const visible = cards && (i === viewer || h.shown[i]);
    return {
      cards: visible ? cards.slice() : null,
      count: cards ? cards.length : 0,
      bet: h.bets[i],
      done: h.done[i],
      settled: h.settled[i],
      result: visible && cards ? classifyFor(t, h, i) : null,
    };
  });
  const v = {
    game: 'xidach',
    phase: h.phase,
    dealer: h.dealer,
    players: h.players.slice(),
    turn: h.turn,
    deadline: h.deadline,
    nextAt: h.nextAt ?? null,
    noBets: !!h.noBets,
    seats,
    actions: null,
  };
  if (viewer < 0) return v;
  const c = h.cards[viewer];
  if (h.phase === 'bet' && h.players.includes(viewer) && h.bets[viewer] == null) {
    v.actions = { bet: { min: o.minBet, max: Math.min(o.maxBet, t.seats[viewer].chips) } };
  } else if (h.phase === 'play' && h.turn === viewer) {
    v.actions = { hit: canHit(c, o.aceRule), stay: canStand(c, o.playerMin, o.aceRule) };
  } else if (h.phase === 'dealer' && h.dealer === viewer) {
    const can = dealerCanCheck(t, h);
    v.actions = {
      hit: canHit(c, o.aceRule),
      xet: can,
      targets: h.players.filter((p) => !h.settled[p]),
    };
  }
  return v;
}

export function summary(t, h) {
  if (h.noBets) return null;
  const nick = (i) => t.seats[i]?.nick ?? '?';
  const rows = h.players.map((p) => ({
    nick: nick(p),
    role: 'player',
    cards: h.cards[p] || [],
    kind: h.settled[p]?.kind ?? '',
    total: h.settled[p]?.total ?? 0,
    bet: h.bets[p],
    delta: h.settled[p]?.delta ?? 0,
  }));
  const dr = h.dealerResult || {};
  rows.unshift({
    nick: nick(h.dealer),
    role: 'dealer',
    cards: h.cards[h.dealer] || [],
    kind: dr.kind ?? '',
    total: dr.total ?? 0,
    bet: null,
    delta: -rows.reduce((s, r) => s + r.delta, 0),
  });
  return rows;
}
