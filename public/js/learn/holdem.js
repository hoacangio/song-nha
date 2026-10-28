// Course: Texas Hold'em (No-Limit) for beginners. Pure data + exam generator.
import { bestHand, CATEGORIES } from '../domain/holdem.js';
import { DECK } from '../domain/cards.js';
import { shuffled, optionsWith, assemble } from './common.js';

const T = {
  vi: {
    title: 'Texas Hold’em cơ bản',
    ranks: {
      straightFlush: ['Thùng phá sảnh', '5 lá liên tiếp cùng chất. A-K-Q-J-10 cùng chất gọi là Royal Flush.'],
      quads: ['Tứ quý', '4 lá cùng số.'],
      fullHouse: ['Cù lũ', '1 bộ ba + 1 đôi. So bộ ba trước.'],
      flush: ['Thùng', '5 lá cùng chất, không cần liên tiếp. So lá cao nhất.'],
      straight: ['Sảnh', '5 lá liên tiếp, khác chất. A có thể đứng cuối (10-J-Q-K-A) hoặc đầu (A-2-3-4-5).'],
      trips: ['Sám cô', '3 lá cùng số.'],
      twoPair: ['Thú (hai đôi)', 'Hai đôi khác nhau. So đôi lớn, rồi đôi nhỏ, rồi lá lẻ.'],
      pair: ['Đôi', '2 lá cùng số. Hòa thì so các lá lẻ (kicker).'],
      high: ['Mậu thầu', 'Không có gì: so lá cao nhất.'],
    },
    lessons: {
      rankings: 'Thứ tự bài',
      flow: 'Cách chơi',
      actions: 'Hành động',
      tips: 'Mẹo',
    },
    rankIntro: 'Dùng 5 lá tốt nhất từ 2 lá riêng + 5 lá chung. Mạnh → yếu (chạm để xem giải thích):',
    rankNote: 'Chất không phân hơn thua: hai tay bằng nhau thì chia đôi pot.',
    flow: [
      ['Blind', 'Hai người bên trái nút Dealer (D) bỏ tiền bắt buộc: Small Blind (SB) và Big Blind (BB). Nút D xoay vòng mỗi ván.'],
      ['Preflop', 'Mỗi người nhận 2 lá úp. Người bên trái BB nói trước, theo chiều kim đồng hồ.'],
      ['Flop', 'Lật 3 lá chung. Vòng cược mới, bắt đầu từ người còn lại đầu tiên bên trái nút D.'],
      ['Turn', 'Lật lá chung thứ 4. Thêm một vòng cược.'],
      ['River', 'Lật lá chung thứ 5. Vòng cược cuối.'],
      ['Showdown', 'Người còn lại lật bài; tay 5 lá mạnh nhất thắng. Nếu mọi người khác bỏ bài, người còn lại thắng ngay, không cần lật.'],
    ],
    actions: [
      ['Bỏ bài (Fold)', 'Bỏ tay bài, mất số chip đã bỏ vào pot.'],
      ['Xem (Check)', 'Không cược thêm — chỉ được khi chưa ai cược ở vòng này.'],
      ['Theo (Call)', 'Bỏ thêm chip cho bằng mức cược cao nhất.'],
      ['Cược / Tố (Bet / Raise)', 'Mức tố tối thiểu = mức nâng gần nhất (ít nhất 1 BB).'],
      ['All-in', 'Bỏ hết chip. Ít chip hơn mức cược thì chỉ thắng phần tương ứng (main pot); phần dư thành side pot.'],
    ],
    sideTitle: 'Ví dụ side pot',
    side: 'An all-in 50, Bình và Cúc mỗi người 200 → main pot 150 (cả ba có quyền thắng) và side pot 300 (chỉ Bình và Cúc).',
    tips: [
      'Bắt đầu chặt tay: chơi đôi lớn (AA, KK, QQ, JJ), A-K, A-Q; bỏ phần lớn tay nhỏ lẻ.',
      'Vị trí quan trọng: nói sau (gần nút D) giúp bạn có nhiều thông tin hơn.',
      'Đừng theo chỉ vì đã bỏ nhiều chip vào pot — chip đã bỏ không còn là của bạn.',
      'Nhìn bài chung: 3–4 lá cùng chất hay liên tiếp thì đối thủ có thể có Thùng hoặc Sảnh.',
      'Chạm “?” cạnh bài của bạn để xem nhanh thứ tự bài khi đang chơi.',
    ],
    qWho: 'Ai thắng ván này?',
    qBest: 'Tay bài mạnh nhất của bạn (2 lá riêng + 5 lá chung) là gì?',
    handA: 'Tay A',
    handB: 'Tay B',
    tie: 'Hòa (chia pot)',
    board: 'Bài chung',
    yours: 'Bài của bạn',
    whyWin: (w, a, b) => (w === 'tie' ? `Hai tay bằng nhau: ${a}.` : `Tay ${w.toUpperCase()} thắng: ${w === 'a' ? a : b} > ${w === 'a' ? b : a}.`),
    whySame: (w, cat) => `Cả hai đều là ${cat}, nhưng tay ${w.toUpperCase()} có lá lớn hơn (so bộ chính rồi tới lá lẻ — kicker).`,
    whyBest: (c) => `5 lá tốt nhất tạo thành ${c}.`,
    bank: [
      { q: 'Ai nói đầu tiên ở vòng preflop (từ 3 người trở lên)?', options: ['Người bên trái Big Blind', 'Small Blind', 'Người giữ nút Dealer', 'Big Blind'], answer: 0, explain: 'Preflop bắt đầu từ người bên trái Big Blind.' },
      { q: 'Khi nào bạn được “Xem” (Check)?', options: ['Khi chưa ai cược ở vòng này', 'Bất cứ lúc nào', 'Chỉ ở vòng river', 'Khi bạn có đôi'], answer: 0, explain: 'Check chỉ hợp lệ khi không phải theo cược nào.' },
      { q: 'Có bao nhiêu lá chung trên bàn sau vòng Turn?', options: ['4', '3', '5', '2'], answer: 0, explain: 'Flop 3 lá, Turn thêm 1 lá → 4 lá.' },
      { q: 'Chất (♠ ♣ ♦ ♥) có phân thắng thua khi hai tay bằng nhau không?', options: ['Không — chia đôi pot', 'Có — ♥ lớn nhất', 'Có — ♠ lớn nhất', 'Người nói trước thắng'], answer: 0, explain: 'Trong Poker, chất không dùng để phân thắng thua.' },
      { q: 'Mức cược hiện tại 40 sau một lần tố từ 20 lên 40. Bạn muốn tố lại, mức tối thiểu là?', options: ['60', '50', '80', '41'], answer: 0, explain: 'Lần nâng gần nhất là 20, nên tố lại tối thiểu 40 + 20 = 60.' },
      { q: 'Mọi người khác bỏ bài. Người còn lại có phải lật bài không?', options: ['Không, thắng ngay', 'Có, bắt buộc', 'Chỉ khi thắng lớn', 'Chia đôi pot'], answer: 0, explain: 'Không có showdown khi chỉ còn một người.' },
    ],
  },
  en: {
    title: 'Texas Hold’em basics',
    ranks: {
      straightFlush: ['Straight flush', 'Five in a row, same suit. A-K-Q-J-10 suited is a Royal Flush.'],
      quads: ['Four of a kind', 'Four cards of one rank.'],
      fullHouse: ['Full house', 'Three of a kind plus a pair. The three decide first.'],
      flush: ['Flush', 'Five cards of one suit, any order. Highest card decides.'],
      straight: ['Straight', 'Five in a row, mixed suits. Ace can be high (10-J-Q-K-A) or low (A-2-3-4-5).'],
      trips: ['Three of a kind', 'Three cards of one rank.'],
      twoPair: ['Two pair', 'Two different pairs. High pair, then low pair, then kicker.'],
      pair: ['Pair', 'Two cards of one rank. Ties go to the kickers.'],
      high: ['High card', 'Nothing made: highest card wins.'],
    },
    lessons: { rankings: 'Hand rankings', flow: 'How a hand works', actions: 'Actions', tips: 'Tips' },
    rankIntro: 'Best five of your 2 hole cards + 5 community cards. Strongest first (tap for details):',
    rankNote: 'Suits never break ties: equal hands split the pot.',
    flow: [
      ['Blinds', 'The two players left of the Dealer button (D) post Small Blind (SB) and Big Blind (BB). The button moves every hand.'],
      ['Pre-flop', 'Everyone gets 2 face-down cards. The player left of the BB acts first, then clockwise.'],
      ['Flop', 'Three community cards. Betting starts with the first live player left of the button.'],
      ['Turn', 'The fourth community card, another betting round.'],
      ['River', 'The fifth community card, the last betting round.'],
      ['Showdown', 'Remaining players show; the best five-card hand wins. If everyone else folds, the last player wins without showing.'],
    ],
    actions: [
      ['Fold', 'Give up the hand and the chips already in.'],
      ['Check', 'Bet nothing — only when nobody has bet this round.'],
      ['Call', 'Match the highest bet.'],
      ['Bet / Raise', 'A raise must be at least the previous raise (minimum one big blind).'],
      ['All-in', 'All your chips. With fewer chips than the bet you can only win the matching part (main pot); the rest is a side pot.'],
    ],
    sideTitle: 'Side pot example',
    side: 'An is all-in for 50, Bình and Cúc put in 200 each → main pot 150 (all three) and side pot 300 (Bình and Cúc only).',
    tips: [
      'Start tight: big pairs (AA, KK, QQ, JJ), A-K, A-Q; fold most small unconnected hands.',
      'Position matters: acting later gives you more information.',
      'Don’t call just because you already put chips in — they are no longer yours.',
      'Read the board: 3–4 cards of one suit or in a row mean a flush or straight is possible.',
      'Tap “?” next to your cards for a quick hand-ranking chart.',
    ],
    qWho: 'Who wins this hand?',
    qBest: 'What is your best hand (2 hole cards + 5 on the board)?',
    handA: 'Hand A',
    handB: 'Hand B',
    tie: 'Tie (split pot)',
    board: 'Board',
    yours: 'Your cards',
    whyWin: (w, a, b) => (w === 'tie' ? `Both hands are equal: ${a}.` : `Hand ${w.toUpperCase()} wins: ${w === 'a' ? a : b} beats ${w === 'a' ? b : a}.`),
    whySame: (w, cat) => `Both are ${cat}, but hand ${w.toUpperCase()} has higher cards (the made hand first, then the kickers).`,
    whyBest: (c) => `Your best five cards make ${c}.`,
    bank: [
      { q: 'Who acts first pre-flop (3+ players)?', options: ['The player left of the big blind', 'Small blind', 'The button', 'Big blind'], answer: 0, explain: 'Pre-flop action starts left of the big blind.' },
      { q: 'When may you check?', options: ['When nobody has bet this round', 'Any time', 'Only on the river', 'When you hold a pair'], answer: 0, explain: 'Checking is only allowed when there is nothing to call.' },
      { q: 'How many community cards are out after the turn?', options: ['4', '3', '5', '2'], answer: 0, explain: 'Flop 3 + turn 1 = 4.' },
      { q: 'Do suits break ties between equal hands?', options: ['No — split the pot', 'Yes — hearts are highest', 'Yes — spades are highest', 'First to act wins'], answer: 0, explain: 'Suits never rank in poker.' },
      { q: 'The bet is 40 after a raise from 20 to 40. What is the minimum re-raise?', options: ['60', '50', '80', '41'], answer: 0, explain: 'The last raise was 20, so the minimum re-raise is to 40 + 20 = 60.' },
      { q: 'Everyone else folds. Must the last player show?', options: ['No, they win at once', 'Yes, always', 'Only for big pots', 'The pot is split'], answer: 0, explain: 'There is no showdown with one player left.' },
    ],
  },
};

export const EXAMPLES = {
  straightFlush: ['AS', 'KS', 'QS', 'JS', 'TS'],
  quads: ['9C', '9D', '9H', '9S', 'KD'],
  fullHouse: ['QH', 'QC', 'QD', '7S', '7H'],
  flush: ['AD', 'JD', '8D', '6D', '3D'],
  straight: ['9C', '8D', '7H', '6S', '5C'],
  trips: ['7C', '7D', '7S', 'KH', '2C'],
  twoPair: ['JC', 'JD', '4H', '4S', 'AC'],
  pair: ['TH', 'TC', 'AS', '8D', '4C'],
  high: ['AH', 'QC', '9D', '6S', '3H'],
};

export function lessons(lang) {
  const c = T[lang] || T.vi;
  return [
    {
      id: 'rankings',
      title: c.lessons.rankings,
      blocks: [
        { type: 'text', p: c.rankIntro, hideShort: true },
        { type: 'ranks', items: [...CATEGORIES].reverse().map((k) => [c.ranks[k][0], EXAMPLES[k], c.ranks[k][1]]) },
        { type: 'text', p: c.rankNote },
      ],
    },
    { id: 'flow', title: c.lessons.flow, blocks: [{ type: 'steps', items: c.flow }] },
    { id: 'actions', title: c.lessons.actions, blocks: [{ type: 'defs', items: c.actions }, { type: 'h', p: c.sideTitle }, { type: 'text', p: c.side }] },
    { id: 'tips', title: c.lessons.tips, blocks: [{ type: 'tips', items: c.tips }] },
  ];
}

export const title = (lang) => (T[lang] || T.vi).title;

/** Ranking names in the current language (used by the table UI too). */
export const rankName = (lang, cat) => (T[lang] || T.vi).ranks[cat][0];

function deal(rand, n) {
  return shuffled(DECK, rand).slice(0, n);
}

function whoWins(c, rand) {
  const d = deal(rand, 9);
  const a = d.slice(0, 2);
  const b = d.slice(2, 4);
  const board = d.slice(4, 9);
  const ha = bestHand([...a, ...board]);
  const hb = bestHand([...b, ...board]);
  const answer = ha.score > hb.score ? 'a' : hb.score > ha.score ? 'b' : 'tie';
  const na = c.ranks[ha.category][0];
  const nb = c.ranks[hb.category][0];
  return {
    prompt: c.qWho,
    groups: [
      { label: c.board, cards: board },
      { label: c.handA, cards: a, half: true },
      { label: c.handB, cards: b, half: true },
    ],
    options: [
      { v: 'a', label: c.handA },
      { v: 'tie', label: c.tie },
      { v: 'b', label: c.handB },
    ],
    answer,
    explain:
      answer !== 'tie' && ha.category === hb.category ? c.whySame(answer, na) : c.whyWin(answer, answer === 'b' ? nb : na, answer === 'b' ? na : nb),
    highlight: answer === 'b' ? hb.cards : answer === 'a' ? ha.cards : ha.cards,
  };
}

function bestOf(c, rand) {
  const d = deal(rand, 7);
  const mine = d.slice(0, 2);
  const board = d.slice(2);
  const h = bestHand(d);
  const all = CATEGORIES.map((k) => ({ v: k, label: c.ranks[k][0] }));
  return {
    prompt: c.qBest,
    groups: [
      { label: c.board, cards: board },
      { label: c.yours, cards: mine },
    ],
    options: optionsWith(h.category, all, 4, rand),
    answer: h.category,
    explain: c.whyBest(c.ranks[h.category][0]),
    highlight: h.cards,
  };
}

export function exam(lang, rand = Math.random) {
  const c = T[lang] || T.vi;
  const gen = [];
  for (let i = 0; i < 4; i++) gen.push(whoWins(c, rand));
  for (let i = 0; i < 3; i++) gen.push(bestOf(c, rand));
  return assemble(gen, c.bank, 3, rand);
}
