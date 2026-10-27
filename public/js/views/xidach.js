// Xì dách-specific pieces of the table screen.
import { esc, fmt, signed } from '../lib/esc.js';
import { t } from '../lib/i18n.js';
import { XIDACH_DEFAULTS } from '../domain/xidach.js';
import { cardHtml } from '../ui/cards.js';
import { oneShot } from '../lib/motion.js';

const sel = (v, cur) => (v === cur ? 'selected' : '');

/** Option fields; `o` = current game options (null → defaults). `p` = id prefix. */
export function xidachOptionsForm(o, p = 'o-') {
  const d = o || XIDACH_DEFAULTS;
  const pay = d.payouts || XIDACH_DEFAULTS.payouts;
  const num = (name, label, min, max, v) =>
    `<label class="field"><span>${esc(t(label))}</span><input id="${p}${name}" data-keep name="g.${name}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${v}"></label>`;
  return `
    ${num('minBet', 'minBet', 1, 100000, d.minBet)}
    ${num('maxBet', 'maxBet', 1, 1000000, d.maxBet)}
    <label class="field"><span>${esc(t('dealerMode'))}</span>
      <select id="${p}dealerMode" data-keep name="g.dealerMode">
        <option value="rotate" ${sel('rotate', d.dealerMode)}>${esc(t('rotate'))}</option>
        <option value="host" ${sel('host', d.dealerMode)}>${esc(t('hostDealer'))}</option>
      </select></label>
    ${num('dealerMin', 'dealerMin', 14, 18, d.dealerMin)}
    ${num('playerMin', 'playerMin', 14, 18, d.playerMin)}
    <label class="field"><span>${esc(t('aceRule'))}</span>
      <select id="${p}aceRule" data-keep name="g.aceRule">
        <option value="flex" ${sel('flex', d.aceRule)}>${esc(t('aceFlex'))}</option>
        <option value="classic" ${sel('classic', d.aceRule)}>${esc(t('aceClassic'))}</option>
      </select></label>
    <label class="check"><input id="${p}bothBustPush" data-keep name="g.bothBustPush" type="checkbox" ${d.bothBustPush ? 'checked' : ''}> ${esc(t('bothBustPush'))}</label>
    <fieldset class="payouts"><legend>${esc(t('payouts'))}</legend>
      ${['normal', 'xidach', 'xibang', 'ngulinh']
        .map(
          (k) =>
            `<label class="field mini"><span>${esc(k === 'normal' ? t('win') : t(`kind_${k}`))} ×</span><input id="${p}pay-${k}" data-keep name="g.payouts.${k}" type="number" min="1" max="10" value="${pay[k]}"></label>`,
        )
        .join('')}
    </fieldset>`;
}

export function kindLabel(r) {
  if (!r) return '';
  if (r.kind === 'normal') return `${r.total} ${t('kind_normal')}`;
  if (r.kind === 'quac' || r.kind === 'non' || r.kind === 'ngulinh') return `${t(`kind_${r.kind}`)} · ${r.total}`;
  return t(`kind_${r.kind}`);
}

/** Small per-seat content: mini cards, bet, result. */
export function xidachSeat(app, i, isMe) {
  const s = app.table.state;
  const h = s.hand;
  const hs = h?.seats?.[i];
  const parts = [];
  if (h && h.dealer === i) parts.push(`<span class="badge dealer">${esc(t('dealer'))}</span>`);
  if (hs && hs.count && !isMe) {
    const cards = [];
    for (let k = 0; k < hs.count; k++) {
      cards.push(cardHtml(hs.cards ? hs.cards[k] : null, { key: `h${s.handNo}-s${i}-${k}`, size: 'sm', deal: k * 140 }));
    }
    parts.push(`<div class="mini-hand">${cards.join('')}</div>`);
  }
  if (hs && hs.bet != null) {
    const a = oneShot(`hbet-${s.handNo}-${i}`, 'chip-in', 420);
    parts.push(`<span class="bet-chip ${a.cls}" style="${a.style}">${fmt(hs.bet)}</span>`);
  }
  if (hs?.settled) {
    const d = hs.settled.delta;
    const a = oneShot(`hdelta-${s.handNo}-${i}`, 'pop', 380);
    parts.push(`<span class="delta ${a.cls} ${d > 0 ? 'up' : d < 0 ? 'down' : ''}" style="${a.style}">${esc(signed(d))}</span>`);
  } else if (hs?.result && !isMe && h.phase !== 'bet') {
    parts.push(`<span class="kind">${esc(kindLabel(hs.result))}</span>`);
  } else if (hs?.done && !isMe && h.phase === 'play') {
    parts.push(`<span class="kind muted">✓</span>`);
  }
  if (h && h.phase === 'dealer' && h.actions?.targets?.includes(i) && h.actions.xet) {
    parts.push(`<button class="btn xs primary xet-btn" data-act="xet" data-seat="${i}">${esc(t('xet'))}</button>`);
  }
  return parts.join('');
}

/** Middle of the felt. */
export function xidachCenter(app) {
  const s = app.table.state;
  const h = s.hand;
  if (!h) return `<div class="center-msg">${esc(s.canStart ? t('waitHost') : t('needPlayers'))}</div>`;
  const lines = [];
  lines.push(`<div class="phase">${esc(t(`phase_${h.phase}`))}</div>`);
  if (h.phase === 'done') {
    if (h.noBets) lines.push(`<div class="center-sub">${esc(t('noBets'))}</div>`);
    const dealerRes = h.seats[h.dealer]?.result;
    if (dealerRes) lines.push(`<div class="center-sub">${esc(t('dealer'))}: ${esc(kindLabel(dealerRes))}</div>`);
    if (h.nextAt) lines.push(`<div class="center-sub">${esc(t('nextHand'))} <b data-countdown="${h.nextAt}"></b>s</div>`);
  } else if (h.turn != null && s.seats[h.turn]) {
    const mine = h.turn === s.you.seat;
    lines.push(`<div class="center-sub ${mine ? 'hot' : ''}">${mine ? esc(t('yourTurn')) : `${esc(t('turnOf'))} ${esc(s.seats[h.turn].nick)}`}</div>`);
  }
  if (h.deadline) lines.push(`<div class="center-timer" data-countdown="${h.deadline}"></div>`);
  return lines.join('');
}

/** Bottom dock: my cards + action bar. */
export function xidachDock(app) {
  const s = app.table.state;
  const h = s.hand;
  const me = s.you.seat;
  const hs = h && me >= 0 ? h.seats[me] : null;
  let hand = '';
  if (hs && hs.cards) {
    hand = `<div class="my-hand">${hs.cards
      .map((c, k) => cardHtml(c, { key: `h${s.handNo}-s${me}-${k}`, size: 'lg', deal: k * 140 }))
      .join('')}</div>
      <div class="my-total">${esc(kindLabel(hs.result))}${hs.settled ? ` · <b class="${hs.settled.delta > 0 ? 'up' : hs.settled.delta < 0 ? 'down' : ''}">${esc(signed(hs.settled.delta))}</b>` : ''}</div>`;
  }
  return `${hand}<div class="actions">${xidachActions(app)}</div>`;
}

function xidachActions(app) {
  const s = app.table.state;
  const h = s.hand;
  const a = h?.actions;
  const host = s.you.isHost;
  if (s.you.seat < 0) {
    const free = s.seats.some((x) => !x);
    return free ? `<button class="btn primary grow" data-act="sit">${esc(t('sit'))}</button>` : `<span class="muted">${esc(t('spectating'))}</span>`;
  }
  if (!h || h.phase === 'done') {
    if (host) {
      return `<button class="btn grow" data-act="addBot">${esc(t('addBot'))}</button>
              <button class="btn primary grow" data-act="start" ${s.canStart ? '' : 'disabled'}>${esc(t('start'))}</button>`;
    }
    return `<span class="muted">${esc(s.canStart ? t('waitHost') : t('needPlayers'))}</span>`;
  }
  if (a?.bet) {
    const v = clampBet(app.ui.bet ?? a.bet.min, a.bet);
    const presets = [...new Set([a.bet.min, a.bet.min * 2, a.bet.min * 5, a.bet.max].filter((x) => x >= a.bet.min && x <= a.bet.max))];
    return `<div class="bet-row">
        ${presets.map((p) => `<button class="chip-btn ${p === v ? 'on' : ''}" data-act="betSet" data-v="${p}">${fmt(p)}</button>`).join('')}
      </div>
      <div class="bet-row">
        <button class="btn icon" data-act="betStep" data-v="-1" aria-label="−">−</button>
        <output class="bet-amount" id="betAmount">${fmt(v)}</output>
        <button class="btn icon" data-act="betStep" data-v="1" aria-label="+">+</button>
        <button class="btn primary grow" data-act="bet">${esc(t('bet'))} ${fmt(v)}</button>
      </div>`;
  }
  if (h.phase === 'play' && a) {
    return `<button class="btn grow" data-act="hit" ${a.hit ? '' : 'disabled'}>${esc(t('hit'))}</button>
            <button class="btn primary grow" data-act="stay" ${a.stay ? '' : 'disabled'}>${esc(t('stay'))}</button>`;
  }
  if (h.phase === 'dealer' && a) {
    return `<button class="btn grow" data-act="hit" ${a.hit ? '' : 'disabled'}>${esc(t('hit'))}</button>
            <button class="btn primary grow" data-act="xetAll" ${a.xet ? '' : 'disabled'}>${esc(t('xetAll'))}</button>`;
  }
  const turnNick = h.turn != null ? s.seats[h.turn]?.nick : '';
  return `<span class="muted">${turnNick ? `${esc(t('turnOf'))} ${esc(turnNick)}` : esc(t(`phase_${h.phase}`))}</span>`;
}

export function clampBet(v, b) {
  const n = Math.round(Number(v) || b.min);
  return Math.min(b.max, Math.max(b.min, n));
}

export function readXidachOptions(form, p = 'o-') {
  const n = (id) => {
    const el = form.querySelector(`#${p}${id}`);
    const v = el ? Number(el.value) : NaN;
    return Number.isFinite(v) ? Math.round(v) : undefined;
  };
  const v = (id) => form.querySelector(`#${p}${id}`)?.value;
  return {
    minBet: n('minBet'),
    maxBet: n('maxBet'),
    dealerMode: v('dealerMode'),
    dealerMin: n('dealerMin'),
    playerMin: n('playerMin'),
    aceRule: v('aceRule'),
    bothBustPush: !!form.querySelector(`#${p}bothBustPush`)?.checked,
    payouts: { normal: n('pay-normal'), xidach: n('pay-xidach'), xibang: n('pay-xibang'), ngulinh: n('pay-ngulinh') },
  };
}
