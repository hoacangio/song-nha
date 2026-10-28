// Tichu-specific pieces of the table screen.
import { esc, signed } from '../lib/esc.js';
import { t } from '../lib/i18n.js';
import { TICHU_DEFAULTS, MJ, detectCombo, canBeat, isBomb, isSpecial, val, wishPlays, RANKS } from '../domain/tichu.js';
import { cardHtml, specialName } from '../ui/cards.js';
import { oneShot } from '../lib/motion.js';

const NUM_KEYS = [
  ['target', 200, 2000],
  ['unit', 1, 1000],
  ['tichuBonus', 0, 500],
  ['grandBonus', 0, 1000],
  ['doubleWin', 0, 1000],
];

export function tichuOptionsForm(o, p = 'o-') {
  const d = o || TICHU_DEFAULTS;
  const field = ([k, min, max]) =>
    `<label class="field"><span>${esc(t(`tc_${k}`))}</span><input id="${p}${k}" data-keep type="number" inputmode="numeric" min="${min}" max="${max}" value="${d[k]}"></label>`;
  return `${NUM_KEYS.slice(0, 2).map(field).join('')}
    <fieldset class="group pts" data-g="points"><legend>${esc(t('tc_pointsRules'))}</legend>${NUM_KEYS.slice(2).map(field).join('')}</fieldset>`;
}

export function readTichuOptions(form, p = 'o-') {
  const o = {};
  for (const [k] of NUM_KEYS) {
    const el = form.querySelector(`#${p}${k}`);
    const v = Math.round(Number(el?.value));
    if (el && Number.isFinite(v)) o[k] = v;
  }
  return o;
}

export const rankName = (v) => (v === 1 ? '1' : RANKS[v - 2] === 'T' ? '10' : RANKS[v - 2]);

export function comboName(c) {
  if (!c) return '';
  if (c.type === 'single' && c.dragon) return specialName('DR');
  if (c.type === 'single' && c.phoenix) return specialName('PH');
  if (c.type === 'straight' || c.type === 'bombsf') return `${t(`tc_c_${c.type}`)} ${c.len}`;
  if (c.type === 'pairs') return `${c.len} ${t('tc_c_pairs')}`;
  return t(`tc_c_${c.type}`);
}

export function tichuKindLabel(r) {
  if (!r?.kind) return '';
  const m = r.kind.match(/^tc_(tichu|grand)_(ok|fail)$/);
  if (m) return `${m[1] === 'grand' ? 'Grand Tichu' : 'Tichu'} ${m[2] === 'ok' ? '✓' : '✗'}`;
  if (r.kind.startsWith('tc_out_')) return t(`tc_out${r.kind.slice(7)}`);
  return t('tc_last');
}

const partner = (h, seat) => h.players[(h.players.indexOf(seat) + 2) % 4];
const nickOf = (s, i) => (i === s.you.seat ? t('you') : s.seats[i]?.nick ?? '?');

/** Validates the current selection for the Play / Bomb buttons. */
export function tichuSelection(app) {
  const s = app.table.state;
  const h = s.hand;
  const a = h?.actions;
  const sel = [...(app.ui.sel || [])];
  if (!a || !sel.length || (!a.play && !a.bomb)) return { ok: false, combo: null };
  const prev = h.trick?.combo ?? null;
  const combo = detectCombo(sel, prev);
  if (!combo) return { ok: false, combo: null, why: 'bad_combo' };
  if (!a.play && !isBomb(combo)) return { ok: false, combo };
  if (combo.type === 'dog' && prev) return { ok: false, combo };
  if (!canBeat(prev, combo)) return { ok: false, combo, why: 'cannot_beat' };
  if (a.mustWish && !isBomb(combo) && !sel.some((c) => !isSpecial(c) && val(c) === h.wish)) return { ok: false, combo, why: 'must_wish' };
  return { ok: true, combo, bomb: isBomb(combo), mj: sel.includes(MJ) };
}

export function tichuSeat(app, i, isMe) {
  const s = app.table.state;
  const h = s.hand;
  const hs = h?.seats?.[i];
  if (!hs) return '';
  const parts = [];
  const me = s.you.seat;
  if (me >= 0 && h.players.includes(me) && i === partner(h, me)) parts.push(`<span class="badge team">${esc(t('tc_partner'))}</span>`);
  if (hs.call) parts.push(`<span class="badge win">${hs.call === 'grand' ? 'Grand' : 'Tichu'}</span>`);
  if (h.phase === 'done') {
    const d = h.result.delta[i];
    const a = oneShot(`hdelta-${s.handNo}-${i}`, 'pop', 380);
    if (hs.out) parts.push(`<span class="badge ${hs.out === 1 ? 'win' : 'rank'}">${esc(t(`tc_out${hs.out}`))}</span>`);
    parts.push(`<span class="delta ${a.cls} ${d > 0 ? 'up' : d < 0 ? 'down' : ''}" style="${a.style}">${esc(signed(d))}</span>`);
    return parts.join('');
  }
  if (!isMe && hs.count) parts.push(`<span class="count-back"><span class="card back xs"></span><b>${hs.count}</b></span>`);
  if (hs.out) parts.push(`<span class="badge ${hs.out === 1 ? 'win' : 'rank'}">${esc(t(`tc_out${hs.out}`))}</span>`);
  else if (h.phase === 'grand') parts.push(hs.grandDecided ? `<span class="badge pass">✓</span>` : `<span class="badge pass">…</span>`);
  else if (h.phase === 'exchange') parts.push(hs.gave ? `<span class="badge pass">${esc(t('tc_gave'))}</span>` : `<span class="badge pass">…</span>`);
  else if (hs.passed) parts.push(`<span class="badge pass">${esc(t('tl_passed'))}</span>`);
  return parts.join('');
}

function scoreLine(app) {
  const s = app.table.state;
  const h = s.hand;
  const me = s.you.seat;
  const myTeam = me >= 0 && h.seats[me] ? h.seats[me].team : 0;
  const pts = [0, 0];
  for (const p of h.players) pts[h.seats[p].team] += h.seats[p].points;
  const m = h.match;
  const us = t(me >= 0 ? 'tc_us' : 'tc_teamA');
  const them = t(me >= 0 ? 'tc_them' : 'tc_teamB');
  return `<div class="center-sub tc-score">${esc(us)} ${pts[myTeam]} · ${esc(them)} ${pts[1 - myTeam]}${
    m ? ` <span class="muted">· ${esc(t('tc_match'))} ${m.score[myTeam]}–${m.score[1 - myTeam]}/${m.target}</span>` : ''
  }</div>`;
}

export function tichuCenter(app) {
  const s = app.table.state;
  const h = s.hand;
  if (!h) return `<div class="center-msg">${esc(s.canStart ? t('waitHost') : t('tc_need4'))}</div>`;
  const out = [];
  if (h.phase === 'grand') {
    const n = h.players.filter((p) => h.seats[p].grandDecided).length;
    out.push(`<div class="phase">Grand Tichu?</div><div class="center-sub">${n}/4 · <b data-countdown="${h.deadline}"></b>s</div>`);
    return out.join('');
  }
  if (h.phase === 'exchange') {
    const n = h.players.filter((p) => h.seats[p].gave).length;
    out.push(`<div class="phase">${esc(t('tc_exchangePhase'))}</div><div class="center-sub">${n}/4 · <b data-countdown="${h.deadline}"></b>s</div>`);
    return out.join('');
  }
  if (h.phase === 'done') {
    const r = h.result;
    const me = s.you.seat;
    const myTeam = me >= 0 && h.seats[me] ? h.seats[me].team : 0;
    out.push(`<div class="phase">${esc(r.double ? t('tc_double') : t('phase_done'))}</div>`);
    out.push(`<div class="center-sub">${esc(t(me >= 0 ? 'tc_us' : 'tc_teamA'))} ${esc(signed(r.team[myTeam]))} · ${esc(t(me >= 0 ? 'tc_them' : 'tc_teamB'))} ${esc(signed(r.team[1 - myTeam]))}</div>`);
    for (const c of r.calls) out.push(`<div class="center-sub">${esc(nickOf(s, c.seat))}: ${c.call === 'grand' ? 'Grand Tichu' : 'Tichu'} ${c.ok ? '✓' : '✗'} (${esc(signed(c.points))})</div>`);
    const m = r.match;
    out.push(`<div class="center-sub">${esc(t('tc_match'))} ${m.score[myTeam]}–${m.score[1 - myTeam]} / ${m.target}</div>`);
    if (m.over != null) out.push(`<div class="center-sub hot">${esc(m.over === myTeam ? t(me >= 0 ? 'tc_matchWon' : 'tc_matchA') : t(me >= 0 ? 'tc_matchLost' : 'tc_matchB'))}</div>`);
    if (h.nextAt) out.push(`<div class="center-sub">${esc(t('nextHand'))} <b data-countdown="${h.nextAt}"></b>s</div>`);
    return out.join('');
  }
  if (h.phase === 'dragon') {
    out.push(`<div class="phase">${esc(specialName('DR'))}</div><div class="center-sub">${esc(nickOf(s, h.dragon.winner))} ${esc(t('tc_dragonChoose'))} · <b data-countdown="${h.deadline}"></b>s</div>`);
    out.push(scoreLine(app));
    return out.join('');
  }
  if (h.trick) {
    const k = `htrick-${s.handNo}-${h.trick.seat}-${h.trick.cards.join('')}`;
    const a = oneShot(k, 'land', 360);
    out.push(`<div class="trick ${a.cls}" style="${a.style}">${h.trick.cards.map((c) => cardHtml(c, { size: 'md' })).join('')}</div>`);
    const bomb = isBomb(h.trick.combo) ? `<b class="chop-word">${esc(t('tc_bomb'))}</b> · ` : '';
    out.push(`<div class="center-sub">${bomb}${esc(comboName(h.trick.combo))} · ${esc(nickOf(s, h.trick.seat))}</div>`);
  } else {
    out.push(`<div class="phase">${esc(h.dogTo != null ? `${specialName('DG')} → ${nickOf(s, h.dogTo)}` : t('tl_newRound'))}</div>`);
  }
  if (h.wish) out.push(`<div class="center-sub hot">${esc(t('tc_wish'))}: ${esc(rankName(h.wish))}</div>`);
  const mine = h.turn === s.you.seat;
  out.push(`<div class="center-sub ${mine ? 'hot' : ''}">${mine ? esc(t('yourTurn')) : `${esc(t('turnOf'))} ${esc(nickOf(s, h.turn))}`} · <b data-countdown="${h.deadline}"></b>s</div>`);
  out.push(scoreLine(app));
  return out.join('');
}

export function tichuDock(app) {
  const s = app.table.state;
  const h = s.hand;
  const me = s.you.seat;
  const hs = h && me >= 0 ? h.seats[me] : null;
  let top = '';
  if (hs && hs.cards && h.phase !== 'done') {
    const give = app.ui.give || [];
    const sel = h.phase === 'exchange' ? new Set(give) : app.ui.sel || new Set();
    const tap = h.phase === 'exchange' ? (h.actions?.exchange ? 'tcGiveTap' : '') : 'toggleCard';
    top = `<div class="tl-hand tc-hand" style="--n:${Math.max(hs.cards.length, 1)}">${hs.cards
      .map((c, k) => cardHtml(c, { key: `h${s.handNo}-tc-${c}`, size: 'lg', deal: k * 35, extra: sel.has(c) ? 'sel' : '', tap }))
      .join('')}</div>`;
    if (h.phase === 'exchange' && h.actions?.exchange) {
      const slots = ['tc_toNext', 'tc_toPartner', 'tc_toPrev'];
      top += `<div class="tc-slots">${slots
        .map((k, i) => `<button class="tc-slot" data-act="tcGiveTap" data-card="${esc(give[i] || '')}" ${give[i] ? '' : 'disabled'}><span class="small muted">${esc(t(k))}</span>${give[i] ? cardHtml(give[i], { size: 'sm' }) : '<span class="tc-empty">?</span>'}</button>`)
        .join('')}</div>`;
    }
    if (h.phase === 'play' && h.received && hs.count === 14) {
      top += `<div class="small muted tc-received">${esc(t('tc_received'))}: ${h.received
        .map((x) => `<span class="tc-rcv">${esc(nickOf(s, x.from))} ${cardHtml(x.card, { size: 'xs' })}</span>`)
        .join(' · ')}</div>`;
    }
  }
  return `${top}<div class="actions">${tichuActions(app)}</div>`;
}

function tichuActions(app) {
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
    return `<span class="muted">${esc(s.canStart ? t('waitHost') : t('tc_need4'))}</span>`;
  }
  const a = h.actions || {};
  const tichu = a.tichu && h.phase !== 'grand' ? `<button class="btn tc-call" data-act="tcTichu">Tichu! (+${s.opts.game.tichuBonus})</button>` : '';
  if (a.grand) {
    return `<button class="btn tc-call" data-act="tcGrand" data-v="1">Grand Tichu (+${s.opts.game.grandBonus})</button>
      <button class="btn primary grow" data-act="tcGrand" data-v="0">${esc(t('tc_noGrand'))}</button>`;
  }
  if (a.exchange) {
    const n = (app.ui.give || []).filter(Boolean).length;
    return `${tichu}<button class="btn" data-act="tcGiveHint">${esc(t('tl_hint'))}</button>
      <button class="btn primary grow" data-act="tcGive" ${n === 3 ? '' : 'disabled'}>${esc(t('tc_give'))} (${n}/3)</button>`;
  }
  if (a.dragon) {
    return `<span class="muted">${esc(t('tc_dragonGive'))}</span>${a.dragon
      .map((p) => `<button class="btn primary grow" data-act="tcDragon" data-seat="${p}">${esc(nickOf(s, p))} (${h.seats[p].count})</button>`)
      .join('')}`;
  }
  const st = tichuSelection(app);
  if (a.play) {
    const label = st.combo ? `${t('tl_play')} · ${comboName(st.combo)}` : t('tl_play');
    const wish = st.ok && st.mj
      ? `<label class="tc-wish"><span class="small">${esc(t('tc_wish'))}</span><select id="tcWish" data-keep><option value="">—</option>${[...RANKS]
          .map((r, i) => `<option value="${i + 2}">${r === 'T' ? '10' : r}</option>`)
          .join('')}</select></label>`
      : '';
    return `${tichu}${wish}<button class="btn" data-act="tcHint">${esc(t('tl_hint'))}</button>
      <button class="btn grow" data-act="pass" ${a.pass && !a.mustWish ? '' : 'disabled'}>${esc(t('tl_pass'))}</button>
      <button class="btn primary grow" data-act="tcPlay" ${st.ok ? '' : 'disabled'}>${esc(label)}</button>`;
  }
  const turnNick = h.turn != null ? nickOf(s, h.turn) : '';
  const bomb = a.bomb && st.ok && st.bomb ? `<button class="btn danger grow" data-act="tcPlay">💣 ${esc(t('tc_bomb'))}</button>` : '';
  const out = h.seats[s.you.seat]?.out;
  return `${tichu}<span class="muted grow">${out ? esc(t(`tc_out${out}`)) + ' · ' : ''}${h.phase === 'dragon' ? '' : `${esc(t('turnOf'))} ${esc(turnNick)}`}</span>${bomb}`;
}

export { wishPlays };
