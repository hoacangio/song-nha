import { esc } from '../lib/esc.js';
import { t } from '../lib/i18n.js';
import { GAME_VIEWS } from './games.js';
import { lookPicker } from '../ui/accent.js';

const GAMES = [
  { id: 'xidach', icon: '21', ready: true },
  { id: 'tienlen', icon: '2♠', ready: true },
  { id: 'holdem', icon: 'A♥', ready: false },
];

const PAGE = 5;

export function homeView(app) {
  const h = app.home;
  const recent = app.recent;
  const pages = Math.max(1, Math.ceil(recent.length / PAGE));
  const page = Math.min(h.page, pages - 1);
  const shown = recent.slice(page * PAGE, page * PAGE + PAGE);
  return `
  <main class="home">
    <header class="home-head">
      <div class="brand"><span class="logo" aria-hidden="true">♠</span><h1>Sòng Nhà</h1></div>
      <div class="head-tools">
        <button class="btn ghost sm" data-act="setLang" data-v="${app.lang === 'vi' ? 'en' : 'vi'}">${app.lang === 'vi' ? 'EN' : 'VI'}</button>
      </div>
    </header>
    <p class="tagline">${esc(t('tagline'))}</p>

    <section class="panel">
      <label class="field">
        <span>${esc(t('nickname'))}</span>
        <input id="nick" data-keep data-input="nick" maxlength="20" autocomplete="nickname" placeholder="${esc(t('nickPh'))}" value="${esc(app.nick)}">
      </label>
    </section>

    <section class="panel">
      <h2>${esc(t('chooseGame'))}</h2>
      <div class="games" role="radiogroup">
        ${GAMES.map(
          (g) => `<button class="game-pick ${h.game === g.id ? 'on' : ''}" role="radio" aria-checked="${h.game === g.id}"
             ${g.ready ? `data-act="setGame" data-v="${g.id}"` : 'disabled'}>
             <span class="gi">${esc(g.icon)}</span><span class="gn">${esc(t(g.id))}</span>
             ${g.ready ? '' : `<span class="soon">${esc(t('soon'))}</span>`}
           </button>`,
        ).join('')}
      </div>
      <details class="opts">
        <summary>${esc(t('options'))}</summary>
        <form id="createForm" class="opt-grid">
          <label class="field"><span>${esc(t('startChips'))}</span><input id="o-startChips" data-keep name="startChips" type="number" inputmode="numeric" min="100" max="1000000" step="100" value="1000"></label>
          <label class="field"><span>${esc(t('turnSeconds'))}</span><input id="o-turnSeconds" data-keep name="turnSeconds" type="number" inputmode="numeric" min="10" max="120" value="30"></label>
          ${GAME_VIEWS[h.game].options(null, 'o-')}
        </form>
      </details>
      <button class="btn primary block" data-act="createTable" ${app.busy ? 'disabled' : ''}>${esc(t('create'))}</button>
    </section>

    <section class="panel">
      <form class="join" data-submit="joinCode">
        <input id="joinCode" data-keep class="code-input" maxlength="12" autocapitalize="characters" autocomplete="off"
               spellcheck="false" placeholder="${esc(t('codePh'))}" aria-label="${esc(t('codePh'))}">
        <button class="btn" type="submit">${esc(t('join'))}</button>
      </form>
      ${h.error ? `<p class="error" role="alert">${esc(h.error)}</p>` : ''}
    </section>

    <section class="panel">
      <h2>${esc(t('recent'))}</h2>
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
          ${
            pages > 1
              ? `<div class="pager"><button class="btn ghost sm" data-act="page" data-v="${page - 1}" ${page === 0 ? 'disabled' : ''}>‹</button>
                 <span>${esc(t('page'))} ${page + 1}/${pages}</span>
                 <button class="btn ghost sm" data-act="page" data-v="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''}>›</button></div>`
              : ''
          }`
          : `<p class="muted">${esc(t('noRecent'))}</p>`
      }
    </section>
    <section class="panel">
      <h2>${esc(t('theme'))}</h2>
      ${lookPicker(app)}
    </section>
    ${app.installPrompt ? `<button class="btn ghost block" data-act="install">${esc(t('install'))}</button>` : ''}
    <footer class="foot">${esc(t('footer'))}</footer>
  </main>`;
}
