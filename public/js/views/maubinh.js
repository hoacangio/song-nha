// Mậu binh-specific pieces of the table screen.
import { esc, signed } from '../lib/esc.js';
import { t } from '../lib/i18n.js';
import { MAUBINH_DEFAULTS, SPECIALS, CAT_KEYS, judge, specialOf, splitChi } from '../domain/maubinh.js';
import { cardHtml } from '../ui/cards.js';
import { oneShot } from '../lib/motion.js';

const BONUS_KEYS = ['sfBack', 'quadBack', 'sfMid', 'quadMid', 'fullMid', 'tripsFront'];

export function maubinhOptionsForm(o, p = 'o-') {
  const d = o || MAUBINH_DEFAULTS;
  const num = (k, min, max, cls = 'mini') =>
    `<label class="field ${cls}"><span>${esc(t(`mb_${k}`))}</span><input id="${p}${k}" data-keep type="number" inputmode="numeric" min="${min}" max="${max}" value="${d[k]}"></label>`;
  const check = (k) => `<label class="check"><input id="${p}${k}" data-keep type="checkbox" ${d[k] ? 'checked' : ''}> ${esc(t(`mb_${k}`))}</label>`;
  return `
    ${num('unit', 1, 10000, '')}
    ${num('arrangeSeconds', 30, 300, '')}
    <fieldset class="group" data-g="score"><legend>${esc(t('mb_scoreRules'))}</legend>${num('sapMult', 1, 4, '')}${check('sapLang')}${check('a2345High')}</fieldset>
    <fieldset class="group pts" data-g="bonus"><legend>${esc(t('mb_bonusRules'))}</legend>${BONUS_KEYS.map((k) => num(k, 0, 100)).join('')}</fieldset>
    <fieldset class="group pts" data-g="special"><legend>${esc(t('mb_specialRules'))} · ${esc(t('mb_zeroOff'))}</legend>${SPECIALS.map((k) => num(k, 0, 100)).join('')}</fieldset>`;
}

export function readMaubinhOptions(form, p = 'o-') {
  const el = (k) => form.querySelector(`#${p}${k}`);
  const o = {};
  for (const k of ['unit', 'arrangeSeconds', 'sapMult', ...BONUS_KEYS, ...SPECIALS]) {
    const v = Math.round(Number(el(k)?.value));
    if (el(k) && Number.isFinite(v)) o[k] = v;
  }
  for (const k of ['sapLang', 'a2345High']) if (el(k)) o[k] = !!el(k).checked;
  return o;
}

export const catLabel = (cat) => t(`mb_cat_${CAT_KEYS[cat]}`);

export function maubinhKindLabel(r) {
  if (!r?.kind) return '';
  if (r.kind === 'mb_lung') return t('mb_lung');
  if (r.kind.startsWith('mb_') && r.kind !== 'mb_ok') return `${t('mb_special')}: ${t(`mb_${r.kind.slice(3)}`)}`;
  return `${signed(r.total)} chi`;
}

/** The order of my 13 cards as currently laid out (local, until submitted). */
export function myOrder(app) {
  const s = app.table.state;
  const h = s.hand;
  const me = h?.seats?.[s.you.seat];
  return me ? app.ui.mb?.order ?? me.arr ?? me.cards ?? null : null;
}

const CHI = ['mb_chi1', 'mb_chi2', 'mb_chi3'];

export function maubinhSeat(app, i, isMe) {
  const s = app.table.state;
  const h = s.hand;
  const hs = h?.seats?.[i];
  if (!hs) return '';
  if (h.phase !== 'done') {
    if (isMe) return hs.ready ? `<span class="badge win">${esc(t('mb_ready'))}</span>` : '';
    return `<span class="count-back"><span class="card back xs"></span><b>13</b></span>${hs.ready ? `<span class="badge win">${esc(t('mb_ready'))}</span>` : `<span class="badge pass">${esc(t('mb_arranging'))}</span>`}`;
  }
  const r = hs.result;
  const parts = [];
  if (!isMe && hs.arr) {
    parts.push(
      `<div class="mb-mini">${splitChi(hs.arr)
        .map((row) => `<div class="mb-mini-row">${row.map((c) => cardHtml(c, { size: 'xs' })).join('')}</div>`)
        .join('')}</div>`,
    );
  }
  if (r) {
    const tag = r.special ? `<span class="badge win">${esc(t(`mb_${r.special}`))}</span>` : !r.valid ? `<span class="badge chop">${esc(t('mb_lung'))}</span>` : '';
    const a = oneShot(`hdelta-${s.handNo}-${i}`, 'pop', 380);
    parts.push(`${tag}<span class="delta ${a.cls} ${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}" style="${a.style}">${esc(signed(r.total))} chi</span>`);
  }
  return parts.join('');
}

export function maubinhCenter(app) {
  const s = app.table.state;
  const h = s.hand;
  if (!h) return `<div class="center-msg">${esc(s.canStart ? t('waitHost') : t('needPlayers'))}</div>`;
  const nick = (i) => (i === s.you.seat ? t('you') : s.seats[i]?.nick ?? '?');
  if (h.phase === 'done') {
    // Each seat shows its three chi and result; the centre only sums up your own outcome.
    const me = s.you.seat;
    const mine = me >= 0 ? h.seats[me]?.result : null;
    const vs = h.vs ? Object.values(h.vs) : [];
    const sap = vs.some((x) => x.kind === 'sap' && x.chi > 0) ? `<div class="center-sub hot">${esc(vs.some((x) => x.lang) ? t('mb_sapLangWin') : t('mb_sapWin'))}</div>` : '';
    return `<div class="phase">${esc(t('mb_compare'))}</div>
      ${mine ? `<div class="center-sub">${esc(t('you'))}: <b>${esc(signed(mine.total))} chi</b> · ${esc(signed(mine.delta))}</div>` : ''}${sap}
      ${h.nextAt ? `<div class="center-sub">${esc(t('nextHand'))} <b data-countdown="${h.nextAt}"></b>s</div>` : ''}`;
  }
  const ready = h.players.filter((p) => h.seats[p].ready).length;
  return `<div class="phase">${esc(t('mb_arrangePhase'))}</div>
    <div class="center-sub">${ready}/${h.players.length} ${esc(t('mb_readyCount'))}</div>
    <div class="center-timer"><b data-countdown="${h.deadline}"></b>s</div>`;
}

export function maubinhDock(app) {
  const s = app.table.state;
  const h = s.hand;
  const me = s.you.seat;
  const hs = h && me >= 0 ? h.seats[me] : null;
  let rows = '';
  const order = myOrder(app);
  if (hs && order) {
    const o = s.opts.game;
    const j = judge(order, o);
    const special = specialOf(order, o);
    const locked = h.phase === 'done' || hs.ready;
    const pick = app.ui.mb?.pick;
    const res = h.phase === 'done' && h.vs ? Object.values(h.vs) : null;
    rows = `<div class="mb-rows ${locked ? 'locked' : ''} ${j.valid ? '' : 'lung'}">${splitChi(order)
      .map((row, k) => {
        const won = res ? res.reduce((n, x) => n + (x.per[k] > 0 ? 1 : 0), 0) : null;
        const lost = res ? res.reduce((n, x) => n + (x.per[k] < 0 ? 1 : 0), 0) : null;
        return `<div class="mb-row" style="--n:5">
          <span class="mb-label"><b>${esc(t(CHI[k]))}</b><span>${esc(catLabel(j.evs[k].cat))}</span>${res ? `<span class="mb-wl">${won}↑ ${lost}↓</span>` : ''}</span>
          <div class="mb-cards">${row
            .map((c) =>
              cardHtml(c, { key: `h${s.handNo}-mb-${c}`, size: 'lg', extra: pick === c ? 'sel' : '', tap: locked ? '' : 'mbTap' }),
            )
            .join('')}</div></div>`;
      })
      .join('')}</div>
      <div class="mb-status">${
        special
          ? `<span class="badge win">${esc(t('mb_special'))}: ${esc(t(`mb_${special}`))}</span>`
          : j.valid
            ? `<span class="muted small">${esc(locked ? '' : t('mb_tapSwap'))}</span>`
            : `<span class="badge chop">${esc(t('mb_lungWarn'))}</span>`
      }</div>`;
  }
  return `${rows}<div class="actions">${maubinhActions(app)}</div>`;
}

function maubinhActions(app) {
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
  if (!h.actions) return `<span class="muted">${esc(t('mb_waitOthers'))}</span>`;
  if (h.actions.unready) {
    return `<span class="muted grow">${esc(t('mb_waitOthers'))}</span><button class="btn" data-act="mbEdit">${esc(t('mb_edit'))}</button>`;
  }
  return `<button class="btn" data-act="mbAuto">${esc(t('mb_auto'))}</button>
    <button class="btn primary grow" data-act="mbSubmit">${esc(t('mb_submit'))}</button>`;
}
