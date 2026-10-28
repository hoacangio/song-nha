// Texas Hold'em pieces of the table screen.
import { esc, fmt, signed } from '../lib/esc.js';
import { t } from '../lib/i18n.js';
import { HOLDEM_DEFAULTS, bestHand } from '../domain/holdem.js';
import { cardHtml } from '../ui/cards.js';
import { oneShot } from '../lib/motion.js';

export function holdemOptionsForm(o, p = 'o-') {
  const d = o || HOLDEM_DEFAULTS;
  const num = (k, min, max) =>
    `<label class="field"><span>${esc(t(`hd_${k}`))}</span><input id="${p}${k}" data-keep type="number" inputmode="numeric" min="${min}" max="${max}" value="${d[k]}"></label>`;
  return `${num('smallBlind', 1, 100000)}${num('bigBlind', 2, 100000)}${num('ante', 0, 100000)}`;
}

export function readHoldemOptions(form, p = 'o-') {
  const o = {};
  for (const k of ['smallBlind', 'bigBlind', 'ante']) {
    const v = Math.round(Number(form.querySelector(`#${p}${k}`)?.value));
    if (Number.isFinite(v)) o[k] = v;
  }
  return o;
}

export const handName = (cat) => (cat ? t(`hand_${cat}`) : '');

export function holdemKindLabel(r) {
  if (!r?.kind) return '';
  if (r.kind === 'fold') return t('hd_folded');
  return handName(r.kind);
}

const ACTION_LABEL = { fold: 'hd_fold', check: 'hd_check', call: 'hd_call', raise: 'hd_raise', bet: 'hd_bet', allin: 'hd_allin', sb: 'hd_sbShort', bb: 'hd_bbShort' };

export function holdemSeat(app, i, isMe) {
  const s = app.table.state;
  const h = s.hand;
  const hs = h?.seats?.[i];
  if (!hs) return '';
  const parts = [];
  const pos = h.button === i ? 'D' : '';
  if (pos) parts.push(`<span class="dealer-btn" title="${esc(t('hd_button'))}">D</span>`);
  if (!isMe && hs.count && !hs.folded) {
    const cards = [0, 1].map((k) => cardHtml(hs.cards ? hs.cards[k] : null, { key: `h${s.handNo}-hd-${i}-${k}`, size: 'sm', deal: k * 120 }));
    parts.push(`<div class="mini-hand">${cards.join('')}</div>`);
  }
  if (h.phase !== 'done') {
    if (hs.bet > 0) {
      const a = oneShot(`hbet-${s.handNo}-${h.street}-${i}-${hs.bet}`, 'chip-in', 420);
      parts.push(`<span class="bet-chip ${a.cls}" style="${a.style}">${fmt(hs.bet)}</span>`);
    }
    if (hs.last && !['sb', 'bb'].includes(hs.last) || hs.folded) {
      parts.push(`<span class="badge act-${esc(hs.last || 'fold')}">${esc(t(ACTION_LABEL[hs.folded ? 'fold' : hs.last]))}</span>`);
    }
  } else if (hs.result) {
    if (hs.result.category && !isMe) parts.push(`<span class="kind">${esc(handName(hs.result.category))}</span>`);
    const d = hs.result.delta;
    const a = oneShot(`hdelta-${s.handNo}-${i}`, 'pop', 380);
    parts.push(`<span class="delta ${a.cls} ${d > 0 ? 'up' : d < 0 ? 'down' : ''}" style="${a.style}">${esc(signed(d))}</span>`);
  }
  return parts.join('');
}

export function holdemCenter(app) {
  const s = app.table.state;
  const h = s.hand;
  if (!h) return `<div class="center-msg">${esc(s.canStart ? t('waitHost') : t('needPlayers'))}</div>`;
  const slots = [];
  for (let k = 0; k < 5; k++) {
    const c = h.board[k];
    slots.push(c ? cardHtml(c, { key: `h${s.handNo}-board-${k}`, size: 'md', deal: k < 3 ? k * 140 : 0 }) : '<span class="slot"></span>');
  }
  const out = [`<div class="board">${slots.join('')}</div>`];
  out.push(`<div class="pot"><span class="pot-chip"></span>${esc(t('hd_pot'))} <b>${fmt(h.pot)}</b></div>`);
  if (h.phase === 'done') {
    const winners = (h.seats || []).map((x, i) => (x?.result?.won > 0 ? i : -1)).filter((i) => i >= 0);
    const nick = (i) => (i === s.you.seat ? t('you') : s.seats[i]?.nick ?? '?');
    const win = winners.map(nick).join(', ');
    const cat = winners.length ? h.seats[winners[0]].result.category : null;
    out.push(`<div class="center-sub hot">${esc(win)} ${esc(t('hd_wins'))}${cat ? ` · ${esc(handName(cat))}` : ''}</div>`);
    if (h.nextAt) out.push(`<div class="center-sub">${esc(t('nextHand'))} <b data-countdown="${h.nextAt}"></b>s</div>`);
    return out.join('');
  }
  if (h.runout) {
    out.push(`<div class="center-sub hot">${esc(t('hd_runout'))}</div>`);
    return out.join('');
  }
  const mine = h.turn === s.you.seat;
  const nick = s.seats[h.turn]?.nick ?? '';
  out.push(
    `<div class="center-sub ${mine ? 'hot' : ''}">${esc(t(`hd_${h.street}`))} · ${mine ? esc(t('yourTurn')) : `${esc(t('turnOf'))} ${esc(nick)}`} · <b data-countdown="${h.deadline}"></b>s</div>`,
  );
  return out.join('');
}

/** Raise sizes offered as one-tap presets (amounts are "raise to"). */
export function raisePresets(a) {
  const r = a.raise;
  if (!r) return [];
  const potAfterCall = a.pot + a.call;
  const to = (frac) => Math.round(a.myBet + a.call + potAfterCall * frac);
  const list = [
    ['hd_min', r.min],
    ['hd_half', to(0.5)],
    ['hd_threeQ', to(0.75)],
    ['hd_potSize', to(1)],
    ['hd_allin', r.max],
  ];
  const seen = new Set();
  return list
    .map(([k, v]) => [k, Math.min(r.max, Math.max(r.min, v))])
    .filter(([, v]) => (seen.has(v) ? false : (seen.add(v), true)));
}

export function clampRaise(v, a) {
  const r = a.raise;
  if (!r) return 0;
  const n = Math.round(Number(v) || r.min);
  return Math.min(r.max, Math.max(r.min, n));
}

export function holdemDock(app) {
  const s = app.table.state;
  const h = s.hand;
  const me = s.you.seat;
  const hs = h && me >= 0 ? h.seats[me] : null;
  let hand = '';
  if (hs && hs.cards) {
    const best = h.board.length >= 3 ? bestHand([...hs.cards, ...h.board]) : null;
    const label = hs.folded ? t('hd_folded') : best ? handName(best.category) : '';
    hand = `<div class="my-hand ${hs.folded ? 'folded' : ''}">${hs.cards
      .map((c, k) => cardHtml(c, { key: `h${s.handNo}-hd-${me}-${k}`, size: 'lg', deal: k * 120, extra: best && !hs.folded && best.cards.includes(c) ? 'in-best' : '' }))
      .join('')}</div>
      <div class="my-total">${esc(label)}${hs.result ? ` · <b class="${hs.result.delta > 0 ? 'up' : hs.result.delta < 0 ? 'down' : ''}">${esc(signed(hs.result.delta))}</b>` : ''}
      <button class="help-btn" data-act="handHelp" aria-label="${esc(t('learn_rankings'))}">?</button></div>`;
  }
  return `${hand}<div class="actions">${holdemActions(app)}</div>`;
}

function holdemActions(app) {
  const s = app.table.state;
  const h = s.hand;
  const host = s.you.isHost;
  if (s.you.seat < 0) {
    const free = s.seats.some((x) => !x);
    return free ? `<button class="btn primary grow" data-act="sit">${esc(t('sit'))}</button>` : `<span class="muted">${esc(t('spectating'))}</span>`;
  }
  if (!h || h.phase === 'done') {
    if (host) {
      return `<button class="btn grow" data-act="addBot" ${s.seats.some((x) => !x) ? '' : 'disabled'}>${esc(t('addBot'))}</button>
              <button class="btn primary grow" data-act="start" ${s.canStart ? '' : 'disabled'}>${esc(t('start'))}</button>`;
    }
    return `<span class="muted">${esc(s.canStart ? t('waitHost') : t('needPlayers'))}</span>`;
  }
  const a = h.actions;
  if (!a) {
    const nick = h.runout ? t('hd_runout') : `${t('turnOf')} ${s.seats[h.turn]?.nick ?? ''}`;
    return `<span class="muted">${esc(nick)}</span>`;
  }
  const raising = app.ui.raising && a.raise;
  if (raising) {
    const v = clampRaise(app.ui.raise ?? a.raise.min, a);
    return `<div class="bet-row">${raisePresets(a)
      .map(([k, val]) => `<button class="chip-btn ${val === v ? 'on' : ''}" data-act="raisePreset" data-v="${val}">${esc(t(k))}</button>`)
      .join('')}</div>
      <div class="bet-row">
        <input id="raiseAmt" class="raise-range" type="range" min="${a.raise.min}" max="${a.raise.max}" step="${Math.max(1, Math.round(a.bigBlind / 2))}" value="${v}" aria-label="${esc(t('hd_raiseTo'))}">
      </div>
      <div class="bet-row">
        <button class="btn" data-act="raiseCancel">${esc(t('close'))}</button>
        <button class="btn primary grow" data-act="raiseConfirm" id="raiseGo">${esc(a.raise.bet ? t('hd_bet') : t('hd_raiseTo'))} ${fmt(v)}</button>
      </div>`;
  }
  return `<button class="btn grow" data-act="hdFold">${esc(t('hd_fold'))}</button>
    ${a.check ? `<button class="btn grow" data-act="hdCheck">${esc(t('hd_check'))}</button>` : `<button class="btn grow" data-act="hdCall">${esc(t('hd_call'))} ${fmt(a.call)}</button>`}
    ${a.raise ? `<button class="btn primary grow" data-act="raiseOpen">${esc(a.raise.bet ? t('hd_bet') : t('hd_raise'))}…</button>` : `<button class="btn primary grow" data-act="hdAllin">${esc(t('hd_allin'))}</button>`}`;
}
