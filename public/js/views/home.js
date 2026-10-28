import { esc } from '../lib/esc.js';
import { t } from '../lib/i18n.js';
import { GAME_VIEWS } from './games.js';
import { cardHtml } from '../ui/cards.js';

const GAMES = [
  { id: 'xidach', icon: '21', ready: true },
  { id: 'tienlen', icon: '2♠', ready: true },
  { id: 'holdem', icon: 'A♥', ready: true },
];

/** Recent tables per page: fewer on short screens so the home page never scrolls. */
const pageSize = () => (typeof innerHeight === 'number' && innerHeight < 720 && innerWidth < 1024 ? 2 : 3);

export function homeView(app) {
  const h = app.home;
  const recent = app.recent;
  const PAGE = pageSize();
  const pages = Math.max(1, Math.ceil(recent.length / PAGE));
  const page = Math.min(h.page, pages - 1);
  const shown = recent.slice(page * PAGE, page * PAGE + PAGE);
  return `
  <main class="home">
    <header class="home-head">
      <div class="brand"><span class="logo" aria-hidden="true">♠</span><div><h1>Sòng Nhà</h1><p class="tagline">${esc(t('tagline'))}</p></div></div>
      <div class="head-tools">
        <button class="btn ghost sm" data-act="setLang" data-v="${app.lang === 'vi' ? 'en' : 'vi'}">${app.lang === 'vi' ? 'EN' : 'VI'}</button>
        <button class="btn ghost icon" data-act="settingsOpen" data-v="table" aria-label="${esc(t('settings'))}" title="${esc(t('settings'))}">⚙</button>
      </div>
    </header>

    <div class="home-grid">
    <section class="hero" aria-hidden="true">
      <div class="hero-felt">
        <div class="hero-cards">${['AS', 'KH', 'QD', 'JC', 'TS'].map((c) => cardHtml(c, { size: 'lg' })).join('')}</div>
        <div class="hero-text"><b>${esc(t(h.game))}</b><span>${esc(t(`meta_${h.game}`))}</span></div>
      </div>
    </section>

    <section class="panel create">
      <label class="field">
        <span>${esc(t('nickname'))}</span>
        <input id="nick" data-keep data-input="nick" maxlength="20" autocomplete="nickname" placeholder="${esc(t('nickPh'))}" value="${esc(app.nick)}">
      </label>
      <h2>${esc(t('chooseGame'))}</h2>
      <div class="games" role="radiogroup">
        ${GAMES.map(
          (g) => `<button class="game-pick ${h.game === g.id ? 'on' : ''}" role="radio" aria-checked="${h.game === g.id}"
             ${g.ready ? `data-act="setGame" data-v="${g.id}"` : 'disabled'}>
             <span class="gi">${esc(g.icon)}</span><span class="gn">${esc(t(g.id))}</span><span class="gm">${esc(t(`meta_${g.id}`))}</span>
             ${g.ready ? '' : `<span class="soon">${esc(t('soon'))}</span>`}
           </button>`,
        ).join('')}
      </div>
      <div class="create-row">
        <button class="btn" data-act="rulesOpen">⚙ ${esc(t('options'))}${h.draft?.[h.game] && Object.keys(h.draft[h.game]).length ? ' •' : ''}</button>
        <button class="btn learn-btn" data-act="learnOpen" data-game="${h.game}" title="${esc(t('learn_open'))}" aria-label="${esc(t('learn_open'))}">🎓<span class="learn-txt"> ${esc(t('learn_short'))}</span></button>
        <button class="btn primary grow" data-act="createTable" ${app.busy ? 'disabled' : ''}>${esc(t('create'))}</button>
      </div>
    </section>

    <div class="side-col">
    <section class="panel">
      <h2 class="join-h">${esc(t('join'))}</h2>
      <form class="join" data-submit="joinCode">
        <input id="joinCode" data-keep class="code-input" maxlength="12" autocapitalize="characters" autocomplete="off"
               spellcheck="false" placeholder="${esc(t('codePh'))}" aria-label="${esc(t('codePh'))}">
        <button class="btn icon random-btn" type="button" data-act="joinRandom" title="${esc(t('randomJoin'))}" aria-label="${esc(t('randomJoin'))}" ${app.busy ? 'disabled' : ''}>🎲</button>
        <button class="btn" type="submit">${esc(t('join'))}</button>
      </form>
      ${h.error ? `<p class="error" role="alert">${esc(h.error)}</p>` : ''}
    </section>

    <section class="panel">
      <div class="recent-head"><h2>${esc(t('recent'))}</h2>${
        pages > 1
          ? `<div class="pager"><button class="btn ghost sm" data-act="page" data-v="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="‹">‹</button>
             <span>${page + 1}/${pages}</span>
             <button class="btn ghost sm" data-act="page" data-v="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''} aria-label="›">›</button></div>`
          : ''
      }</div>
      ${
        shown.length
          ? `<ul class="recent">${shown
              .map(
                (r) => `<li>
            <button class="recent-open" data-act="openTable" data-code="${esc(r.code)}">
              <b>${esc(r.code)}</b><span>${esc(t(r.game) || r.game)}${r.host ? ` · ${esc(t('host'))}` : ''}</span>
            </button>
            ${r.host ? `<button class="btn ghost sm" data-act="deleteRecent" data-code="${esc(r.code)}">${esc(t('delete'))}</button>` : `<button class="btn ghost sm" data-act="forgetRecent" data-code="${esc(r.code)}" aria-label="${esc(t('delete'))}">✕</button>`}
          </li>`,
              )
              .join('')}</ul>
`
          : `<p class="muted">${esc(t('noRecent'))}</p>`
      }
    </section>
    </div>
    </div>
    ${app.installPrompt ? `<button class="btn ghost block" data-act="install">${esc(t('install'))}</button>` : ''}
    <footer class="foot">${esc(t('footer'))}</footer>
  </main>`;
}

/** Fields of the "rules / options" sheet for the selected game (values restored from the draft). */
export function rulesFields(app) {
  const h = app.home;
  return `<label class="field"><span>${esc(t('startChips'))}</span><input id="o-startChips" data-keep type="number" inputmode="numeric" min="100" max="1000000" step="100" value="1000"></label>
    <label class="field"><span>${esc(t('turnSeconds'))}</span><input id="o-turnSeconds" data-keep type="number" inputmode="numeric" min="10" max="120" value="30"></label>
    <label class="check"><input id="o-public" data-keep type="checkbox"> 🌐 ${esc(t('publicOpt'))}</label>
    ${GAME_VIEWS[h.game].options(null, 'o-')}`;
}

/** Option groups shown as tabs in the rules sheet (fieldset[data-g]); the rest is "general". */
export const RULE_GROUPS = { xidach: ['payouts'], tienlen: ['chop', 'instant', 'points'], holdem: [] };

export function rulesView(app) {
  const h = app.home;
  const groups = RULE_GROUPS[h.game] || [];
  const tab = ['general', ...groups].includes(app.ui.rulesTab) ? app.ui.rulesTab : 'general';
  const tabs = groups.length
    ? `<nav class="tabs" role="tablist">${['general', ...groups]
        .map((g) => `<button role="tab" class="tab ${g === tab ? 'on' : ''}" aria-selected="${g === tab}" data-act="rulesTab" data-v="${g}">${esc(t(`rg_${g}`))}</button>`)
        .join('')}</nav>`
    : '';
  return `<div class="overlay" data-ov="rules" data-act="rulesClose">
    <div class="sheet rules ${groups.length ? 'tabbed' : ''}" role="dialog" aria-modal="true" aria-label="${esc(t('options'))}" data-stop>
      <div class="learn-head"><h2>${esc(t('options'))} · ${esc(t(h.game))}</h2><button class="btn ghost icon" data-act="rulesClose" aria-label="${esc(t('close'))}">✕</button></div>
      ${tabs}
      <form id="createForm" class="opt-grid rules-grid" data-tab="${tab}">${rulesFields(app)}</form>
      <div class="row">
        <button class="btn" data-act="rulesReset">${esc(t('reset'))}</button>
        <button class="btn primary grow" data-act="rulesClose">${esc(t('save'))}</button>
      </div>
    </div></div>`;
}

/** Asks for the player's name (shown at tables and printed on certificates). */
export function askNameView(app) {
  return `<div class="overlay" data-ov="name">
    <form class="sheet ask-name" role="dialog" aria-modal="true" aria-label="${esc(t('askNameTitle'))}" data-submit="askNameSave" data-stop>
      <h2>${esc(t('askNameTitle'))}</h2>
      <p class="small muted">${esc(t('askNameHelp'))}</p>
      <input id="askName" data-keep maxlength="20" autocomplete="nickname" placeholder="${esc(t('nickPh'))}" value="">
      <div class="row">
        <button class="btn" type="button" data-act="askNameGuest">${esc(t('askNameGuest'))}</button>
        <button class="btn primary grow" type="submit">${esc(t('askNameSave'))}</button>
      </div>
    </form></div>`;
}
