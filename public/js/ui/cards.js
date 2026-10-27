// Playing cards drawn with HTML/CSS (no images, no third-party card art).
import { isCard, isRed, rankLabel, suitGlyph } from '../domain/cards.js';
import { oneShot } from '../lib/motion.js';
import { esc } from '../lib/esc.js';

const backKeys = new Set();

/**
 * @param {string|null} card card id, or null for a face-down card
 * @param {{key?:string, size?:'sm'|'md'|'lg', deal?:number, extra?:string}} o
 *   key   – stable identity used for one-shot deal/flip animations
 *   deal  – stagger (ms) for the deal animation
 */
export function cardHtml(card, { key = '', size = 'md', deal = 0, extra = '' } = {}) {
  let anim = { cls: '', style: '' };
  if (key) {
    // A card first rendered face-down and later face-up flips once; otherwise it is dealt once.
    if (card && backKeys.has(key)) anim = oneShot(`${key}:flip`, 'flip', 450);
    else anim = oneShot(key, 'deal', 380, deal);
    if (!card) backKeys.add(key);
  }
  if (!card || !isCard(card)) {
    return `<div class="card back ${size} ${anim.cls} ${extra}" style="${anim.style}" aria-label="card"></div>`;
  }
  const r = rankLabel(card);
  const s = suitGlyph(card);
  return (
    `<div class="card ${size} ${isRed(card) ? 'red' : ''} ${anim.cls} ${extra}" style="${anim.style}" ` +
    `data-card="${esc(card)}" aria-label="${esc(r + s)}">` +
    `<span class="ci">${esc(r)}<i>${s}</i></span><span class="cs">${s}</span></div>`
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
