// Card model shared by client and server. A card id is two characters:
// rank (2-9, T, J, Q, K, A) + suit (S ♠, C ♣, D ♦, H ♥).
// Suit order S < C < D < H matches Tiến lên (♠ < ♣ < ♦ < ♥).

export const RANKS = '23456789TJQKA';
export const SUITS = 'SCDH';
export const SUIT_GLYPH = Object.freeze({ S: '♠', C: '♣', D: '♦', H: '♥' });
export const RANK_LABEL = Object.freeze({ T: '10' });

export const DECK = Object.freeze([...SUITS].flatMap((s) => [...RANKS].map((r) => r + s)));
const CARD_SET = new Set(DECK);

export const isCard = (c) => typeof c === 'string' && CARD_SET.has(c);
export const rankOf = (c) => c[0];
export const suitOf = (c) => c[1];
export const isRed = (c) => c[1] === 'D' || c[1] === 'H';
export const rankLabel = (c) => RANK_LABEL[c[0]] || c[0];
export const suitGlyph = (c) => SUIT_GLYPH[c[1]];

/** Validates a list of distinct card ids. */
export function isCardList(list, max = 52) {
  if (!Array.isArray(list) || list.length > max) return false;
  const seen = new Set();
  for (const c of list) {
    if (!isCard(c) || seen.has(c)) return false;
    seen.add(c);
  }
  return true;
}
