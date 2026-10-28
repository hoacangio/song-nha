import { esc, fmt, signed } from '../lib/esc.js';
import { t } from '../lib/i18n.js';
import { qrSvg } from '../lib/qr.js';
import { cardHtml, ringHtml, initials } from '../ui/cards.js';
import { GAME_VIEWS } from './games.js';

export { GAME_VIEWS };

export function tableUrl(code) {
  return `${location.origin}/t/${encodeURIComponent(code)}`;
}

export function tableView(app) {
  const tb = app.table;
  const s = tb.state;
  if (tb.status === 'gone') {
    return `<main class="gone"><p>${esc(t('tableGone'))}</p><button class="btn primary" data-act="home">${esc(t('back'))}</button></main>`;
  }
  const head = `
    <header class="tbar">
      <button class="btn ghost icon" data-act="home" aria-label="${esc(t('back'))}">‹</button>
      <button class="code-chip" data-act="invite" aria-label="${esc(t('invite'))}">${esc(tb.code)}</button>
      ${s?.opts?.public ? `<span class="pub-chip" title="${esc(t('publicOn'))}">🌐</span>` : ''}
      ${tb.status !== 'open' ? `<span class="conn">${esc(t('reconnecting'))}</span>` : '<span class="grow-sp"></span>'}
      <button class="btn sm" data-act="invite">${esc(t('invite'))}</button>
      <button class="btn ghost icon" data-act="settingsOpen" data-v="table" aria-label="${esc(t('settings'))}" title="${esc(t('settings'))}">⚙</button>
      <button class="btn ghost icon menu-btn" data-act="drawer" aria-label="${esc(t('menu'))}" aria-expanded="${!!app.ui.drawer}">☰</button>
    </header>`;
  if (!s) return `<div class="screen">${head}<main class="felt-wrap"><div class="felt"><div class="center"><div class="center-msg">…</div></div></div></main></div>`;
  const gv = GAME_VIEWS[s.game];
  return `
  <div class="screen ${app.ui.drawer ? 'drawer-open' : ''}">
    ${head}
    <div class="body">
      <main class="play">
        <div class="felt-wrap"><div class="felt">
          ${seatsHtml(app, gv)}
          <div class="center">${gv.center(app)}</div>
        </div></div>
        <section class="dock">${gv.dock(app)}<p class="note">${esc(t('footer'))}</p></section>
      </main>
      <aside class="side" aria-label="${esc(t('menu'))}">${sideHtml(app, gv)}</aside>
      <button class="scrim" data-act="drawer" aria-label="${esc(t('close'))}" tabindex="-1"></button>
    </div>
    ${app.ui.invite ? inviteHtml(app) : ''}
  </div>`;
}

function seatsHtml(app, gv) {
  const s = app.table.state;
  const total = s.seats.length;
  const me = s.you.seat;
  const base = me >= 0 ? me : 0;
  const h = s.hand;
  const turnMs = (h?.phase === 'dealer' ? 2 : 1) * s.opts.turnSeconds * 1000;
  // Seated: spread the occupied seats evenly (you at the bottom) and hide empty chairs.
  // Spectating: show every chair so you can pick one.
  const order = [];
  for (let k = 0; k < total; k++) {
    const i = (base + k) % total;
    if (me < 0 || s.seats[i]) order.push(i);
  }
  const n = Math.max(order.length, 2);
  return order
    .map((i, d) => {
      const seat = s.seats[i];
      const ang = Math.PI / 2 + (d * 2 * Math.PI) / n;
      const x = 50 + 43 * Math.cos(ang);
      const y = 50 + 41 * Math.sin(ang);
      const style = `left:${x.toFixed(2)}%;top:${y.toFixed(2)}%`;
      if (!seat) {
        const canSit = me < 0;
        return `<div class="seat empty" style="${style}">${canSit ? `<button class="sit-btn" data-act="sit" data-seat="${i}" aria-label="${esc(t('sit'))}">＋</button>` : '<span class="empty-dot"></span>'}</div>`;
      }
      const isMe = i === me;
      const isTurn = h && h.phase !== 'done' && h.turn === i;
      const flags = [isMe ? 'me' : '', isTurn ? 'turn' : '', seat.online ? '' : 'off', h?.dealer === i ? 'is-dealer' : ''].join(' ');
      return `<div class="seat ${flags}" style="${style}" data-seat="${i}">
        <div class="avatar ${seat.bot ? 'bot' : ''}">${initials(seat.nick)}${isTurn ? ringHtml(h.deadline, turnMs, app.skew) : ''}</div>
        <div class="who"><b>${isMe ? esc(t('you')) : esc(seat.nick)}</b><span class="chips ${seat.chips < 0 ? 'down' : ''}">${fmt(seat.chips)}</span></div>
        ${!seat.online && !seat.bot ? `<span class="tag">${esc(t('offline'))}</span>` : ''}
        <div class="seat-x">${gv.seat(app, i, isMe)}</div>
      </div>`;
    })
    .join('');
}

const TABS = ['players', 'board', 'history', 'fairness', 'settings'];

function sideHtml(app, gv) {
  const tab = app.ui.tab || 'players';
  return `
    <nav class="tabs" role="tablist">${TABS.map(
      (k) => `<button role="tab" class="tab ${k === tab ? 'on' : ''}" aria-selected="${k === tab}" data-act="tab" data-v="${k}">${esc(t(k))}</button>`,
    ).join('')}<button class="tab close-x" data-act="drawer" aria-label="${esc(t('close'))}">✕</button></nav>
    <div class="tab-body">${
      tab === 'players'
        ? playersTab(app)
        : tab === 'board'
          ? boardTab(app)
          : tab === 'history'
            ? historyTab(app)
            : tab === 'fairness'
              ? fairnessTab(app)
              : settingsTab(app, gv)
    }</div>`;
}

function playersTab(app) {
  const s = app.table.state;
  const host = s.you.isHost;
  const rows = s.seats
    .map((p, i) => {
      if (!p) return '';
      const isMe = i === s.you.seat;
      const ctl = host && !isMe ? `<button class="btn xs ghost" data-act="${p.bot ? 'removeBot' : 'kick'}" data-seat="${i}">${esc(t(p.bot ? 'removeBot' : 'kick'))}</button>` : '';
      return `<li><span class="dot ${p.online ? 'on' : ''}"></span><b>${esc(p.nick)}</b>${p.pid === s.hostPid ? ` <small>${esc(t('host'))}</small>` : ''}${p.bot ? ' <small>bot</small>' : ''}<span class="grow-sp"></span><span class="num">${fmt(p.chips)}</span>${ctl}</li>`;
    })
    .join('');
  return `<ul class="list">${rows}</ul>
    <div class="row">
      ${s.you.seat >= 0 ? `<button class="btn sm" data-act="stand">${esc(t('stand'))}</button>` : `<button class="btn sm primary" data-act="sit">${esc(t('sit'))}</button>`}
      ${host ? `<button class="btn sm" data-act="addBot">${esc(t('addBot'))}</button>` : ''}
    </div>
    ${
      host
        ? `<form class="row" data-submit="rebuy"><input id="rebuyAmt" data-keep type="number" min="1" max="1000000" value="${s.opts.startChips}" aria-label="${esc(t('rebuy'))}"><button class="btn sm" type="submit">${esc(t('rebuy'))}</button></form>`
        : ''
    }`;
}

function boardTab(app) {
  const b = app.table.state.board;
  if (!b.length) return `<p class="muted">—</p>`;
  return `<ol class="list board">${b
    .map((r) => `<li><b>${esc(r.nick)}</b><span class="grow-sp"></span><span class="num ${r.net > 0 ? 'up' : r.net < 0 ? 'down' : ''}">${esc(signed(r.net))}</span></li>`)
    .join('')}</ol>`;
}

function historyTab(app) {
  const items = app.table.history;
  if (!items) return `<p class="muted">…</p>`;
  if (!items.length) return `<p class="muted">${esc(t('noHistory'))}</p>`;
  return `<button class="btn sm" data-act="exportCsv">${esc(t('exportCsv'))}</button>
    <ul class="hist">${items
      .slice(0, 30)
      .map(
        (it) => `<li><div class="hist-h">${esc(t('hand'))} #${it.n} · ${esc(new Date(it.at).toLocaleTimeString())}</div>
        ${it.game === 'holdem' && it.rows[0]?.board?.length ? `<div class="hist-board">${it.rows[0].board.map((c) => cardHtml(c, { size: 'xs' })).join('')}</div>` : ''}
        ${it.rows
          .map(
            (r) => `<div class="hist-r"><span>${r.role === 'dealer' ? `<b>${esc(t('dealer'))}</b> ` : r.role === 'winner' ? `<b>${esc(it.game === 'tienlen' ? t('tl_first') : t('win'))}</b> ` : ''}${esc(r.nick)}</span>
            <span class="hist-cards">${r.cards.map((c) => cardHtml(c, { size: 'xs' })).join('')}</span>
            <span class="muted">${esc((GAME_VIEWS[it.game] || GAME_VIEWS.xidach).kindLabel({ kind: r.kind, total: r.total }))}</span>
            <span class="num ${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}">${esc(signed(r.delta))}</span></div>`,
          )
          .join('')}</li>`,
      )
      .join('')}</ul>`;
}

function fairnessTab(app) {
  const f = app.table.state.fair;
  const v = app.ui.verify;
  return `<p class="small">${esc(t('fairExplain'))}</p>
    ${f.commit ? `<p class="small"><b>${esc(t('commit'))}</b> (${esc(t('hand'))} #${app.table.state.handNo})<br><code class="hash">${esc(f.commit)}</code></p>` : ''}
    ${
      f.last
        ? `<p class="small"><b>${esc(t('lastHand'))} #${f.last.handNo}</b><br>${esc(t('commit'))}: <code class="hash">${esc(f.last.commit)}</code><br>
            ${esc(t('seed'))}: <code class="hash">${esc(f.last.seed)}</code></p>
           <button class="btn sm" data-act="verify">${esc(t('verify'))}</button>
           ${v && v.handNo === f.last.handNo ? `<span class="${v.ok ? 'up' : 'down'}">${esc(v.ok ? t('verified') : t('notVerified'))}</span>` : ''}`
        : ''
    }`;
}

function settingsTab(app, gv) {
  const s = app.table.state;
  const personal = `
    <div class="row">
      <button class="btn sm" data-act="settingsOpen" data-v="table">⚙ ${esc(t('look'))}</button>
      <button class="btn sm" data-act="learnOpen" data-game="${esc(s.game)}">🎓 ${esc(t('learn_open'))}</button>
    </div>`;
  if (!s.you.isHost) return personal;
  return `${personal}
    <button class="btn sm ${s.opts.public ? 'primary' : ''}" data-act="togglePublic" aria-pressed="${!!s.opts.public}">🌐 ${esc(t('publicOpt'))}: ${esc(s.opts.public ? t('on') : t('off'))}</button>
    <h3>${esc(t('tableSettings'))}</h3>
    <form id="settingsForm" class="opt-grid" data-submit="saveSettings">
      <label class="field"><span>${esc(t('turnSeconds'))}</span><input id="s-turnSeconds" data-keep type="number" min="10" max="120" value="${s.opts.turnSeconds}"></label>
      ${gv.options(s.opts.game, 's-')}
      <button class="btn primary" type="submit">${esc(t('save'))}</button>
    </form>
    <button class="btn danger sm" data-act="deleteTable">${esc(t('deleteTable'))}</button>`;
}

function inviteHtml(app) {
  const url = tableUrl(app.table.code);
  return `<div class="overlay" data-ov="invite" data-act="inviteClose">
    <div class="sheet invite" role="dialog" aria-modal="true" aria-label="${esc(t('invite'))}" data-stop>
      <div class="invite-code">${esc(app.table.code)}</div>
      <div class="qr">${qrSvg(url)}</div>
      <div class="invite-url">${esc(url)}</div>
      <div class="row centered">
        <button class="btn" data-act="copyLink">${esc(app.ui.copied ? t('copied') : t('copy'))}</button>
        ${navigator.share ? `<button class="btn" data-act="shareLink">${esc(t('share'))}</button>` : ''}
        <button class="btn" data-act="fullscreen">${esc(t('fullscreen'))}</button>
        <button class="btn primary" data-act="inviteClose">${esc(t('close'))}</button>
      </div>
    </div></div>`;
}
