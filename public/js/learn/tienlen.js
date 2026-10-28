// Course: Tiến lên miền Nam for beginners. Pure data + exam generator graded by the real rules.
import { detectCombo, canBeat, isChop, sortCards, TIENLEN_DEFAULTS, TL_RANKS, TL_SUITS } from '../domain/tienlen.js';
import { shuffled, pick, optionsWith, assemble } from './common.js';

const T = {
  vi: {
    title: 'Tiến lên miền Nam cơ bản',
    lessons: { order: 'Thứ tự lá', combos: 'Các bộ', turns: 'Lượt đánh', chop: 'Chặt heo', end: 'Kết thúc & điểm' },
    orderText: [
      ['Số', '3 nhỏ nhất → 4 → … → K → A → 2 (heo) lớn nhất.'],
      ['Chất', '♠ bích < ♣ chuồn < ♦ rô < ♥ cơ. Hai lá cùng số thì so chất.'],
      ['Ví dụ', '2♥ là lá lớn nhất; 3♠ là lá nhỏ nhất.'],
    ],
    combos: [
      ['Lẻ', ['7H'], '1 lá bất kỳ.'],
      ['Đôi', ['9S', '9D'], '2 lá cùng số.'],
      ['Sám (bộ ba)', ['QS', 'QC', 'QH'], '3 lá cùng số.'],
      ['Tứ quý', ['5S', '5C', '5D', '5H'], '4 lá cùng số.'],
      ['Sảnh', ['8C', '9D', 'TH', 'JS'], 'Từ 3 lá liên tiếp trở lên, không được có 2.'],
      ['Đôi thông', ['4S', '4H', '5C', '5D', '6S', '6H'], 'Từ 3 đôi liên tiếp trở lên, không có 2.'],
    ],
    turns: [
      ['Ván đầu', 'Ai có 3♠ đánh trước và phải đánh kèm lá 3♠. Các ván sau người thắng ván trước đánh trước.'],
      ['Chặn bài', 'Phải đánh cùng loại, cùng số lá và lá cao nhất lớn hơn (VD sảnh 3 lá chặn sảnh 3 lá).'],
      ['Bỏ lượt', 'Không chặn được hoặc không muốn thì bỏ lượt — ngồi ngoài tới hết vòng.'],
      ['Vòng mới', 'Khi mọi người khác đều bỏ, người đánh cuối được ra bài tự do.'],
    ],
    chop: [
      ['3 đôi thông', 'chặt được 1 con heo (một lá 2).'],
      ['Tứ quý', 'chặt được 1 heo, đôi heo và 3 đôi thông.'],
      ['4 đôi thông', 'chặt được heo, đôi heo, tứ quý và 3 đôi thông.'],
      ['Chặt chồng', 'Bộ chặt lớn hơn cùng loại chặt lại bộ chặt trước; tiền phạt cộng dồn.'],
      ['Tiền phạt', 'Bị chặt trả ngay: heo đen 5, heo đỏ 10, tứ quý 10, 3 đôi thông 5 điểm (chủ bàn có thể đổi).'],
    ],
    end: [
      ['Xếp hạng', 'Hết bài trước về Nhất, những người khác đánh tiếp tới Nhì, Ba; người cuối là Bét.'],
      ['Trả tiền', 'Bét trả Nhất, Ba trả Nhì (bàn 4 người).'],
      ['Cóng', 'Khi có người về Nhất mà bạn chưa đánh lá nào: bị cóng, xếp cuối và trả gấp đôi.'],
      ['Thối', 'Cuối ván còn heo, tứ quý, 3 đôi thông trên tay thì bị phạt thêm.'],
      ['Tới trắng', 'Vừa chia bài đã có sảnh rồng (3 → A), tứ quý 2, 5 đôi thông hoặc 6 đôi: thắng ngay.'],
    ],
    types: { single: 'Lẻ', pair: 'Đôi', triple: 'Sám', quad: 'Tứ quý', straight: 'Sảnh', pairseq: 'Đôi thông', invalid: 'Không phải bộ hợp lệ' },
    yes: 'Chặn được',
    no: 'Không chặn được',
    qType: 'Những lá này là bộ gì?',
    qBeat: 'Bài của bạn có chặn được bài trên bàn không?',
    qChop: 'Chặt heo: bộ của bạn có chặt được bài trên bàn không?',
    table: 'Trên bàn',
    yours: 'Bài của bạn',
    cards: 'Các lá',
    whyType: (x) => `Đây là: ${x}.`,
    whyBeat: (ok, a, b) => (ok ? `${b} chặn được ${a}.` : `${b} không chặn được ${a}: cần cùng loại, cùng số lá, lá cao nhất lớn hơn (hoặc đúng luật chặt heo).`),
    bank: [
      { q: 'Lá nào lớn nhất trong Tiến lên?', options: ['2♥', 'A♥', '2♠', 'K♥'], answer: 0, explain: '2 là lớn nhất, và ♥ là chất lớn nhất.' },
      { q: 'Ván đầu tiên ai đánh trước?', options: ['Người có 3♠', 'Chủ bàn', 'Người có 2♥', 'Người ngồi bên trái chủ bàn'], answer: 0, explain: 'Người có 3♠ đánh trước và phải đánh kèm lá đó.' },
      { q: 'Sảnh có được chứa lá 2 không?', options: ['Không', 'Có', 'Chỉ ở cuối sảnh', 'Chỉ khi có 2♥'], answer: 0, explain: 'Sảnh và đôi thông không được có 2.' },
      { q: 'Bỏ lượt rồi có được đánh lại trong cùng vòng không?', options: ['Không, chờ vòng mới', 'Có, bất cứ lúc nào', 'Có, nếu có heo', 'Chỉ chủ bàn'], answer: 0, explain: 'Bỏ lượt là ngồi ngoài tới khi vòng kết thúc.' },
      { q: 'Bị “cóng” nghĩa là gì?', options: ['Chưa đánh lá nào khi có người về Nhất', 'Còn heo trên tay', 'Bị chặt heo', 'Bỏ lượt 3 lần'], answer: 0, explain: 'Cóng: chưa ra được lá nào khi đã có người về Nhất.' },
    ],
  },
  en: {
    title: 'Tiến lên miền Nam basics',
    lessons: { order: 'Card order', combos: 'Combinations', turns: 'Turns', chop: 'Chopping 2s', end: 'End & scoring' },
    orderText: [
      ['Ranks', '3 lowest → 4 → … → K → A → 2 highest.'],
      ['Suits', '♠ < ♣ < ♦ < ♥. Same rank: the suit decides.'],
      ['Example', '2♥ is the highest card; 3♠ the lowest.'],
    ],
    combos: [
      ['Single', ['7H'], 'Any one card.'],
      ['Pair', ['9S', '9D'], 'Two of a rank.'],
      ['Triple', ['QS', 'QC', 'QH'], 'Three of a rank.'],
      ['Four of a kind', ['5S', '5C', '5D', '5H'], 'Four of a rank.'],
      ['Straight', ['8C', '9D', 'TH', 'JS'], '3+ consecutive ranks, no 2.'],
      ['Consecutive pairs', ['4S', '4H', '5C', '5D', '6S', '6H'], '3+ pairs in a row, no 2.'],
    ],
    turns: [
      ['First game', 'Whoever holds 3♠ leads and must include it. Later games: the previous winner leads.'],
      ['Beating', 'Same type, same number of cards, higher top card (a 3-card straight beats a 3-card straight).'],
      ['Passing', 'If you cannot or will not beat it, pass — you sit out until the round ends.'],
      ['New round', 'When everyone else has passed, the last player leads anything.'],
    ],
    chop: [
      ['3 pairs in a row', 'beat a single 2.'],
      ['Four of a kind', 'beats a single 2, a pair of 2s and 3 pairs in a row.'],
      ['4 pairs in a row', 'beat 2s, a pair of 2s, four of a kind and 3 pairs in a row.'],
      ['Chop back', 'A bigger chopper of the same shape beats a chopper; penalties add up.'],
      ['Penalty', 'The chopped player pays at once: black 2 = 5, red 2 = 10, quad = 10, 3 pairs = 5 points (host can change).'],
    ],
    end: [
      ['Ranking', 'The first player out is 1st; the others play on for 2nd, 3rd; the last is last.'],
      ['Payments', 'Last pays 1st, 3rd pays 2nd (4 players).'],
      ['Frozen (cóng)', 'If someone goes out before you played a card, you are frozen: last place, pay double.'],
      ['Leftovers', '2s, quads or 3 pairs still in hand at the end cost extra.'],
      ['Instant win', 'Dealt a dragon (3 → A), four 2s, 5 pairs in a row or six pairs: win at once.'],
    ],
    types: { single: 'Single', pair: 'Pair', triple: 'Triple', quad: 'Four of a kind', straight: 'Straight', pairseq: 'Consecutive pairs', invalid: 'Not a valid combination' },
    yes: 'Beats it',
    no: 'Does not beat it',
    qType: 'What combination are these cards?',
    qBeat: 'Do your cards beat the cards on the table?',
    qChop: 'Chopping: does your combination beat the table?',
    table: 'On the table',
    yours: 'Your cards',
    cards: 'Cards',
    whyType: (x) => `This is: ${x}.`,
    whyBeat: (ok, a, b) => (ok ? `${b} beats ${a}.` : `${b} does not beat ${a}: same type, same length and a higher top card are needed (or a chop rule).`),
    bank: [
      { q: 'Which card is the highest?', options: ['2♥', 'A♥', '2♠', 'K♥'], answer: 0, explain: '2 is the highest rank and ♥ the highest suit.' },
      { q: 'Who leads the first game?', options: ['Whoever holds 3♠', 'The host', 'Whoever holds 2♥', 'The player left of the host'], answer: 0, explain: '3♠ leads and must be included.' },
      { q: 'May a straight contain a 2?', options: ['No', 'Yes', 'Only at the end', 'Only 2♥'], answer: 0, explain: 'Straights and consecutive pairs never contain a 2.' },
      { q: 'After passing, may you play again in the same round?', options: ['No, wait for a new round', 'Yes, any time', 'Yes, with a 2', 'Only the host'], answer: 0, explain: 'A pass sits you out until the round ends.' },
      { q: 'What does “frozen” (cóng) mean?', options: ['Not having played a card when someone goes out', 'Holding a 2', 'Being chopped', 'Passing three times'], answer: 0, explain: 'Frozen: no card played when the first player goes out.' },
    ],
  },
};

export function lessons(lang) {
  const c = T[lang] || T.vi;
  return [
    { id: 'order', title: c.lessons.order, blocks: [{ type: 'defs', items: c.orderText }, { type: 'cards', cards: ['3S', '3C', '3D', '3H', 'AH', '2S', '2H'] }] },
    { id: 'combos', title: c.lessons.combos, blocks: [{ type: 'ranks', items: c.combos }] },
    { id: 'turns', title: c.lessons.turns, blocks: [{ type: 'steps', items: c.turns }] },
    { id: 'chop', title: c.lessons.chop, blocks: [{ type: 'defs', items: c.chop }] },
    { id: 'end', title: c.lessons.end, blocks: [{ type: 'defs', items: c.end }] },
  ];
}

export const title = (lang) => (T[lang] || T.vi).title;

const TWO = 12;
const card = (r, s) => TL_RANKS[r] + TL_SUITS[s];
const suits = (k, rand) => shuffled([0, 1, 2, 3], rand).slice(0, k);

/** A random combination of the given shape (cards are distinct). */
export function makeCombo(type, len, rand) {
  const r = Math.floor(rand() * 13);
  switch (type) {
    case 'single':
      return [card(r, Math.floor(rand() * 4))];
    case 'pair':
      return suits(2, rand).map((s) => card(r, s));
    case 'triple':
      return suits(3, rand).map((s) => card(r, s));
    case 'quad':
      return [0, 1, 2, 3].map((s) => card(r, s));
    case 'straight': {
      const start = Math.floor(rand() * (TWO - len + 1));
      return Array.from({ length: len }, (_, i) => card(start + i, Math.floor(rand() * 4)));
    }
    case 'pairseq': {
      const start = Math.floor(rand() * (TWO - len + 1));
      return Array.from({ length: len }, (_, i) => suits(2, rand).map((s) => card(start + i, s))).flat();
    }
  }
  return [];
}

const SHAPES = [
  ['single', 1],
  ['pair', 1],
  ['triple', 1],
  ['quad', 1],
  ['straight', 3],
  ['straight', 4],
  ['straight', 5],
  ['pairseq', 3],
];

function typeQuestion(c, rand) {
  let cards;
  if (rand() < 0.25) {
    // Something that looks like a combination but is not (gap, a 2 in a straight, two different pairs).
    const tries = [
      () => [card(3, 0), card(4, 1), card(6, 2)],
      () => [card(10, 0), card(11, 1), card(12, 2)],
      () => [card(5, 0), card(5, 1), card(6, 0), card(6, 2)],
      () => [card(1, 3), card(2, 1)],
    ];
    cards = pick(tries, rand)();
  } else {
    const [type, len] = pick(SHAPES, rand);
    cards = makeCombo(type, len, rand);
  }
  const combo = detectCombo(cards);
  const answer = combo ? combo.type : 'invalid';
  const all = Object.keys(c.types).map((k) => ({ v: k, label: c.types[k] }));
  return { prompt: c.qType, groups: [{ label: c.cards, cards: sortCards(cards) }], options: optionsWith(answer, all, 4, rand), answer, explain: c.whyType(c.types[answer]) };
}

const name = (c, cards) => {
  const k = detectCombo(cards);
  return k ? c.types[k.type] : c.types.invalid;
};

function beatQuestion(c, rand) {
  for (;;) {
    const [type, len] = pick(SHAPES.slice(0, 7), rand);
    const table = makeCombo(type, len, rand);
    const mine = makeCombo(rand() < 0.8 ? type : pick(SHAPES, rand)[0], len, rand);
    if (mine.some((x) => table.includes(x)) || !detectCombo(mine)) continue;
    const ok = canBeat(detectCombo(table), detectCombo(mine), TIENLEN_DEFAULTS);
    return {
      prompt: c.qBeat,
      groups: [
        { label: c.table, cards: sortCards(table) },
        { label: c.yours, cards: sortCards(mine) },
      ],
      options: [
        { v: 'yes', label: c.yes },
        { v: 'no', label: c.no },
      ],
      answer: ok ? 'yes' : 'no',
      explain: c.whyBeat(ok, name(c, table), name(c, mine)),
    };
  }
}

function chopQuestion(c, rand) {
  for (;;) {
    const tableShape = pick([
      () => [card(TWO, Math.floor(rand() * 4))],
      () => suits(2, rand).map((s) => card(TWO, s)),
      () => makeCombo('quad', 1, rand),
      () => makeCombo('pairseq', 3, rand),
    ], rand)();
    const mine = pick([() => makeCombo('pairseq', 3, rand), () => makeCombo('quad', 1, rand), () => makeCombo('pairseq', 4, rand)], rand)();
    if (mine.some((x) => tableShape.includes(x))) continue;
    const a = detectCombo(tableShape);
    const b = detectCombo(mine);
    const ok = canBeat(a, b, TIENLEN_DEFAULTS);
    return {
      prompt: c.qChop,
      groups: [
        { label: c.table, cards: sortCards(tableShape) },
        { label: c.yours, cards: sortCards(mine) },
      ],
      options: [
        { v: 'yes', label: c.yes },
        { v: 'no', label: c.no },
      ],
      answer: ok ? 'yes' : 'no',
      explain: c.whyBeat(ok, name(c, tableShape), name(c, mine)) + (ok && isChop(a, b, TIENLEN_DEFAULTS) ? ' ✂' : ''),
    };
  }
}

export function exam(lang, rand = Math.random) {
  const c = T[lang] || T.vi;
  const gen = [];
  for (let i = 0; i < 3; i++) gen.push(typeQuestion(c, rand));
  for (let i = 0; i < 2; i++) gen.push(beatQuestion(c, rand));
  for (let i = 0; i < 2; i++) gen.push(chopQuestion(c, rand));
  return assemble(gen, c.bank, 3, rand);
}
