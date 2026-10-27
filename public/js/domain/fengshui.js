// Ngũ hành colour palette and nạp âm element by birth year (lunar year; for fun only).

export const ELEMENTS = ['kim', 'moc', 'thuy', 'hoa', 'tho'];

/** Accent colours grouped by element. The first id of the palette is the default. */
export const ACCENT_GROUPS = Object.freeze({
  kim: ['kim-gold', 'kim-silver'],
  moc: ['moc-jade', 'moc-leaf'],
  thuy: ['thuy-ocean', 'thuy-indigo'],
  hoa: ['terracotta', 'hoa-red', 'hoa-pink'],
  tho: ['tho-ochre', 'tho-brown'],
});
export const ACCENTS = Object.freeze(ELEMENTS.flatMap((e) => ACCENT_GROUPS[e]));
export const DEFAULT_ACCENT = 'terracotta';
export const elementOfAccent = (id) => ELEMENTS.find((e) => ACCENT_GROUPS[e].includes(id)) ?? null;

/** Accent ids from earlier versions → nearest new colour. */
export const LEGACY_ACCENTS = Object.freeze({ amber: 'tho-ochre', vermilion: 'hoa-red', coral: 'terracotta', rose: 'hoa-pink', gold: 'kim-gold' });
export function normalizeAccent(id) {
  if (ACCENTS.includes(id)) return id;
  return LEGACY_ACCENTS[id] ?? DEFAULT_ACCENT;
}

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const CHI_VALUE = [0, 0, 1, 1, 2, 2, 0, 0, 1, 1, 2, 2];
const SUM_TO_ELEMENT = { 1: 'kim', 2: 'thuy', 3: 'hoa', 4: 'tho', 5: 'moc' };

/** Generating cycle: X sinh GEN[X]. */
export const GENERATES = Object.freeze({ tho: 'kim', kim: 'thuy', thuy: 'moc', moc: 'hoa', hoa: 'tho' });
/** Overcoming cycle: X khắc OVERCOMES[X]. */
export const OVERCOMES = Object.freeze({ kim: 'moc', moc: 'tho', tho: 'thuy', thuy: 'hoa', hoa: 'kim' });

export const isBirthYear = (y) => Number.isInteger(y) && y >= 1900 && y <= 2100;

/**
 * Can Chi and nạp âm element of a (lunar) birth year.
 * Can value (Giáp/Ất 1 … Nhâm/Quý 5) + Chi value (Tý Sửu Ngọ Mùi 0, Dần Mão Thân Dậu 1, Thìn Tỵ Tuất Hợi 2),
 * minus 5 when above 5: 1 Kim, 2 Thủy, 3 Hỏa, 4 Thổ, 5 Mộc.
 */
export function menhOf(year) {
  if (!isBirthYear(year)) return null;
  const can = (((year - 4) % 10) + 10) % 10;
  const chi = (((year - 4) % 12) + 12) % 12;
  let sum = Math.floor(can / 2) + 1 + CHI_VALUE[chi];
  if (sum > 5) sum -= 5;
  return { canChi: `${CAN[can]} ${CHI[chi]}`, element: SUM_TO_ELEMENT[sum] };
}

/**
 * How an element's colours suit a person of element `menh`:
 * 'sinh' – the element that generates the mệnh (best), 'hop' – same element,
 * 'khac' – the element that overcomes the mệnh (avoid), otherwise 'neutral'.
 */
export function affinity(menh, element) {
  if (!menh) return 'neutral';
  if (GENERATES[element] === menh) return 'sinh';
  if (element === menh) return 'hop';
  if (OVERCOMES[element] === menh) return 'khac';
  return 'neutral';
}

/** Best accent for a birth year: first colour of the generating element. */
export function suggestedAccent(year) {
  const m = menhOf(year);
  if (!m) return null;
  const gen = ELEMENTS.find((e) => GENERATES[e] === m.element);
  return ACCENT_GROUPS[gen][0];
}
