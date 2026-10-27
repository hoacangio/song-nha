import { esc } from '../lib/esc.js';
import { t } from '../lib/i18n.js';

const ACCENT_IDS = ['terracotta', 'amber', 'vermilion', 'coral', 'rose', 'gold'];

/** Theme toggle + warm accent swatches (used on the home screen and in table settings). */
export function lookPicker(app) {
  return `
    <div class="look">
      <div class="seg" role="radiogroup" aria-label="${esc(t('theme'))}">
        <button role="radio" aria-checked="${app.theme !== 'light'}" class="seg-b ${app.theme !== 'light' ? 'on' : ''}" ${app.theme === 'light' ? 'data-act="toggleTheme"' : ''}>${esc(t('themeDark'))}</button>
        <button role="radio" aria-checked="${app.theme === 'light'}" class="seg-b ${app.theme === 'light' ? 'on' : ''}" ${app.theme !== 'light' ? 'data-act="toggleTheme"' : ''}>${esc(t('themeLight'))}</button>
      </div>
      <div class="swatches" role="radiogroup" aria-label="${esc(t('accent'))}">
        ${ACCENT_IDS.map(
          (id) =>
            `<button class="swatch ${app.accent === id ? 'on' : ''}" role="radio" aria-checked="${app.accent === id}" data-act="setAccent" data-v="${id}" title="${esc(t(`accent_${id}`))}" aria-label="${esc(t(`accent_${id}`))}"></button>`,
        ).join('')}
      </div>
      <div class="look-name muted small">${esc(t('accent'))}: ${esc(t(`accent_${app.accent}`))}</div>
    </div>`;
}
