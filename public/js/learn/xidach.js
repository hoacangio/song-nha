// Course: Xì dách for beginners. Pure data + exam generator graded by the real rules.
import { classify, compareHands, settleDelta, XIDACH_DEFAULTS } from '../domain/xidach.js';
import { DECK } from '../domain/cards.js';
import { shuffled, pick, optionsWith, assemble } from './common.js';

const T = {
  vi: {
    title: 'Xì dách cơ bản',
    lessons: { goal: 'Mục tiêu', points: 'Tính điểm', special: 'Bài đặc biệt', turns: 'Lượt & nhà cái', pay: 'Trả thưởng' },
    goal: [
      ['Đặt cược', 'Mỗi người chơi đặt cược trước khi chia bài. Nhà cái không cược mà ăn/chung với từng người.'],
      ['Chia bài', 'Mỗi người (cả nhà cái) nhận 2 lá.'],
      ['Mục tiêu', 'Đạt tổng điểm gần 21 nhất mà không vượt quá 21, hoặc có bài đặc biệt.'],
      ['So bài', 'Mỗi người chơi so riêng với nhà cái — không so giữa người chơi với nhau.'],
    ],
    points: [
      ['2 – 10', 'Tính theo số trên lá.'],
      ['J, Q, K', 'Mỗi lá 10 điểm.'],
      ['A (át)', 'Tính 1, 10 hoặc 11 — tự chọn cách có lợi nhất. Kiểu “cổ điển”: 2 lá A = 10/11, 3 lá A = 1/10, từ 4 lá A = 1.'],
      ['Ví dụ', 'A + 9 = 20 · A + 5 + 5 = 21 · K + 7 = 17 · 9 + 6 = 15.'],
    ],
    special: [
      ['Xì bàng', '2 lá A. Mạnh nhất.'],
      ['Xì dách', 'A + 10/J/Q/K ngay 2 lá đầu.'],
      ['Ngũ linh', '5 lá mà tổng không quá 21. Thắng mọi bài điểm thường.'],
      ['Quắc', 'Tổng trên 21 — thua (trừ khi nhà cái cũng quắc thì hòa).'],
      ['Non (chưa đủ tuổi)', 'Người chơi phải có ít nhất 16 điểm mới được dằn; non luôn thua.'],
    ],
    turns: [
      ['Người chơi', 'Lần lượt Rút (thêm lá) hoặc Dằn (dừng). Có tối đa 5 lá.'],
      ['Nhà cái', 'Rút tới ít nhất 15 điểm, rồi có thể Xét từng người hoặc Xét hết.'],
      ['Có bài đặc biệt', 'Người có xì dách/xì bàng được tính ngay. Nhà cái có xì dách/xì bàng thì so ngay với tất cả.'],
      ['Hết giờ', 'Người chơi tự dằn; nhà cái tự rút tới đủ điểm rồi xét hết.'],
    ],
    pay: [
      ['Thắng thường', '×1 tiền cược.'],
      ['Xì dách', '×2.'],
      ['Xì bàng', '×3.'],
      ['Ngũ linh', '×2.'],
      ['Ai thua bài đặc biệt', 'Trả theo hệ số của bài thắng. Hòa thì không ai mất.'],
    ],
    kinds: { xibang: 'Xì bàng', xidach: 'Xì dách', ngulinh: 'Ngũ linh', quac: 'Quắc', non: 'Non (dưới 16)' },
    pts: (n) => `${n} điểm`,
    qKind: 'Bài này của người chơi được tính là gì?',
    qWho: 'Người chơi so với nhà cái — ai thắng?',
    qPay: (kind, bet) => `Bạn thắng nhà cái bằng ${kind}, tiền cược ${bet}. Bạn được thêm bao nhiêu chip?`,
    player: 'Người chơi',
    dealer: 'Nhà cái',
    push: 'Hòa',
    cards: 'Bài',
    whyKind: (k) => `Bài được tính: ${k}.`,
    whyWho: (p, d, w) => `Người chơi: ${p} · Nhà cái: ${d} → ${w}.`,
    whyPay: (m, bet) => `Hệ số ×${m} → ${m * bet} chip.`,
    bank: [
      { q: 'Người chơi được dằn khi có tối thiểu bao nhiêu điểm?', options: ['16', '15', '17', '21'], answer: 0, explain: 'Người chơi phải đủ tuổi: ít nhất 16 điểm.' },
      { q: 'Nhà cái phải rút tới tối thiểu bao nhiêu điểm?', options: ['15', '16', '17', '12'], answer: 0, explain: 'Mặc định nhà cái phải có ít nhất 15 điểm mới được xét.' },
      { q: 'Người chơi và nhà cái cùng quắc thì sao?', options: ['Hòa', 'Nhà cái thắng', 'Người chơi thắng', 'Chia ngẫu nhiên'], answer: 0, explain: 'Mặc định cả hai quắc là hòa (chủ bàn có thể đổi).' },
      { q: 'Lá K được tính mấy điểm?', options: ['10', '13', '11', '1'], answer: 0, explain: 'J, Q, K đều 10 điểm.' },
      { q: 'Hai lá A gọi là gì?', options: ['Xì bàng', 'Xì dách', 'Ngũ linh', 'Đôi A'], answer: 0, explain: 'Hai lá A là xì bàng — bài mạnh nhất.' },
    ],
  },
  en: {
    title: 'Xì dách (Vietnamese blackjack) basics',
    lessons: { goal: 'Goal', points: 'Counting', special: 'Special hands', turns: 'Turns & dealer', pay: 'Payouts' },
    goal: [
      ['Bets', 'Players bet before the deal. The dealer does not bet but settles with each player.'],
      ['Deal', 'Everyone (dealer included) gets 2 cards.'],
      ['Goal', 'Get as close to 21 as possible without going over, or make a special hand.'],
      ['Compare', 'Each player is compared with the dealer only — never with other players.'],
    ],
    points: [
      ['2 – 10', 'Face value.'],
      ['J, Q, K', '10 each.'],
      ['Ace', 'Counts 1, 10 or 11 — whichever helps. “Classic”: with 2 cards 10/11, 3 cards 1/10, 4+ cards 1.'],
      ['Examples', 'A + 9 = 20 · A + 5 + 5 = 21 · K + 7 = 17 · 9 + 6 = 15.'],
    ],
    special: [
      ['Xì bàng', 'Two aces. The best hand.'],
      ['Xì dách', 'Ace + 10/J/Q/K as the first two cards.'],
      ['Ngũ linh', 'Five cards totalling 21 or less. Beats any normal total.'],
      ['Bust (quắc)', 'Over 21 — loses (a push if the dealer also busts).'],
      ['Under 16 (non)', 'Players need at least 16 to stand; under 16 always loses.'],
    ],
    turns: [
      ['Players', 'Hit (take a card) or Stand. Five cards at most.'],
      ['Dealer', 'Draws to at least 15, then checks players one by one or all at once.'],
      ['Special hands', 'Settled immediately. A dealer xì dách/xì bàng is compared with everyone at once.'],
      ['Timeout', 'Players stand; the dealer draws to 15 and checks everyone.'],
    ],
    pay: [
      ['Normal win', '×1 the bet.'],
      ['Xì dách', '×2.'],
      ['Xì bàng', '×3.'],
      ['Ngũ linh', '×2.'],
      ['Losing to a special hand', 'Pay the multiplier of the winning hand. Pushes cost nothing.'],
    ],
    kinds: { xibang: 'Xì bàng (two aces)', xidach: 'Xì dách', ngulinh: 'Ngũ linh (five cards)', quac: 'Bust', non: 'Under 16' },
    pts: (n) => `${n} points`,
    qKind: 'How does this player hand count?',
    qWho: 'Player vs dealer — who wins?',
    qPay: (kind, bet) => `You beat the dealer with ${kind}, betting ${bet}. How many chips do you win?`,
    player: 'Player',
    dealer: 'Dealer',
    push: 'Push',
    cards: 'Cards',
    whyKind: (k) => `It counts as: ${k}.`,
    whyWho: (p, d, w) => `Player: ${p} · Dealer: ${d} → ${w}.`,
    whyPay: (m, bet) => `Multiplier ×${m} → ${m * bet} chips.`,
    bank: [
      { q: 'What is the minimum total for a player to stand?', options: ['16', '15', '17', '21'], answer: 0, explain: 'Players need at least 16.' },
      { q: 'The dealer must draw to at least…', options: ['15', '16', '17', '12'], answer: 0, explain: 'By default the dealer needs 15 before checking.' },
      { q: 'Both the player and the dealer bust. Result?', options: ['Push', 'Dealer wins', 'Player wins', 'Random'], answer: 0, explain: 'By default a double bust is a push (the host can change it).' },
      { q: 'How much is a King worth?', options: ['10', '13', '11', '1'], answer: 0, explain: 'J, Q, K are all worth 10.' },
      { q: 'What are two aces called?', options: ['Xì bàng', 'Xì dách', 'Ngũ linh', 'A pair'], answer: 0, explain: 'Two aces is xì bàng — the best hand.' },
    ],
  },
};

export function lessons(lang) {
  const c = T[lang] || T.vi;
  return [
    { id: 'goal', title: c.lessons.goal, blocks: [{ type: 'steps', items: c.goal }] },
    { id: 'points', title: c.lessons.points, blocks: [{ type: 'defs', items: c.points }] },
    {
      id: 'special',
      title: c.lessons.special,
      blocks: [
        { type: 'ranks', items: [
          [c.special[0][0], ['AS', 'AH'], c.special[0][1]],
          [c.special[1][0], ['AD', 'KC'], c.special[1][1]],
          [c.special[2][0], ['2C', '3D', '4H', '2S', '5C'], c.special[2][1]],
          [c.special[3][0], ['KS', 'QH', '5C'], c.special[3][1]],
          [c.special[4][0], ['9S', '6H'], c.special[4][1]],
        ] },
      ],
    },
    { id: 'turns', title: c.lessons.turns, blocks: [{ type: 'steps', items: c.turns }] },
    { id: 'pay', title: c.lessons.pay, blocks: [{ type: 'defs', items: c.pay }] },
  ];
}

export const title = (lang) => (T[lang] || T.vi).title;

const PLAYER = { aceRule: 'flex', minAge: XIDACH_DEFAULTS.playerMin };
const DEALER = { aceRule: 'flex', minAge: XIDACH_DEFAULTS.dealerMin };
const TARGETS = ['xibang', 'xidach', 'ngulinh', 'quac', 'non', 'normal'];

/** Draws a hand whose classification is `target` (rejection sampling over real deals). */
function handOf(target, rand, opts = PLAYER) {
  for (let i = 0; i < 5000; i++) {
    let cards;
    if (target === 'xibang') cards = shuffled(['AS', 'AC', 'AD', 'AH'], rand).slice(0, 2);
    else {
      const n = target === 'ngulinh' ? 5 : target === 'xidach' ? 2 : 2 + Math.floor(rand() * 3);
      cards = shuffled(DECK, rand).slice(0, n);
    }
    const r = classify(cards, opts);
    if (r.kind === target) return { cards, r };
  }
  throw new Error(`no hand for ${target}`);
}

const label = (c, r) => (r.kind === 'normal' ? c.pts(r.total) : c.kinds[r.kind]);

function kindQuestion(c, rand) {
  const { cards, r } = handOf(pick(TARGETS, rand), rand);
  const answer = r.kind === 'normal' ? `pts:${r.total}` : r.kind;
  const all = [
    ...Object.keys(c.kinds).map((k) => ({ v: k, label: c.kinds[k] })),
    ...[16, 17, 18, 19, 20, 21].map((n) => ({ v: `pts:${n}`, label: c.pts(n) })),
  ];
  return { prompt: c.qKind, groups: [{ label: c.cards, cards }], options: optionsWith(answer, all, 4, rand), answer, explain: c.whyKind(label(c, r)) };
}

function whoQuestion(c, rand) {
  const p = handOf(pick(TARGETS, rand), rand, PLAYER);
  const dTargets = ['normal', 'normal', 'quac', 'ngulinh', 'xidach', 'non'];
  const d = handOf(pick(dTargets, rand), rand, DEALER);
  // Avoid sharing cards between the two hands.
  if (p.cards.some((x) => d.cards.includes(x))) return whoQuestion(c, rand);
  const res = compareHands(p.r, d.r, XIDACH_DEFAULTS);
  const answer = res.outcome > 0 ? 'player' : res.outcome < 0 ? 'dealer' : 'push';
  const word = { player: c.player, dealer: c.dealer, push: c.push }[answer];
  return {
    prompt: c.qWho,
    groups: [
      { label: c.player, cards: p.cards, half: true },
      { label: c.dealer, cards: d.cards, half: true },
    ],
    options: [
      { v: 'player', label: c.player },
      { v: 'push', label: c.push },
      { v: 'dealer', label: c.dealer },
    ],
    answer,
    explain: c.whyWho(label(c, p.r), label(c, d.r), word),
  };
}

function payQuestion(c, rand) {
  const kind = pick(['normal', 'xidach', 'xibang', 'ngulinh'], rand);
  const bet = pick([10, 20, 50, 100], rand);
  const pay = XIDACH_DEFAULTS.payouts;
  const result = { outcome: 1, mult: pay[kind] };
  const win = settleDelta(bet, result);
  const kindName = kind === 'normal' ? c.pts(19) : c.kinds[kind];
  const all = [1, 2, 3, 4].map((m) => ({ v: String(m * bet), label: String(m * bet) }));
  return { prompt: c.qPay(kindName, bet), groups: [], options: optionsWith(String(win), all, 4, rand), answer: String(win), explain: c.whyPay(pay[kind], bet) };
}

export function exam(lang, rand = Math.random) {
  const c = T[lang] || T.vi;
  const gen = [];
  for (let i = 0; i < 3; i++) gen.push(kindQuestion(c, rand));
  for (let i = 0; i < 3; i++) gen.push(whoQuestion(c, rand));
  gen.push(payQuestion(c, rand));
  return assemble(gen, c.bank, 3, rand);
}
