// Tichu table engine (server side). Pure rules: public/js/domain/tichu.js.
//
// Four players, partners sit opposite (players[0]&[2] vs players[1]&[3]). A hand:
//   grand    — 8 cards each; everyone decides on Grand Tichu (+/−200) before seeing the rest
//   exchange — 14 cards; everyone gives one card to each other player (and may call Tichu, +/−100)
//   play     — the Mah Jong holder leads; tricks as in the rules; bombs may be played out of turn
//   dragon   — whoever won a trick with the Dragon picks an opponent to receive it
//   done     — scored: card points + calls, or 200 for a double victory; chips settle per hand,
//              the match score runs to `target` across hands.
import {
  TICHU_DECK,
  TICHU_DEFAULTS,
  MJ,
  DG,
  DR,
  detectCombo,
  canBeat,
  isBomb,
  isTichuCardList,
  isSpecial,
  val,
  pointsOf,
  sortTichu,
  wishPlays,
  botGrand,
  botTichu,
  botExchange,
  botPlay,
  botDragonTarget,
  RANKS,
} from '../../../public/js/domain/tichu.js';
import { personaOf, PERSONAS } from '../personas.js';
import { GameError, clampInt } from '../common.js';

export const meta = Object.freeze({ id: 'tichu', minSeats: 4, maxSeats: 4, deck: TICHU_DECK });

export function sanitizeOptions(raw = {}) {
  const d = TICHU_DEFAULTS;
  return {
    target: clampInt(raw.target, 200, 2000, d.target),
    unit: clampInt(raw.unit, 1, 1000, d.unit),
    tichuBonus: clampInt(raw.tichuBonus, 0, 500, d.tichuBonus),
    grandBonus: clampInt(raw.grandBonus, 0, 1000, d.grandBonus),
    doubleWin: clampInt(raw.doubleWin, 0, 1000, d.doubleWin),
  };
}

const activeSeat = (t, i) => {
  const s = t.seats[i];
  return s && !s.leaving && !s.away && s.chips > 0;
};

export function canStart(t) {
  return t.seats.length === 4 && t.seats.every((_, i) => activeSeat(t, i));
}

const err = (code) => {
  throw new GameError(code);
};

// seat helpers (positions inside h.players)
const pos = (h, seat) => h.players.indexOf(seat);
const at = (h, k) => h.players[(k + 4) % 4];
export const partnerOf = (h, seat) => at(h, pos(h, seat) + 2);
export const teamOf = (h, seat) => pos(h, seat) % 2;
const opponentsOf = (h, seat) => [at(h, pos(h, seat) + 1), at(h, pos(h, seat) + 3)];

function matchKey(t, players) {
  return players.map((p) => t.seats[p].pid).join('|');
}

export function startHand(t, deck, now) {
  if (!canStart(t)) throw new GameError('cannot_start');
  const players = [0, 1, 2, 3];
  const hands = Array(4).fill(null).map(() => []);
  for (let r = 0; r < 14; r++) for (const p of players) hands[p].push(deck.pop());
  // Match score survives between hands while the same four players sit in the same places.
  const key = matchKey(t, players);
  if (!t.tichuMatch || t.tichuMatch.key !== key || t.tichuMatch.over != null) t.tichuMatch = { key, score: [0, 0], hands: 0, over: null };
  return {
    game: 'tichu',
    phase: 'grand',
    players,
    full: hands.map((x) => sortTichu(x)), // all 14 (the last 6 stay hidden until Grand Tichu is decided)
    hands: hands.map((x) => sortTichu(x.slice(0, 8))),
    grand: Array(4).fill(null), // true / false once decided
    calls: Array(4).fill(null), // 'grand' | 'tichu'
    give: Array(4).fill(null), // [toNext, toPartner, toPrev]
    received: Array(4).fill(null), // [{ from, card }]
    playedAny: Array(4).fill(false),
    out: [], // seats in the order they went out
    passed: Array(4).fill(false),
    trick: null, // { seat, cards, combo }
    trickCards: [], // every card played in the current trick
    won: Array(4).fill(null).map(() => []), // captured cards
    wish: null, // wished value 2..14 (from the Mah Jong) until fulfilled
    dragon: null, // { winner, cards } waiting for giveDragon
    lastBomb: null,
    turn: null,
    lead: null,
    deadline: now + t.opts.turnSeconds * 1000,
    deck,
    startedAt: now,
    result: null,
  };
}

export function involved(h, seat) {
  return !!h && h.phase !== 'done' && h.players.includes(seat);
}

const hasCards = (h, p) => h.hands[p].length > 0;

function nextWhere(h, from, pred) {
  for (let k = 1; k <= 4; k++) {
    const p = at(h, pos(h, from) + k);
    if (pred(p)) return p;
  }
  return -1;
}

// ---------- grand tichu / exchange ----------

function decideGrand(t, h, seat, call, now) {
  if (h.phase !== 'grand') err('wrong_phase');
  if (h.grand[seat] !== null) err('already_decided');
  if (typeof call !== 'boolean') err('bad_options');
  h.grand[seat] = call;
  if (call) h.calls[seat] = 'grand';
  if (h.grand.every((x) => x !== null)) {
    h.hands = h.full.map((x) => x.slice());
    h.phase = 'exchange';
    h.deadline = now + t.opts.turnSeconds * 2000;
  }
}

function callTichu(h, seat) {
  if (!['exchange', 'play', 'dragon'].includes(h.phase)) err('wrong_phase');
  if (h.calls[seat]) err('already_called');
  if (h.playedAny[seat]) err('too_late');
  h.calls[seat] = 'tichu';
}

function giveCards(t, h, seat, cards, now) {
  if (h.phase !== 'exchange') err('wrong_phase');
  if (h.give[seat]) err('already_given');
  if (!isTichuCardList(cards, 3) || cards.length !== 3) err('bad_cards');
  if (!cards.every((c) => h.hands[seat].includes(c))) err('not_your_cards');
  h.give[seat] = cards.slice();
  if (h.give.every(Boolean)) doExchange(t, h, now);
}

function doExchange(t, h, now) {
  const incoming = Array(4).fill(null).map(() => []);
  for (const p of h.players) {
    const [toNext, toPartner, toPrev] = h.give[p];
    incoming[at(h, pos(h, p) + 1)].push({ from: p, card: toNext });
    incoming[partnerOf(h, p)].push({ from: p, card: toPartner });
    incoming[at(h, pos(h, p) + 3)].push({ from: p, card: toPrev });
  }
  for (const p of h.players) {
    h.hands[p] = sortTichu([...h.hands[p].filter((c) => !h.give[p].includes(c)), ...incoming[p].map((x) => x.card)]);
    h.received[p] = incoming[p];
  }
  h.phase = 'play';
  h.lead = h.players.find((p) => h.hands[p].includes(MJ));
  h.turn = h.lead;
  h.deadline = now + t.opts.turnSeconds * 1000;
}

// ---------- play ----------

function play(t, h, seat, cards, wish, now) {
  if (h.phase !== 'play') err('wrong_phase');
  if (!isTichuCardList(cards, 14) || !cards.length) err('bad_cards');
  const hand = h.hands[seat];
  if (!cards.every((c) => hand.includes(c))) err('not_your_cards');
  const prev = h.trick?.combo ?? null;
  const combo = detectCombo(cards, prev);
  if (!combo) err('bad_combo');
  const inTurn = h.turn === seat;
  if (!inTurn) {
    // Out of turn: only a bomb, only on top of a trick.
    if (!isBomb(combo) || !prev) err('not_your_turn');
  }
  if (combo.type === 'dog' && (prev || !inTurn)) err('cannot_beat');
  if (!canBeat(prev, combo)) err('cannot_beat');
  // The wish: if you can fulfil it with a normal play, you must.
  if (h.wish && inTurn && !cards.some((c) => !isSpecial(c) && val(c) === h.wish) && !isBomb(combo)) {
    if (wishPlays(hand, prev, h.wish).length) err('must_wish');
  }
  if (wish != null) {
    if (!cards.includes(MJ)) err('bad_wish');
    if (typeof wish !== 'number' || !Number.isInteger(wish) || wish < 2 || wish > 14) err('bad_wish');
  }

  h.hands[seat] = hand.filter((c) => !cards.includes(c));
  h.playedAny[seat] = true;
  if (cards.includes(MJ) && wish != null) h.wish = wish;
  if (h.wish && cards.some((c) => !isSpecial(c) && val(c) === h.wish)) h.wish = null;
  h.lastBomb = isBomb(combo) ? seat : null;

  if (combo.type === 'dog') {
    // The Dog: the lead goes straight to the partner (or the next player still holding cards).
    h.won[seat].push(...cards);
    h.trick = null;
    h.trickCards = [];
    h.passed.fill(false);
    h.dogTo = null;
    if (!hasCards(h, seat)) goOut(h, seat);
    if (handOver(h)) return finish(t, h, now);
    const partner = partnerOf(h, seat);
    h.lead = hasCards(h, partner) ? partner : nextWhere(h, partner, (p) => hasCards(h, p));
    h.turn = h.lead;
    h.dogTo = h.lead;
    h.deadline = now + t.opts.turnSeconds * 1000;
    return;
  }
  h.dogTo = null;
  h.trick = { seat, cards: sortTichu(cards), combo };
  h.trickCards.push(...cards);
  h.passed.fill(false);
  if (!hasCards(h, seat)) goOut(h, seat);
  if (handOver(h)) return finish(t, h, now);
  advance(t, h, seat, now);
}

function goOut(h, seat) {
  if (!h.out.includes(seat)) h.out.push(seat);
}

/** The hand ends when three players are out, or partners go out first and second. */
function handOver(h) {
  if (h.out.length >= 3) return true;
  return h.out.length === 2 && partnerOf(h, h.out[0]) === h.out[1];
}

function advance(t, h, from, now) {
  const canAnswer = (p) => hasCards(h, p) && !h.passed[p] && p !== h.trick.seat;
  if (!h.players.some(canAnswer)) return endTrick(t, h, now);
  h.turn = nextWhere(h, from, canAnswer);
  h.deadline = now + t.opts.turnSeconds * 1000;
}

function pass(t, h, seat, now) {
  if (h.phase !== 'play') err('wrong_phase');
  if (h.turn !== seat) err('not_your_turn');
  if (!h.trick) err('must_lead');
  if (h.wish && wishPlays(h.hands[seat], h.trick.combo, h.wish).length) err('must_wish');
  h.passed[seat] = true;
  advance(t, h, seat, now);
}

function endTrick(t, h, now) {
  const winner = h.trick.seat;
  const cards = h.trickCards;
  h.passed.fill(false);
  if (h.trick.combo.dragon) {
    h.phase = 'dragon';
    h.dragon = { winner, cards };
    h.turn = winner;
    h.trick = null;
    h.trickCards = [];
    h.deadline = now + t.opts.turnSeconds * 1000;
    return;
  }
  h.won[winner].push(...cards);
  newLead(t, h, winner, now);
}

function newLead(t, h, winner, now) {
  h.trick = null;
  h.trickCards = [];
  h.lead = hasCards(h, winner) ? winner : nextWhere(h, winner, (p) => hasCards(h, p));
  h.turn = h.lead;
  h.deadline = now + t.opts.turnSeconds * 1000;
}

function giveDragon(t, h, seat, to, now) {
  if (h.phase !== 'dragon') err('wrong_phase');
  if (h.dragon.winner !== seat) err('not_your_turn');
  if (!opponentsOf(h, seat).includes(to)) err('bad_target');
  h.won[to].push(...h.dragon.cards);
  h.dragonGiven = { from: seat, to };
  const winner = h.dragon.winner;
  h.dragon = null;
  h.phase = 'play';
  newLead(t, h, winner, now);
}

// ---------- scoring ----------

function transfer(t, from, to, chips) {
  const c = Math.min(chips, Math.max(0, t.seats[from].chips));
  t.seats[from].chips -= c;
  t.seats[to].chips += c;
  return c;
}

function finish(t, h, now) {
  const o = t.opts.game;
  // Cards still on the table go to whoever played last (a Dragon there goes to an opponent).
  if (h.trickCards.length) {
    const w = h.trick.seat;
    const to = h.trick.combo.dragon ? botDragonTarget(opponentsOf(h, w), h.hands.map((x) => x.length)) : w;
    h.won[to].push(...h.trickCards);
    h.trickCards = [];
  }
  const team = [0, 0];
  const first = h.out[0];
  const double = h.out.length === 2 && partnerOf(h, first) === h.out[1];
  if (double) {
    team[teamOf(h, first)] += o.doubleWin;
  } else {
    const last = h.players.find((p) => hasCards(h, p));
    for (const p of h.players) {
      if (p === last) continue;
      team[teamOf(h, p)] += pointsOf(h.won[p]);
    }
    if (last != null) {
      team[1 - teamOf(h, last)] += pointsOf(h.hands[last]); // the loser's hand goes to the opponents
      team[teamOf(h, first)] += pointsOf(h.won[last]); // the loser's tricks go to the first player out
    }
  }
  const calls = [];
  for (const p of h.players) {
    const c = h.calls[p];
    if (!c) continue;
    const bonus = c === 'grand' ? o.grandBonus : o.tichuBonus;
    const ok = first === p;
    team[teamOf(h, p)] += ok ? bonus : -bonus;
    calls.push({ seat: p, call: c, ok, points: ok ? bonus : -bonus });
  }
  // Chips: each player of the team behind pays one opponent (the one after them) diff/10 × unit.
  const diff = team[0] - team[1];
  const delta = Array(4).fill(0);
  if (diff) {
    const loseTeam = diff > 0 ? 1 : 0;
    const chips = Math.round((Math.abs(diff) / 10) * o.unit);
    for (const p of h.players) {
      if (teamOf(h, p) !== loseTeam) continue;
      const to = at(h, pos(h, p) + 1);
      const paid = transfer(t, p, to, chips);
      delta[p] -= paid;
      delta[to] += paid;
    }
  }
  const m = t.tichuMatch;
  m.score[0] += team[0];
  m.score[1] += team[1];
  m.hands += 1;
  if ((m.score[0] >= o.target || m.score[1] >= o.target) && m.score[0] !== m.score[1]) m.over = m.score[0] > m.score[1] ? 0 : 1;
  h.phase = 'done';
  h.turn = null;
  h.deadline = null;
  h.result = { team, double, out: h.out.slice(), calls, delta, match: { score: m.score.slice(), target: o.target, over: m.over, hands: m.hands } };
  h.autoNext = true;
  h.nextAt = now + 12000;
}

// ---------- dispatch, timers, bots ----------

export function act(t, h, seat, msg, now) {
  switch (msg.t) {
    case 'grand':
      return decideGrand(t, h, seat, msg.call, now);
    case 'tichu':
      return callTichu(h, seat);
    case 'exchange':
      return giveCards(t, h, seat, msg.cards, now);
    case 'play':
      return play(t, h, seat, msg.cards, msg.wish ?? null, now);
    case 'pass':
      return pass(t, h, seat, now);
    case 'giveDragon':
      if (typeof msg.seat !== 'number' || !Number.isInteger(msg.seat)) err('bad_target');
      return giveDragon(t, h, seat, msg.seat, now);
  }
  err('bad_action');
}

const counts = (h) => h.hands.map((x) => x.length);

function ctxFor(t, h, seat) {
  const partner = partnerOf(h, seat);
  const opp = opponentsOf(h, seat).filter((p) => hasCards(h, p));
  return {
    prev: h.trick?.combo ?? null,
    wish: h.wish,
    partnerOwns: h.trick?.seat === partner,
    partnerOut: !hasCards(h, partner),
    partnerCount: h.hands[partner].length,
    oppMinCount: opp.length ? Math.min(...opp.map((p) => h.hands[p].length)) : 99,
    myCount: h.hands[seat].length,
    bombAt: (t.seats[seat]?.bot ? PERSONAS[t.seats[seat].persona] ?? PERSONAS.deu : PERSONAS.deu).tcBomb,
  };
}

function autoPlay(t, h, seat, now) {
  const choice = botPlay(h.hands[seat], ctxFor(t, h, seat));
  if (choice) return play(t, h, seat, choice.cards, choice.wish ?? null, now);
  return pass(t, h, seat, now);
}

/** Time is up: undecided players skip Grand Tichu / give bot-chosen cards; the player on turn passes or leads low. */
export function timeout(t, h, now) {
  if (h.phase === 'grand') {
    for (const p of h.players) if (h.grand[p] === null) decideGrand(t, h, p, false, now);
    return;
  }
  if (h.phase === 'exchange') {
    for (const p of h.players) if (!h.give[p]) h.give[p] = botExchange(h.hands[p]);
    return doExchange(t, h, now);
  }
  if (h.phase === 'dragon') return giveDragon(t, h, h.dragon.winner, botDragonTarget(opponentsOf(h, h.dragon.winner), counts(h)), now);
  if (h.phase !== 'play') return;
  const seat = h.turn;
  if (h.trick && !(h.wish && wishPlays(h.hands[seat], h.trick.combo, h.wish).length)) return pass(t, h, seat, now);
  return autoPlay(t, h, seat, now);
}

export function botDue(t, h) {
  const bot = (p) => t.seats[p]?.bot;
  if (h.phase === 'grand') return h.players.find((p) => bot(p) && h.grand[p] === null) ?? -1;
  if (h.phase === 'exchange') return h.players.find((p) => bot(p) && !h.give[p]) ?? -1;
  if (h.phase === 'dragon') return bot(h.dragon.winner) ? h.dragon.winner : -1;
  if (h.phase === 'play' && h.turn != null && bot(h.turn)) return h.turn;
  return -1;
}

export function botAct(t, h, seat, now) {
  const pz = personaOf(t, seat);
  if (h.phase === 'grand') return decideGrand(t, h, seat, botGrand(h.hands[seat], pz.tcGrand), now);
  if (h.phase === 'exchange') {
    if (!h.calls[seat] && !h.calls[partnerOf(h, seat)] && botTichu(h.hands[seat], pz.tcTichu)) h.calls[seat] = 'tichu';
    return giveCards(t, h, seat, botExchange(h.hands[seat]), now);
  }
  if (h.phase === 'dragon') return giveDragon(t, h, seat, botDragonTarget(opponentsOf(h, seat), counts(h)), now);
  return autoPlay(t, h, seat, now);
}

/** What `viewer` (seat index, or -1 for spectators) may see. */
export function view(t, h, viewer) {
  const done = h.phase === 'done';
  const me = h.players.includes(viewer) ? viewer : -1;
  const seats = t.seats.map((_, i) => {
    if (!h.players.includes(i)) return null;
    return {
      count: h.hands[i].length,
      cards: i === me || done ? sortTichu(h.hands[i]) : null,
      call: h.calls[i],
      grandDecided: h.grand[i] !== null,
      gave: !!h.give[i],
      passed: h.passed[i],
      out: h.out.indexOf(i) + 1,
      team: teamOf(h, i),
      points: pointsOf(h.won[i]),
      tricks: h.won[i].length,
    };
  });
  const v = {
    game: 'tichu',
    phase: h.phase,
    players: h.players.slice(),
    turn: h.turn,
    lead: h.lead,
    deadline: h.deadline,
    nextAt: h.nextAt ?? null,
    trick: h.trick ? { seat: h.trick.seat, cards: h.trick.cards.slice(), combo: h.trick.combo } : null,
    wish: h.wish,
    dogTo: h.dogTo ?? null,
    dragon: h.dragon ? { winner: h.dragon.winner } : null,
    dragonGiven: h.dragonGiven ?? null,
    lastBomb: h.lastBomb,
    received: me >= 0 && h.received[me] ? h.received[me] : null,
    match: t.tichuMatch ? { score: t.tichuMatch.score.slice(), target: t.opts.game.target, over: t.tichuMatch.over } : null,
    result: done ? h.result : null,
    seats,
    actions: null,
  };
  if (me >= 0 && !done) {
    const a = {};
    if (h.phase === 'grand' && h.grand[me] === null) a.grand = true;
    if (h.phase === 'exchange' && !h.give[me]) a.exchange = true;
    if (['exchange', 'play', 'dragon'].includes(h.phase) && !h.calls[me] && !h.playedAny[me]) a.tichu = true;
    if (h.phase === 'play' && hasCards(h, me)) {
      if (h.turn === me) {
        a.play = true;
        a.pass = !!h.trick;
        a.mustWish = !!(h.wish && wishPlays(h.hands[me], h.trick?.combo ?? null, h.wish).length);
      } else if (h.trick) a.bomb = true;
    }
    if (h.phase === 'dragon' && h.dragon.winner === me) a.dragon = opponentsOf(h, me);
    if (Object.keys(a).length) v.actions = a;
  }
  return v;
}

export function summary(t, h) {
  if (!h.result) return null;
  const r = h.result;
  return h.players.map((p) => {
    const call = r.calls.find((c) => c.seat === p);
    return {
      nick: t.seats[p]?.nick ?? '?',
      role: r.out[0] === p ? 'winner' : 'player',
      cards: sortTichu(h.won[p]).slice(0, 14),
      kind: call ? `tc_${call.call}_${call.ok ? 'ok' : 'fail'}` : r.out.includes(p) ? `tc_out_${r.out.indexOf(p) + 1}` : 'tc_last',
      total: r.team[teamOf(h, p)],
      bet: null,
      delta: r.delta[p],
    };
  });
}

export { RANKS };
