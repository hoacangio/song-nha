import { esc } from '../lib/esc.js';
import { t } from '../lib/i18n.js';
import { ELEMENTS, ACCENT_GROUPS, menhOf, affinity, elementOfAccent } from '../domain/fengshui.js';

/** Dark / light segmented toggle. */
export function themeToggle(app) {
  return `<div class="seg" role="radiogroup" aria-label="${esc(t('theme'))}">
        <button role="radio" aria-checked="${app.theme !== 'light'}" class="seg-b ${app.theme !== 'light' ? 'on' : ''}" ${app.theme === 'light' ? 'data-act="toggleTheme"' : ''}>${esc(t('themeDark'))}</button>
        <button role="radio" aria-checked="${app.theme === 'light'}" class="seg-b ${app.theme === 'light' ? 'on' : ''}" ${app.theme !== 'light' ? 'data-act="toggleTheme"' : ''}>${esc(t('themeLight'))}</button>
      </div>`;
}

/** Ngũ hành accent palette with mệnh hints for the player's birth year. */
export function fengshuiPicker(app) {
  const menh = menhOf(app.birthYear);
  const label = (el) => t(`el_${el}`);
  const mark = { sinh: `★ ${t('fs_sinh')}`, hop: `✓ ${t('fs_hop')}`, khac: t('fs_khac'), neutral: '' };
  return `
    <div class="look">
      <form class="menh-row" data-submit="setBirthYear">
        <label for="birthYear">${esc(t('fs_year'))}</label>
        <input id="birthYear" data-keep type="number" inputmode="numeric" min="1900" max="2100" placeholder="1990" value="${app.birthYear ?? ''}">
        <button class="btn sm" type="submit">${esc(t('fs_check'))}</button>
        ${menh ? `<span>${esc(menh.canChi)} · ${esc(t('fs_menh'))} <b>${esc(label(menh.element))}</b></span>` : ''}
      </form>
      <div class="elements" role="radiogroup" aria-label="${esc(t('accent'))}">
        ${ELEMENTS.map((el) => {
          const a = affinity(menh?.element, el);
          return `<div class="el-row ${a}">
            <span class="el-name">${esc(label(el))}</span>
            <div class="swatches">
              ${ACCENT_GROUPS[el]
                .map(
                  (id) =>
                    `<button class="swatch ${app.accent === id ? 'on' : ''}" role="radio" aria-checked="${app.accent === id}" data-act="setAccent" data-v="${id}" title="${esc(t(`accent_${id}`))}" aria-label="${esc(t(`accent_${id}`))}"></button>`,
                )
                .join('')}
              ${mark[a] ? `<span class="mark">${esc(mark[a])}</span>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="look-name muted small">${esc(t('accent'))}: ${esc(t(`accent_${app.accent}`))} · ${esc(label(elementOfAccent(app.accent)))}${menh ? ` — <span>${esc(t('fs_note'))}</span>` : ''}</div>
    </div>`;
}

export const TABLE_THEMES = ['vegas', 'macau', 'phuquoc', 'cambodia'];

/** Casino table theme tiles; each tile previews its own felt via a local data-table attribute. */
export function tablePicker(app) {
  return `<div class="tables" role="radiogroup" aria-label="${esc(t('tableTheme'))}">
    ${TABLE_THEMES.map(
      (id) => `<button class="table-pick ${app.tableTheme === id ? 'on' : ''}" role="radio" aria-checked="${app.tableTheme === id}"
        data-act="setTable" data-v="${id}" data-table="${id}"><span class="mini-felt" aria-hidden="true"><span class="card back sm"></span><span class="card back sm"></span></span>${esc(t(`table_${id}`))}</button>`,
    ).join('')}
  </div>`;
}

/** Sound toggle + volume slider. */
export function soundRow(app) {
  return `<div class="sound-row">
    <button class="btn sm ${app.sound ? 'primary' : ''}" data-act="toggleSound" aria-pressed="${!!app.sound}">${esc(t('sound'))}: ${app.sound ? 'ON' : 'OFF'}</button>
    <input id="volume" type="range" min="0" max="1" step="0.05" value="${app.volume}" aria-label="${esc(t('volume'))}" ${app.sound ? '' : 'disabled'}>
  </div>`;
}

const SETTINGS_TABS = ['table', 'colors', 'sound'];

/** Settings sheet (look, colours, sound, language) — each tab fits one screen. */
export function settingsView(app) {
  const tab = SETTINGS_TABS.includes(app.ui.settings) ? app.ui.settings : 'table';
  let body = '';
  if (tab === 'table') {
    body = `<div class="look-label">${esc(t('tableTheme'))}</div>${tablePicker(app)}
      <div class="look-label">${esc(t('theme'))}</div>${themeToggle(app)}`;
  } else if (tab === 'colors') {
    body = fengshuiPicker(app);
  } else {
    body = `<div class="look-label">${esc(t('sound'))}</div>${soundRow(app)}
      <div class="look-label">${esc(t('language'))}</div>
      <div class="seg" role="radiogroup" aria-label="${esc(t('language'))}">
        <button role="radio" aria-checked="${app.lang === 'vi'}" class="seg-b ${app.lang === 'vi' ? 'on' : ''}" ${app.lang === 'vi' ? '' : 'data-act="setLang" data-v="vi"'}>Tiếng Việt</button>
        <button role="radio" aria-checked="${app.lang === 'en'}" class="seg-b ${app.lang === 'en' ? 'on' : ''}" ${app.lang === 'en' ? '' : 'data-act="setLang" data-v="en"'}>English</button>
      </div>`;
  }
  return `<div class="overlay" data-ov="settings" data-act="settingsClose">
    <div class="sheet settings" role="dialog" aria-modal="true" aria-label="${esc(t('settings'))}" data-stop>
      <div class="learn-head"><h2>⚙ ${esc(t('settings'))}</h2><button class="btn ghost icon" data-act="settingsClose" aria-label="${esc(t('close'))}">✕</button></div>
      <nav class="tabs" role="tablist">${SETTINGS_TABS.map(
        (k) => `<button role="tab" class="tab ${k === tab ? 'on' : ''}" aria-selected="${k === tab}" data-act="settingsOpen" data-v="${k}">${esc(t(`set_${k}`))}</button>`,
      ).join('')}</nav>
      <div class="settings-body look">${body}</div>
    </div></div>`;
}
