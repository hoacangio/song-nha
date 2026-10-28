// Playing cards drawn with HTML/CSS (no images, no third-party card art).
import { isCard, isRed, rankLabel, suitGlyph } from '../domain/cards.js';
import { oneShot } from '../lib/motion.js';
import { esc } from '../lib/esc.js';
import { getLang } from '../lib/i18n.js';

/** Tichu's four special cards: corner mark, centre glyph, names. */
const SPECIAL = {
  MJ: { mark: '1', glyph: '雀', vi: 'Mạt chược', en: 'Mah Jong' },
  DG: { mark: '0', glyph: '犬', vi: 'Chó', en: 'Dog' },
  PH: { mark: '½', glyph: '鳳', vi: 'Phượng', en: 'Phoenix' },
  DR: { mark: '★', glyph: '龍', vi: 'Rồng', en: 'Dragon' },
};
export const specialName = (c) => SPECIAL[c]?.[getLang() === 'en' ? 'en' : 'vi'] ?? '';

const backKeys = new Set();

/**
 * @param {string|null} card card id, or null for a face-down card
 * @param {{key?:string, size?:'sm'|'md'|'lg', deal?:number, extra?:string, tap?:string}} o
 *   tap   – action name: the card becomes a button with data-act=tap data-card=<id>
 *   key   – stable identity used for one-shot deal/flip animations
 *   deal  – stagger (ms) for the deal animation
 */
export function cardHtml(card, { key = '', size = 'md', deal = 0, extra = '', tap = '' } = {}) {
  let anim = { cls: '', style: '' };
  if (key) {
    // A card first rendered face-down and later face-up flips once; otherwise it is dealt once.
    if (card && backKeys.has(key)) anim = oneShot(`${key}:flip`, 'flip', 450);
    else anim = oneShot(key, 'deal', 380, deal);
    if (!card) backKeys.add(key);
  }
  if (card && SPECIAL[card]) {
    const sp = SPECIAL[card];
    const tag = tap ? 'button' : 'div';
    const act = tap ? ` type="button" data-act="${esc(tap)}" aria-pressed="${extra.includes('sel')}"` : '';
    return (
      `<${tag} class="card special sp-${card} ${size} ${anim.cls} ${extra}" style="${anim.style}" data-card="${card}" ` +
      `aria-label="${esc(specialName(card))}" title="${esc(specialName(card))}"${act}>` +
      `<span class="ci">${sp.mark}</span><span class="cs">${sp.glyph}</span></${tag}>`
    );
  }
  if (!card || !isCard(card)) {
    return `<div class="card back ${size} ${anim.cls} ${extra}" style="${anim.style}" aria-label="card"></div>`;
  }
  const r = rankLabel(card);
  const s = suitGlyph(card);
  const tag = tap ? 'button' : 'div';
  const act = tap ? ` type="button" data-act="${esc(tap)}" aria-pressed="${extra.includes('sel')}"` : '';
  return (
    `<${tag} class="card ${size} ${isRed(card) ? 'red' : ''} ${anim.cls} ${extra}" style="${anim.style}" ` +
    `data-card="${esc(card)}" aria-label="${esc(r + s)}"${act}>` +
    `<span class="ci">${esc(r)}<i>${s}</i></span><span class="cs">${s}</span></${tag}>`
  );
}

/** Countdown ring: CSS animation with a negative delay so re-renders keep its progress. */
export function ringHtml(deadline, totalMs, skew) {
  if (!deadline) return '';
  const now = Date.now() + skew;
  const left = Math.max(0, deadline - now);
  const elapsed = Math.max(0, totalMs - left);
  return (
    `<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-bg" cx="18" cy="18" r="16"/>` +
    `<circle class="ring-fg" cx="18" cy="18" r="16" pathLength="100" ` +
    `style="animation-duration:${totalMs}ms;animation-delay:-${elapsed}ms"/></svg>`
  );
}

export function initials(nick) {
  const parts = String(nick || '?').trim().split(/\s+/);
  const a = [...(parts[0] || '?')][0] || '?';
  const b = parts.length > 1 ? [...parts[parts.length - 1]][0] : '';
  return esc((a + (b || '')).toUpperCase());
}
