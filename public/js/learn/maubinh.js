// Course: Mậu binh for beginners. Pure data + exam generator graded by the real rules.
import { evaluate, compare, judge, MAUBINH_DEFAULTS as D, CAT_KEYS, DECK, sortForArrange } from '../domain/maubinh.js';
import { shuffled, pick, assemble } from './common.js';

const T = {
  vi: {
    title: 'Mậu binh cơ bản',
    lessons: { chi: 'Ba chi', ranks: 'Thứ tự bộ', score: 'Tính chi', special: 'Mậu binh', tips: 'Mẹo xếp' },
    chi: [
      ['Chia bài', 'Mỗi người 13 lá (2–4 người). Mọi người xếp bài cùng lúc, có giới hạn thời gian.'],
      ['Chi đầu', '5 lá — phải là chi MẠNH NHẤT.'],
      ['Chi giữa', '5 lá — yếu hơn hoặc bằng chi đầu.'],
      ['Chi cuối', '3 lá — yếu nhất. Chỉ tính sám cô, đôi hoặc mậu thầu (không có sảnh, thùng 3 lá).'],
      ['Binh lủng', 'Chi trên yếu hơn chi dưới là lủng: thua cả 3 chi với mọi người, bị tính như bị sập.'],
      ['So bài', 'Hết giờ (hoặc mọi người xếp xong) thì lật bài, so từng chi với từng người.'],
    ],
    ranks: [
      ['Thùng phá sảnh', ['9H', 'TH', 'JH', 'QH', 'KH'], '5 lá liên tiếp cùng chất.'],
      ['Tứ quý', ['7S', '7C', '7D', '7H', '2S'], '4 lá cùng số.'],
      ['Cù lũ', ['QS', 'QD', 'QH', '4C', '4D'], 'Sám cô + đôi.'],
      ['Thùng', ['2D', '6D', '9D', 'JD', 'KD'], '5 lá cùng chất.'],
      ['Sảnh', ['5C', '6D', '7S', '8H', '9C'], '5 lá liên tiếp. 10-J-Q-K-A lớn nhất, A-2-3-4-5 lớn thứ hai.'],
      ['Sám cô', ['8S', '8D', '8H', 'KC', '3D'], '3 lá cùng số.'],
      ['Thú', ['JS', 'JH', '5C', '5D', 'AS'], '2 đôi.'],
      ['Đôi', ['AS', 'AD', '9C', '6H', '3S'], '2 lá cùng số.'],
      ['Mậu thầu', ['KS', 'TD', '8C', '5H', '2D'], 'Không có bộ nào: so lá cao nhất, rồi lá kế tiếp.'],
    ],
    score: [
      ['Mỗi chi', 'Chi nào mạnh hơn đối thủ thì ăn 1 chi; bằng nhau thì hoà (chất không phân hơn thua).'],
      ['Chi thưởng', `Chi đầu: thùng phá sảnh ${D.sfBack}, tứ quý ${D.quadBack}. Chi giữa: thùng phá sảnh ${D.sfMid}, tứ quý ${D.quadMid}, cù lũ ${D.fullMid}. Chi cuối: sám cô ${D.tripsFront}.`],
      ['Sập 3 chi', `Thắng cả 3 chi một người: số chi ×${D.sapMult}.`],
      ['Sập làng', 'Sập được tất cả mọi người (bàn từ 3 người): nhân đôi thêm lần nữa.'],
      ['Tiền', 'Mỗi chi = số chip chủ bàn đặt (mặc định 10).'],
    ],
    special: [
      ['Sảnh rồng', `13 lá đủ từ 2 đến A — ăn ${D.sanhRong} chi mỗi người.`],
      ['Đồng hoa', `13 lá cùng màu (đỏ hoặc đen) — ${D.dongHoa} chi.`],
      ['Lục phé bôn', `6 đôi — ${D.lucPhe} chi.`],
      ['Ba thùng', `3 chi đều là thùng (chi cuối 3 lá cùng chất) — ${D.baThung} chi.`],
      ['Ba sảnh', `3 chi đều là sảnh (chi cuối 3 lá liên tiếp) — ${D.baSanh} chi.`],
      ['Ghi chú', 'Thắng thẳng, không so chi; hai người cùng có thì loại lớn hơn thắng. Máy tự nhận cho bạn.'],
    ],
    tips: [
      'Đặt bộ mạnh nhất ở chi đầu, nhưng đừng bỏ phí: chi giữa và chi cuối mạnh mới hay thắng nhiều chi.',
      'Đôi lớn ở chi cuối (như đôi A, đôi K) thường đáng giá hơn để ở chi giữa.',
      'Sám cô ở chi cuối được thưởng — nếu không làm chi giữa yếu đi quá.',
      'Luôn kiểm tra lủng trước khi bấm Xếp xong: lủng là thua sập cả bàn.',
      'Bí thì bấm “Tự xếp”, rồi đổi vài lá cho hợp ý.',
    ],
    cats: CAT_KEYS.map((k) => ({ high: 'Mậu thầu', pair: 'Đôi', twoPair: 'Thú', trips: 'Sám cô', straight: 'Sảnh', flush: 'Thùng', full: 'Cù lũ', quads: 'Tứ quý', straightFlush: 'Thùng phá sảnh' })[k]),
    qCat: 'Chi này là bộ gì?',
    qCompare: 'Chi nào thắng?',
    qValid: 'Cách xếp này hợp lệ hay bị lủng?',
    valid: 'Hợp lệ',
    lung: 'Lủng',
    a: 'Chi A',
    b: 'Chi B',
    tie: 'Hoà',
    chiNames: ['Chi đầu', 'Chi giữa', 'Chi cuối'],
    whyCat: (x) => `Đây là: ${x}.`,
    whyCompare: (r, a, b) => (r === 'tie' ? `Hai chi bằng nhau (${a}) — hoà.` : `${r === 'a' ? 'Chi A' : 'Chi B'} thắng: ${a} so với ${b}.`),
    whyValid: (ok, n) => (ok ? `Hợp lệ: ${n.join(' ≥ ')}.` : `Lủng: ${n[0]} (${n[1]}) yếu hơn ${n[2].toLowerCase()} (${n[3]}).`),
    bank: [
      { q: 'Chi nào phải mạnh nhất?', options: ['Chi đầu (5 lá)', 'Chi giữa', 'Chi cuối (3 lá)', 'Tuỳ người chơi'], answer: 0, explain: 'Chi đầu ≥ chi giữa ≥ chi cuối.' },
      { q: 'Thắng cả 3 chi của một người gọi là gì?', options: ['Sập 3 chi', 'Binh lủng', 'Mậu binh', 'Tới trắng'], answer: 0, explain: 'Sập 3 chi: số chi được nhân lên.' },
      { q: 'Chi cuối (3 lá) có tính sảnh không?', options: ['Không — chỉ sám cô, đôi, mậu thầu', 'Có', 'Chỉ sảnh A-2-3', 'Chỉ khi cùng chất'], answer: 0, explain: 'Chi cuối chỉ có sám cô, đôi, mậu thầu.' },
      { q: '13 lá đủ từ 2 đến A gọi là?', options: ['Sảnh rồng', 'Đồng hoa', 'Ba sảnh', 'Lục phé bôn'], answer: 0, explain: 'Sảnh rồng là mậu binh lớn nhất.' },
      { q: 'Hai chi bằng nhau thì sao?', options: ['Hoà, không ai ăn', 'So chất', 'Chi đầu thắng', 'Người xếp xong trước thắng'], answer: 0, explain: 'Chất không phân hơn thua trong Mậu binh.' },
    ],
  },
  en: {
    title: 'Mậu binh basics',
    lessons: { chi: 'Three hands', ranks: 'Hand ranks', score: 'Scoring', special: 'Special hands', tips: 'Tips' },
    chi: [
      ['Deal', '13 cards each (2–4 players). Everyone arranges at the same time, against a timer.'],
      ['Back', '5 cards — must be the STRONGEST hand.'],
      ['Middle', '5 cards — weaker than or equal to the back.'],
      ['Front', '3 cards — the weakest. Only three of a kind, pair or high card count (no 3-card straights or flushes).'],
      ['Fouled', 'A higher hand weaker than the one below it is fouled: you lose all three to everyone, as a sweep.'],
      ['Showdown', 'When time is up (or everyone is ready), hands are revealed and compared hand by hand with each player.'],
    ],
    ranks: [
      ['Straight flush', ['9H', 'TH', 'JH', 'QH', 'KH'], 'Five in a row, same suit.'],
      ['Four of a kind', ['7S', '7C', '7D', '7H', '2S'], 'Four of a rank.'],
      ['Full house', ['QS', 'QD', 'QH', '4C', '4D'], 'Three of a kind + a pair.'],
      ['Flush', ['2D', '6D', '9D', 'JD', 'KD'], 'Five of a suit.'],
      ['Straight', ['5C', '6D', '7S', '8H', '9C'], 'Five in a row. 10-J-Q-K-A is highest, A-2-3-4-5 second.'],
      ['Three of a kind', ['8S', '8D', '8H', 'KC', '3D'], 'Three of a rank.'],
      ['Two pair', ['JS', 'JH', '5C', '5D', 'AS'], 'Two pairs.'],
      ['Pair', ['AS', 'AD', '9C', '6H', '3S'], 'Two of a rank.'],
      ['High card', ['KS', 'TD', '8C', '5H', '2D'], 'Nothing: compare the highest card, then the next.'],
    ],
    score: [
      ['Each hand', 'Win a hand against an opponent: 1 chi. Equal: tie (suits never decide).'],
      ['Bonuses', `Back: straight flush ${D.sfBack}, quads ${D.quadBack}. Middle: straight flush ${D.sfMid}, quads ${D.quadMid}, full house ${D.fullMid}. Front: trips ${D.tripsFront}.`],
      ['Sweep', `Win all three against one player: ×${D.sapMult}.`],
      ['Table sweep', 'Sweep everyone (3+ players): doubled again.'],
      ['Chips', 'Each chi is worth the chips the host set (10 by default).'],
    ],
    special: [
      ['Dragon', `All 13 ranks 2 → A — ${D.sanhRong} chi from each player.`],
      ['One colour', `All 13 cards red, or all black — ${D.dongHoa} chi.`],
      ['Six pairs', `${D.lucPhe} chi.`],
      ['Three flushes', `All three hands are flushes (front: 3 of a suit) — ${D.baThung} chi.`],
      ['Three straights', `All three hands are straights (front: 3 in a row) — ${D.baSanh} chi.`],
      ['Note', 'They win outright, no comparing; if two players have one, the higher kind wins. The app spots them.'],
    ],
    tips: [
      'Put the strongest hand in the back, but don’t waste it: strong middle and front hands win more chi.',
      'A high pair in the front (aces, kings) is often worth more than in the middle.',
      'Three of a kind in the front earns a bonus — if the middle stays strong enough.',
      'Always check for a foul before pressing Done: fouling loses to everyone as a sweep.',
      'Stuck? Press “Auto-arrange”, then swap a few cards.',
    ],
    cats: CAT_KEYS.map((k) => ({ high: 'High card', pair: 'Pair', twoPair: 'Two pair', trips: 'Three of a kind', straight: 'Straight', flush: 'Flush', full: 'Full house', quads: 'Four of a kind', straightFlush: 'Straight flush' })[k]),
    qCat: 'What is this hand?',
    qCompare: 'Which hand wins?',
    qValid: 'Is this arrangement valid or fouled?',
    valid: 'Valid',
    lung: 'Fouled',
    a: 'Hand A',
    b: 'Hand B',
    tie: 'Tie',
    chiNames: ['Back', 'Middle', 'Front'],
    whyCat: (x) => `It is: ${x}.`,
    whyCompare: (r, a, b) => (r === 'tie' ? `Equal hands (${a}) — a tie.` : `${r === 'a' ? 'Hand A' : 'Hand B'} wins: ${a} vs ${b}.`),
    whyValid: (ok, n) => (ok ? `Valid: ${n.join(' ≥ ')}.` : `Fouled: the ${n[0].toLowerCase()} (${n[1]}) is weaker than the ${n[2].toLowerCase()} (${n[3]}).`),
    bank: [
      { q: 'Which hand must be the strongest?', options: ['The back (5 cards)', 'The middle', 'The front (3 cards)', 'Any'], answer: 0, explain: 'Back ≥ middle ≥ front.' },
      { q: 'Winning all three hands against a player is…', options: ['A sweep', 'A foul', 'A special hand', 'An instant win'], answer: 0, explain: 'A sweep multiplies the chi.' },
      { q: 'Does the front (3 cards) count straights?', options: ['No — only three of a kind, pair, high card', 'Yes', 'Only A-2-3', 'Only if suited'], answer: 0, explain: 'The front counts only three of a kind, pairs and high cards.' },
      { q: '13 cards with every rank 2 → A is…', options: ['Dragon', 'One colour', 'Three straights', 'Six pairs'], answer: 0, explain: 'The Dragon is the biggest special hand.' },
      { q: 'Two equal hands…', options: ['Tie, nobody wins', 'Compare suits', 'The back wins', 'Who finished first wins'], answer: 0, explain: 'Suits never break ties in Mậu binh.' },
    ],
  },
};

export function lessons(lang) {
  const c = T[lang] || T.vi;
  return [
    { id: 'chi', title: c.lessons.chi, blocks: [{ type: 'steps', items: c.chi }] },
    { id: 'ranks', title: c.lessons.ranks, blocks: [{ type: 'ranks', items: c.ranks }] },
    { id: 'score', title: c.lessons.score, blocks: [{ type: 'defs', items: c.score }] },
    { id: 'special', title: c.lessons.special, blocks: [{ type: 'defs', items: c.special }] },
    { id: 'tips', title: c.lessons.tips, blocks: [{ type: 'tips', items: c.tips }] },
  ];
}

export const title = (lang) => (T[lang] || T.vi).title;

const deal = (n, rand) => shuffled(DECK, rand).slice(0, n);

/** A 5-card hand of a chosen category (random category, mostly), or random cards. */
function hand5(rand) {
  const r = (i) => '23456789TJQKA'[i];
  const s = () => 'SCDH'[Math.floor(rand() * 4)];
  const v = Math.floor(rand() * 13);
  const w = (v + 1 + Math.floor(rand() * 12)) % 13;
  const makers = [
    () => deal(5, rand),
    () => [r(v) + 'S', r(v) + 'H', ...shuffled(DECK.filter((c) => c[0] !== r(v)), rand).slice(0, 3)],
    () => [r(v) + 'S', r(v) + 'D', r(v) + 'H', r(w) + 'C', r(w) + 'D'],
    () => {
      const suit = s();
      return shuffled(DECK.filter((c) => c[1] === suit), rand).slice(0, 5);
    },
    () => {
      const top = 4 + Math.floor(rand() * 9);
      return Array.from({ length: 5 }, (_, i) => r(top - i) + s());
    },
    () => [r(v) + 'S', r(v) + 'C', r(v) + 'D', r(v) + 'H', r(w) + 'S'],
  ];
  for (;;) {
    const cards = pick(makers, rand)();
    if (new Set(cards).size === 5) return cards;
  }
}

function catQuestion(c, rand) {
  const cards = hand5(rand);
  const ev = evaluate(cards);
  const answer = String(ev.cat);
  const all = c.cats.map((label, i) => ({ v: String(i), label }));
  const others = shuffled(all.filter((o) => o.v !== answer), rand).slice(0, 3);
  return {
    prompt: c.qCat,
    groups: [{ label: '', cards: sortForArrange(cards) }],
    options: shuffled([all[ev.cat], ...others], rand),
    answer,
    explain: c.whyCat(c.cats[ev.cat]),
  };
}

function compareQuestion(c, rand) {
  for (;;) {
    const a = hand5(rand);
    const b = hand5(rand);
    if (a.some((x) => b.includes(x))) continue;
    const ea = evaluate(a);
    const eb = evaluate(b);
    const r = compare(ea, eb);
    const answer = r > 0 ? 'a' : r < 0 ? 'b' : 'tie';
    return {
      prompt: c.qCompare,
      groups: [
        { label: c.a, cards: sortForArrange(a) },
        { label: c.b, cards: sortForArrange(b) },
      ],
      options: [
        { v: 'a', label: c.a },
        { v: 'b', label: c.b },
        { v: 'tie', label: c.tie },
      ],
      answer,
      explain: c.whyCompare(answer, c.cats[ea.cat], c.cats[eb.cat]),
    };
  }
}

function validQuestion(c, rand) {
  // Half the time a deliberately weak back or a strong front.
  const cards = deal(13, rand);
  let order = sortForArrange(cards);
  if (rand() < 0.5) order = shuffled(order, rand);
  const j = judge(order);
  // Explain with the categories only: valid → "Thú ≥ Đôi ≥ Mậu thầu"; fouled → the pair that breaks the order.
  const names = j.evs.map((e) => c.cats[e.cat]);
  const bad = compare(j.evs[0], j.evs[1]) < 0 ? 0 : 1;
  return {
    prompt: c.qValid,
    groups: [
      { label: c.chiNames[0], cards: order.slice(0, 5), inline: true },
      { label: c.chiNames[1], cards: order.slice(5, 10), inline: true },
      { label: c.chiNames[2], cards: order.slice(10), inline: true },
    ],
    options: [
      { v: 'ok', label: c.valid },
      { v: 'lung', label: c.lung },
    ],
    answer: j.valid ? 'ok' : 'lung',
    explain: j.valid ? c.whyValid(true, names) : c.whyValid(false, [c.chiNames[bad], names[bad], c.chiNames[bad + 1], names[bad + 1]]),
  };
}

export function exam(lang, rand = Math.random) {
  const c = T[lang] || T.vi;
  const gen = [];
  for (let i = 0; i < 3; i++) gen.push(catQuestion(c, rand));
  for (let i = 0; i < 2; i++) gen.push(compareQuestion(c, rand));
  for (let i = 0; i < 2; i++) gen.push(validQuestion(c, rand));
  return assemble(gen, c.bank, 3, rand);
}
