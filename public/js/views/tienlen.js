// Tiến lên-specific pieces of the table screen.
import { esc, signed } from '../lib/esc.js';
import { t } from '../lib/i18n.js';
import { TIENLEN_DEFAULTS, detectCombo, canBeat } from '../domain/tienlen.js';
import { cardHtml } from '../ui/cards.js';
import { oneShot } from '../lib/motion.js';

const CHOP_KEYS = ['chop3PairsSingle2', 'chopQuadSingle2', 'chopQuadPair2', 'chopQuad3Pairs', 'chop4Pairs', 'chopPay'];
const INSTANT_KEYS = ['instantDragon', 'instantFour2', 'instantSixPairs', 'instantFivePairSeq'];
const POINT_KEYS = ['rankTop', 'rankMid', 'perCard', 'cong', 'thoi2Black', 'thoi2Red', 'thoiQuad', 'thoi3Pairs', 'toiTrang'];

export function tienlenOptionsForm(o, p = 'o-') {
  const d = o || TIENLEN_DEFAULTS;
  const check = (k) =>
    `<label class="check"><input id="${p}${k}" data-keep type="checkbox" ${d[k] ? 'checked' : ''}> ${esc(t(`tl_${k}`))}</label>`;
  const num = (k, min, max) =>
    `<label class="field mini"><span>${esc(t(`tl_${k}`))}</span><input id="${p}${k}" data-keep type="number" inputmode="numeric" min="${min}" max="${max}" value="${d[k]}"></label>`;
  return `
    <label class="field"><span>${esc(t('tl_endMode'))}</span>
      <select id="${p}endMode" data-keep>
        <option value="rank" ${d.endMode !== 'first' ? 'selected' : ''}>${esc(t('tl_endRank'))}</option>
        <option value="first" ${d.endMode === 'first' ? 'selected' : ''}>${esc(t('tl_endFirst'))}</option>
      </select></label>
    <label class="field"><span>${esc(t('tl_unit'))}</span><input id="${p}unit" data-keep type="number" inputmode="numeric" min="1" max="10000" value="${d.unit}"></label>
    <fieldset class="group" data-g="chop"><legend>${esc(t('tl_chopRules'))}</legend>${CHOP_KEYS.map(check).join('')}</fieldset>
    <fieldset class="group" data-g="instant"><legend>${esc(t('tl_instantRules'))}</legend>${INSTANT_KEYS.map(check).join('')}</fieldset>
    <fieldset class="group pts" data-g="points"><legend>${esc(t('tl_points'))}</legend>
      ${POINT_KEYS.map((k) => num(k, 0, 100)).join('')}
      ${check('thoi')}
    </fieldset>`;
}

export function readTienlenOptions(form, p = 'o-') {
  const el = (k) => form.querySelector(`#${p}${k}`);
  const o = {};
  if (el('endMode')) o.endMode = el('endMode').value === 'first' ? 'first' : 'rank';
  const unit = Math.round(Number(el('unit')?.value));
  if (Number.isFinite(unit)) o.unit = unit;
  for (const k of [...CHOP_KEYS, ...INSTANT_KEYS, 'thoi']) if (el(k)) o[k] = !!el(k).checked;
  for (const k of POINT_KEYS) {
    const v = Math.round(Number(el(k)?.value));
    if (Number.isFinite(v)) o[k] = v;
  }
  return o;
}

export function comboLabel(c) {
  if (!c) return '';
  if (c.type === 'straight') return `${t('combo_straight')} ${c.len}`;
  if (c.type === 'pairseq') return `${c.len} ${t('combo_pairseq')}`;
  return t(`combo_${c.type}`);
}

export function tienlenKindLabel(r) {
  if (!r?.kind) return '';
  if (r.kind.startsWith('toi_')) return `${t('tl_toiTrangShort')}: ${t(`tl_${r.kind}`)}`;
  if (r.kind === 'win') return t('tl_first');
  if (r.kind === 'rank_last') return t('tl_rank_last');
  if (r.kind.startsWith('rank_')) return t(`tl_${r.kind}`);
  if (r.kind === 'cong') return t('tl_congBadge');
  return `${r.total} ${t('tl_cardsLeft')}`;
}

/** "Nhất", "Nhì", "Ba", or "Bét" for the last place. */
export function rankLabel(rank, total) {
  if (!rank) return '';
  return rank === total && total > 1 ? t('tl_rank_last') : t(`tl_rank_${rank}`);
}

/** Validates the current selection against the table for the Play button. */
export function selectionState(app) {
  const h = app.table.state.hand;
  const sel = [...(app.ui.sel || [])];
  if (!h?.actions?.play || !sel.length) return { ok: false, combo: null };
  const combo = detectCombo(sel);
  if (!combo) return { ok: false, combo: null, why: 'bad_combo' };
  if (h.mustInclude && !sel.includes(h.mustInclude)) return { ok: false, combo, why: 'must_include' };
  if (!canBeat(h.trick?.combo ?? null, combo, app.table.state.opts.game)) return { ok: false, combo, why: 'cannot_beat' };
  return { ok: true, combo };
}

export function tienlenSeat(app, i, isMe) {
  const s = app.table.state;
  const h = s.hand;
  const hs = h?.seats?.[i];
  if (!hs) return '';
  const parts = [];
  if (!isMe && h.phase !== 'done' && hs.count) parts.push(`<span class="count-back"><span class="card back xs"></span><b>${hs.count}</b></span>`);
  if (hs.passed && h.phase !== 'done' && !hs.out) parts.push(`<span class="badge pass">${esc(t('tl_passed'))}</span>`);
  const total = h.players.length;
  if (h.result) {
    const r = hs.result;
    if (h.result.instant && h.result.winner === i) parts.push(`<span class="badge win">${esc(t('tl_toiTrangShort'))}</span>`);
    else if (r?.cong) parts.push(`<span class="badge pass">${esc(t('tl_congBadge'))}</span>`);
    else if (r?.rank) parts.push(`<span class="badge ${r.rank === 1 ? 'win' : 'rank'}">${esc(rankLabel(r.rank, total))}</span>`);
    if (r) {
      const d = r.delta;
      const a = oneShot(`hdelta-${s.handNo}-${i}`, 'pop', 380);
      parts.push(`<span class="delta ${a.cls} ${d > 0 ? 'up' : d < 0 ? 'down' : ''}" style="${a.style}">${esc(signed(d))}</span>`);
    }
  } else if (hs.rank) {
    // Went out while the others play on.
    const a = oneShot(`hrank-${s.handNo}-${i}`, 'pop', 380);
    parts.push(`<span class="badge ${hs.rank === 1 ? 'win' : 'rank'} ${a.cls}" style="${a.style}">${esc(rankLabel(hs.rank, total))}</span>`);
  } else if (hs.cong) {
    parts.push(`<span class="badge pass">${esc(t('tl_congBadge'))}</span>`);
  }
  if (h.lastChop && h.lastChop.to === i) parts.push(`<span class="badge chop">${esc(t('tl_chop'))}</span>`);
  return parts.join('');
}

export function tienlenCenter(app) {
  const s = app.table.state;
  const h = s.hand;
  if (!h) return `<div class="center-msg">${esc(s.canStart ? t('waitHost') : t('needPlayers'))}</div>`;
  const nick = (i) => (i === s.you.seat ? t('you') : s.seats[i]?.nick ?? '?');
  const out = [];
  if (h.phase === 'done') {
    const w = h.result.winner;
    if (h.result.mode === 'rank' && !h.result.instant) {
      const total = h.players.length;
      out.push(`<div class="phase">${esc(t('phase_done'))}</div>`);
      out.push(
        `<ol class="ranking">${h.result.order
          .map((p, k) => {
            const r = h.seats[p]?.result;
            const label = r?.cong ? t('tl_congBadge') : rankLabel(k + 1, total);
            return `<li><b>${esc(label)}</b> ${esc(nick(p))}</li>`;
          })
          .join('')}</ol>`,
      );
    } else {
      out.push(`<div class="phase">${esc(nick(w))} ${esc(h.result.instant ? `— ${t('tl_toiTrangShort')}` : `— ${t('tl_first')}`)}</div>`);
    }
    if (h.result.instant) out.push(`<div class="center-sub">${esc(t(`tl_toi_${h.result.instant}`))}</div>`);
    if (h.nextAt) out.push(`<div class="center-sub">${esc(t('nextHand'))} <b data-countdown="${h.nextAt}"></b>s</div>`);
    return out.join('');
  }
  if (h.trick) {
    const k = `htrick-${s.handNo}-${h.trick.seat}-${h.trick.cards.join('')}`;
    const a = oneShot(k, 'land', 360);
    out.push(`<div class="trick ${a.cls}" style="${a.style}">${h.trick.cards.map((c) => cardHtml(c, { size: 'md' })).join('')}</div>`);
    out.push(
      `<div class="center-sub">${h.trick.chop ? `<b class="chop-word">${esc(t('tl_chop'))}</b> · ` : ''}${esc(comboLabel(h.trick.combo))} · ${esc(nick(h.trick.seat))}</div>`,
    );
    if (h.lastChop) {
      out.push(`<div class="center-sub">${esc(nick(h.lastChop.from))} → ${esc(nick(h.lastChop.to))}: ${esc(signed(h.lastChop.chips))}</div>`);
    }
  } else {
    out.push(`<div class="phase">${esc(t('tl_newRound'))}</div>`);
    if (h.firstLead) out.push(`<div class="center-sub">${esc(t('tl_mustLow'))}</div>`);
  }
  const mine = h.turn === s.you.seat;
  out.push(`<div class="center-sub ${mine ? 'hot' : ''}">${mine ? esc(t('yourTurn')) : `${esc(t('turnOf'))} ${esc(nick(h.turn))}`} · <b data-countdown="${h.deadline}"></b>s</div>`);
  return out.join('');
}

export function tienlenDock(app) {
  const s = app.table.state;
  const h = s.hand;
  const me = s.you.seat;
  const hs = h && me >= 0 ? h.seats[me] : null;
  let hand = '';
  if (hs && hs.cards) {
    const sel = app.ui.sel || new Set();
    const canTap = h.phase !== 'done';
    hand = `<div class="tl-hand" style="--n:${Math.max(hs.cards.length, 1)}">${hs.cards
      .map((c, k) =>
        cardHtml(c, {
          key: `h${s.handNo}-tl-${c}`,
          size: 'lg',
          deal: k * 45,
          extra: `${sel.has(c) ? 'sel' : ''} ${h.mustInclude === c ? 'must' : ''}`,
          tap: canTap ? 'toggleCard' : '',
        }),
      )
      .join('')}</div>`;
  }
  return `${hand}<div class="actions">${tienlenActions(app)}</div>`;
}

function tienlenActions(app) {
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
  if (!h.actions) {
    const mine = h.seats[s.you.seat];
    const turnNick = s.seats[h.turn]?.nick ?? '';
    if (mine?.rank) return `<span class="muted">${esc(t('tl_youOut').replace('{rank}', rankLabel(mine.rank, h.players.length)))} · ${esc(t('turnOf'))} ${esc(turnNick)}</span>`;
    if (mine?.cong) return `<span class="muted">${esc(t('tl_congBadge'))} · ${esc(t('turnOf'))} ${esc(turnNick)}</span>`;
    return `<span class="muted">${esc(t('turnOf'))} ${esc(turnNick)}</span>`;
  }
  const st = selectionState(app);
  const label = st.combo ? `${t('tl_play')} · ${comboLabel(st.combo)}` : t('tl_play');
  return `<button class="btn" data-act="hint">${esc(t('tl_hint'))}</button>
    <button class="btn grow" data-act="pass" ${h.actions.pass ? '' : 'disabled'}>${esc(t('tl_pass'))}</button>
    <button class="btn primary grow" data-act="playSel" ${st.ok ? '' : 'disabled'}>${esc(label)}</button>`;
}
