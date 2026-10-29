// Table core: seats, ledger, hand lifecycle, timers and per-viewer snapshots.
// Plain data in, plain data out — the Durable Object only loads, saves, broadcasts and schedules.
import { DECK } from '../../public/js/domain/cards.js';
import { shuffle, randomHex, sha256Hex, commitment } from '../../public/js/domain/shuffle.js';
import { GAMES } from '../games/index.js';
import { randomPersona } from '../games/personas.js';
import { GameError, clampInt } from '../games/common.js';
import { isChipAmount, isSeatIndex, cleanNick } from '../lib/protocol.js';

export const SEAT_HOLD_MS = 60_000;
export const IDLE_EXPIRY_MS = 7 * 24 * 3600 * 1000;
/** A table where no hand was ever dealt is most likely junk (or abandoned): it goes much sooner. */
export const UNUSED_EXPIRY_MS = 6 * 3600 * 1000;
/** Score-board rows kept per table. Seated players are never dropped; the oldest leavers go first. */
export const LEDGER_MAX = 50;
export const BOT_DELAY_MS = 900;
export const HISTORY_MAX = 100;
export const MAX_SOCKETS = 40;

export const pidFor = async (salt, secret) => (await sha256Hex(`pid:${salt}:${secret}`)).slice(0, 16);
export const hostKeyFor = (secret) => sha256Hex(`host:${secret}`);

export function sanitizeTableOptions(gameId, raw = {}) {
  const g = GAMES[gameId];
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    turnSeconds: clampInt(r.turnSeconds, 10, 120, 30),
    startChips: clampInt(r.startChips, 100, 1_000_000, 1000),
    seats: clampInt(r.seats, g.meta.minSeats, g.meta.maxSeats, g.meta.maxSeats),
    // Host allows strangers to be sent here by "random table" (off unless the host turns it on).
    public: r.public === true,
    game: g.sanitizeOptions(r.game && typeof r.game === 'object' ? r.game : {}),
  };
}

export function createTable({ code, game, options, hostKey, now }) {
  const opts = sanitizeTableOptions(game, options);
  return {
    v: 1,
    code,
    game,
    opts,
    hostKey,
    hostPid: null,
    salt: randomHex(16),
    createdAt: now,
    lastActive: now,
    seats: Array(opts.seats).fill(null),
    ledger: {},
    hand: null,
    handNo: 0,
    lastDealer: null,
    fair: null,
    lastReveal: null,
    history: [],
    botSeq: 0,
  };
}

const engineOf = (t) => GAMES[t.game];
export const seatOf = (t, pid) => (pid ? t.seats.findIndex((s) => s && s.pid === pid) : -1);
const handActive = (t) => !!t.hand && t.hand.phase !== 'done';

function err(code) {
  throw new GameError(code);
}

function freeSeat(t, preferred) {
  if (isSeatIndex(preferred, t.seats.length) && !t.seats[preferred]) return preferred;
  return t.seats.findIndex((s) => !s);
}

function removeSeat(t, i) {
  const s = t.seats[i];
  if (!s) return;
  if (!s.bot) t.ledger[s.pid] = { ...(t.ledger[s.pid] || {}), nick: s.nick, chips: s.chips };
  t.seats[i] = null;
}

/**
 * Bounds the score board: someone rotating secrets to sit again and again would otherwise grow the
 * stored table without limit. Seated players always keep their row.
 */
export function pruneLedger(t, max = LEDGER_MAX) {
  const pids = Object.keys(t.ledger);
  if (pids.length <= max) return;
  const seated = new Set(t.seats.filter((s) => s && !s.bot).map((s) => s.pid));
  const drop = pids
    .filter((p) => !seated.has(p))
    .sort((a, b) => (t.ledger[a].at ?? 0) - (t.ledger[b].at ?? 0))
    .slice(0, pids.length - max);
  for (const p of drop) delete t.ledger[p];
}

/** Called when a socket says hello. */
export function onJoin(t, { pid, nick, isHost }) {
  if (isHost) t.hostPid = pid;
  const i = seatOf(t, pid);
  if (i >= 0) {
    t.seats[i].away = null;
    if (nick) t.seats[i].nick = nick;
  }
  if (nick && t.ledger[pid]) t.ledger[pid].nick = nick;
}

/** Called when the last socket of a player closes. */
export function onLeave(t, pid, now) {
  const i = seatOf(t, pid);
  if (i >= 0 && !t.seats[i].bot) t.seats[i].away = now;
}

async function startHand(t, now) {
  const eng = engineOf(t);
  if (!eng.canStart(t)) err('cannot_start');
  const seed = randomHex(32);
  const deck = shuffle([...(eng.meta.deck ?? DECK)]); // Tichu adds four special cards
  const commit = await commitment(seed, deck);
  t.handNo += 1;
  t.fair = { handNo: t.handNo, commit, seed, deck: deck.slice() };
  t.hand = eng.startHand(t, deck, now);
  afterChange(t, now);
}

/** Bookkeeping after any state change: hand end → history, reveal, leaving seats. */
function afterChange(t, now) {
  const h = t.hand;
  if (h && h.phase === 'done' && !h.recorded) {
    h.recorded = true;
    const rows = engineOf(t).summary(t, h);
    if (t.fair && t.fair.handNo === t.handNo) {
      t.lastReveal = { ...t.fair };
      t.fair = null;
    }
    if (rows) {
      t.history.unshift({ n: t.handNo, at: now, game: t.game, rows, commit: t.lastReveal?.commit ?? '' });
      if (t.history.length > HISTORY_MAX) t.history.length = HISTORY_MAX;
    }
    t.seats.forEach((s, i) => {
      if (s && (s.leaving || (s.away && now - s.away >= SEAT_HOLD_MS))) removeSeat(t, i);
    });
  }
  for (const s of t.seats) if (s && !s.bot) t.ledger[s.pid] = { ...(t.ledger[s.pid] || {}), nick: s.nick, chips: s.chips };
}

/**
 * Applies one validated client message. `actor` = { pid, isHost, nick }.
 * Returns { reply } for messages that answer only the sender, or { deleted: true }.
 */
export async function handle(t, actor, msg, now) {
  const eng = engineOf(t);
  const seat = seatOf(t, actor.pid);
  t.lastActive = now;
  switch (msg.t) {
    case 'sit': {
      if (seat >= 0) err('already_seated');
      const i = freeSeat(t, msg.seat);
      if (i < 0) err('table_full');
      const prev = t.ledger[actor.pid];
      const chips = prev ? prev.chips : t.opts.startChips;
      if (!prev) t.ledger[actor.pid] = { nick: actor.nick, buyIn: t.opts.startChips, chips };
      t.ledger[actor.pid].at = now;
      t.seats[i] = { pid: actor.pid, nick: actor.nick, chips, bot: false, away: null, leaving: false };
      pruneLedger(t);
      break;
    }
    case 'stand': {
      if (seat < 0) err('not_seated');
      if (handActive(t) && eng.involved(t.hand, seat)) t.seats[seat].leaving = true;
      else removeSeat(t, seat);
      break;
    }
    case 'start': {
      if (!actor.isHost) err('host_only');
      if (handActive(t)) err('hand_running');
      await startHand(t, now);
      return {};
    }
    case 'addBot': {
      if (!actor.isHost) err('host_only');
      const i = freeSeat(t);
      if (i < 0) err('table_full');
      t.botSeq += 1;
      t.seats[i] = {
        pid: `bot-${t.botSeq}`,
        nick: `Bot ${t.botSeq}`,
        chips: t.opts.startChips,
        bot: true,
        persona: randomPersona(),
        away: null,
        leaving: false,
      };
      break;
    }
    case 'removeBot':
    case 'kick': {
      if (!actor.isHost) err('host_only');
      if (!isSeatIndex(msg.seat, t.seats.length) || !t.seats[msg.seat]) err('bad_target');
      const s = t.seats[msg.seat];
      if (msg.t === 'removeBot' && !s.bot) err('bad_target');
      if (s.pid === actor.pid) err('bad_target');
      if (handActive(t) && eng.involved(t.hand, msg.seat)) s.leaving = true;
      else removeSeat(t, msg.seat);
      break;
    }
    case 'rebuy': {
      if (!actor.isHost) err('host_only');
      if (!isChipAmount(msg.amount, { min: 1, max: 1_000_000 })) err('bad_amount');
      for (const s of t.seats) {
        if (!s) continue;
        s.chips += msg.amount;
        if (!s.bot) {
          const l = (t.ledger[s.pid] ||= { nick: s.nick, buyIn: 0, chips: 0 });
          l.buyIn = (l.buyIn || 0) + msg.amount;
        }
      }
      break;
    }
    case 'settings': {
      if (!actor.isHost) err('host_only');
      if (handActive(t)) err('hand_running');
      if (!msg.options || typeof msg.options !== 'object' || Array.isArray(msg.options)) err('bad_options');
      const merged = {
        turnSeconds: msg.options.turnSeconds ?? t.opts.turnSeconds,
        startChips: msg.options.startChips ?? t.opts.startChips,
        seats: t.opts.seats,
        public: t.opts.public,
        game: { ...t.opts.game, ...(msg.options.game && typeof msg.options.game === 'object' ? msg.options.game : {}) },
      };
      t.opts = sanitizeTableOptions(t.game, merged);
      break;
    }
    case 'setPublic': {
      if (!actor.isHost) err('host_only');
      if (typeof msg.on !== 'boolean') err('bad_options');
      t.opts = { ...t.opts, public: msg.on };
      break;
    }
    case 'history':
      return { reply: { t: 'history', items: t.history } };
    case 'deleteTable':
      if (!actor.isHost) err('host_only');
      return { deleted: true };
    default: {
      if (!handActive(t)) err('no_hand');
      if (seat < 0) err('not_seated');
      eng.act(t, t.hand, seat, msg, now);
    }
  }
  afterChange(t, now);
  return {};
}

/**
 * Is a person at the table right now (seated, not a bot, not disconnected)? Without one, no new hand is
 * dealt automatically: bots never play on their own, which would burn storage writes all day.
 * The pending next hand starts as soon as someone comes back (onJoin persists → the alarm fires).
 */
export const humanPresent = (t) => t.seats.some((s) => s && !s.bot && !s.away);

/** Runs due timers: turn timeouts, bot moves, seat holds, auto next hand. Returns true if state changed. */
export async function tick(t, now) {
  const eng = engineOf(t);
  let changed = false;
  for (let guard = 0; guard < 50; guard++) {
    const h = t.hand;
    if (h && h.phase !== 'done') {
      const bot = eng.botDue(t, h);
      if (bot >= 0) {
        h.botAt ??= now + BOT_DELAY_MS;
        if (now >= h.botAt) {
          h.botAt = null;
          eng.botAct(t, h, bot, now);
          afterChange(t, now);
          changed = true;
          continue;
        }
      } else h.botAt = null;
      if (h.deadline && now >= h.deadline) {
        eng.timeout(t, h, now);
        afterChange(t, now);
        changed = true;
        continue;
      }
    } else if (h && h.phase === 'done' && h.nextAt && now >= h.nextAt && humanPresent(t)) {
      h.nextAt = null;
      changed = true;
      if (eng.canStart(t)) {
        await startHand(t, now);
        continue;
      }
    }
    break;
  }
  t.seats.forEach((s, i) => {
    if (s && s.away && now - s.away >= SEAT_HOLD_MS && !(handActive(t) && eng.involved(t.hand, i))) {
      removeSeat(t, i);
      changed = true;
    }
  });
  return changed;
}

/** Next time tick() has something to do (ms epoch). */
export function nextWake(t) {
  const times = [t.lastActive + idleLimit(t)];
  const h = t.hand;
  if (h && h.phase !== 'done') {
    if (h.deadline) times.push(h.deadline);
    if (engineOf(t).botDue(t, h) >= 0) times.push(h.botAt ?? Date.now() + BOT_DELAY_MS);
  } else if (h && h.nextAt && humanPresent(t)) times.push(h.nextAt);
  for (const s of t.seats) if (s && s.away) times.push(s.away + SEAT_HOLD_MS);
  return Math.min(...times);
}

const idleLimit = (t) => (t.handNo > 0 ? IDLE_EXPIRY_MS : UNUSED_EXPIRY_MS);

export function isExpired(t, now) {
  return now - t.lastActive >= idleLimit(t);
}

/** Snapshot for one viewer. Never includes other players' private cards or the deck. */
export function snapshot(t, { pid, isHost, connected }, now) {
  const eng = engineOf(t);
  const seat = seatOf(t, pid);
  const board = Object.entries(t.ledger)
    .map(([p, l]) => ({ pid: p, nick: l.nick, net: (l.chips ?? 0) - (l.buyIn ?? 0) }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 20);
  return {
    t: 'state',
    now,
    code: t.code,
    game: t.game,
    opts: t.opts,
    handNo: t.handNo,
    hostPid: t.hostPid,
    you: { pid, seat, isHost: !!isHost },
    seats: t.seats.map((s) =>
      s
        ? {
            pid: s.pid,
            nick: s.nick,
            chips: s.chips,
            bot: !!s.bot,
            persona: s.bot ? s.persona ?? 'deu' : undefined,
            away: !!s.away,
            leaving: !!s.leaving,
            online: s.bot || connected.has(s.pid),
          }
        : null,
    ),
    hand: t.hand ? eng.view(t, t.hand, seat) : null,
    canStart: !handActive(t) && eng.canStart(t),
    fair: {
      commit: t.fair?.commit ?? null,
      last: t.lastReveal ? { handNo: t.lastReveal.handNo, commit: t.lastReveal.commit, seed: t.lastReveal.seed, deck: t.lastReveal.deck } : null,
    },
    board,
  };
}

export { cleanNick };
