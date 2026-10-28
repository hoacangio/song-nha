// Card backs follow the table theme but must always stand out: checks the colour tokens in app.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../public/css/app.css', import.meta.url), 'utf8');
const THEMES = ['vegas', 'macau', 'phuquoc', 'cambodia'];

function tokens(theme) {
  const start = css.indexOf(`[data-table='${theme}'] {`);
  assert.ok(start > 0, `theme ${theme} block`);
  const block = css.slice(start, css.indexOf('\n}', start));
  const get = (name) => block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  return { felt: get('felt'), feltHi: get('felt-hi'), a: get('cb-a'), b: get('cb-b'), ink: get('cb-ink'), paper: get('cb-paper') || '#fffaf3', emblem: /--cb-emblem:\s*'[^']+'/.test(block) };
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (x, y) => {
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};
// OKLab distance: perceptual difference that counts hue and lightness together.
function oklab(hex) {
  const [r, g, b] = rgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const dE = (x, y) => Math.hypot(...oklab(x).map((v, i) => v - oklab(y)[i]));

for (const theme of THEMES) {
  test(`card back for ${theme}: themed, and readable on its felt`, () => {
    const k = tokens(theme);
    for (const [name, v] of Object.entries(k)) if (name !== 'emblem') assert.ok(v, `${theme}: --${name} defined`);
    assert.ok(k.emblem, `${theme}: has its own emblem`);
    // 1) the paper frame separates the card from the felt (WCAG non-text contrast 3:1)
    for (const f of [k.felt, k.feltHi]) assert.ok(contrast(k.paper, f) >= 3, `${theme}: frame vs felt ${contrast(k.paper, f).toFixed(2)}`);
    // 2) the back colour itself does not blend into the felt
    for (const f of [k.felt, k.feltHi]) assert.ok(dE(k.a, f) >= 0.15, `${theme}: back vs felt ΔE ${dE(k.a, f).toFixed(3)}`);
    // 3) the emblem/motif ink is readable on the back
    for (const c of [k.a, k.b]) assert.ok(contrast(k.ink, c) >= 3, `${theme}: ink vs back ${contrast(k.ink, c).toFixed(2)}`);
  });
}

test('every theme has a different card back', () => {
  const backs = THEMES.map((t) => tokens(t).a);
  assert.equal(new Set(backs).size, THEMES.length);
});
