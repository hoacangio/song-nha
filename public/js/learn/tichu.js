// Course: Tichu for beginners. Pure data + exam generator graded by the real rules.
import { detectCombo, canBeat, pointsOf, TICHU_DECK, sortTichu, TICHU_DEFAULTS as D, isSpecial } from '../domain/tichu.js';
import { shuffled, pick, assemble } from './common.js';

const T = {
  vi: {
    title: 'Tichu cơ bản',
    lessons: { cards: 'Bộ bài', combos: 'Các bộ', flow: 'Chia & chuyền', turns: 'Đánh bài', scoring: 'Tính điểm', tips: 'Mẹo' },
    deck: [
      ['4 người, 2 đội', 'Đồng đội ngồi đối diện; đội nào đạt 1000 điểm trước thắng trận.'],
      ['56 lá', '52 lá thường (2 → A, chất không tính) + 4 lá đặc biệt.'],
      ['Mạt chược (1)', 'Nhỏ nhất. Người có nó đi đầu, đánh ra thì được “ước” một số.'],
      ['Chó', 'Chỉ ra khi đi đầu: trao quyền đi cho đồng đội.'],
      ['Phượng', 'Thay lá bất kỳ trong bộ (trừ bom); đánh lẻ = lá trước + ½. −25 điểm.'],
      ['Rồng', 'Lá lẻ lớn nhất, chỉ bom chặn được. +25 điểm, nhưng nước đó phải cho đối thủ.'],
      ['Điểm lá', '5 = 5; 10 và K = 10; Rồng +25; Phượng −25. Cả bộ = 100.'],
    ],
    combos: [
      ['Lẻ', ['9C'], '1 lá.'],
      ['Đôi', ['QS', 'QH'], '2 lá cùng số (Phượng thay được 1 lá).'],
      ['Sám', ['7S', '7D', '7H'], '3 lá cùng số.'],
      ['Cù lũ', ['4S', '4D', '4C', 'JH', 'JS'], 'Sám + đôi (so bằng sám).'],
      ['Sảnh', ['MJ', '2D', '3S', '4H', '5C'], 'Từ 5 lá liên tiếp, Mạt chược làm 1 được.'],
      ['Đôi thông', ['8S', '8H', '9D', '9C'], 'Từ 2 đôi liên tiếp trở lên.'],
      ['Bom tứ quý', ['6S', '6C', '6D', '6H'], 'Chặn mọi bộ thường. Đánh được cả khi chưa tới lượt!'],
      ['Bom thùng phá sảnh', ['3H', '4H', '5H', '6H', '7H'], 'Sảnh 5+ lá cùng chất: lớn hơn bom tứ quý.'],
    ],
    flow: [
      ['Grand Tichu', 'Chia 8 lá đầu: ai tự tin về nhất có thể gọi Grand Tichu (+200 / −200) trước khi xem 6 lá còn lại.'],
      ['Chuyền bài', 'Đủ 14 lá: mỗi người chuyền 1 lá cho người sau, 1 cho đồng đội, 1 cho người trước.'],
      ['Tichu', 'Trước khi ra lá đầu tiên, có thể gọi Tichu (+100 / −100): hứa sẽ về nhất.'],
    ],
    turns: [
      ['Đi đầu', 'Người có Mạt chược đi trước. Đánh Mạt chược thì được ước một số: ai có số đó và đánh được thì bắt buộc đánh.'],
      ['Lượt', 'Chặn bằng cùng loại, cùng số lá, lớn hơn — hoặc bỏ lượt. Bỏ lượt vẫn được đánh khi tới lượt lần sau trong cùng nước.'],
      ['Ăn nước', 'Ba người liên tiếp bỏ lượt: người đánh cuối ăn hết lá trong nước và đi tiếp.'],
      ['Hết ván', 'Khi 3 người hết bài — hoặc hai đồng đội về nhất và nhì (thắng đôi).'],
    ],
    scoring: [
      ['Thắng đôi', `Hai đồng đội về nhất, nhì: đội đó +${D.doubleWin}, không đếm điểm lá.`],
      ['Người bét', 'Bài còn trên tay đưa cho đội đối thủ; các nước đã ăn đưa cho người về nhất.'],
      ['Điểm đội', 'Cộng điểm lá trong các nước mỗi đội đã ăn.'],
      ['Gọi', `Tichu: về nhất +${D.tichuBonus}, không thì −${D.tichuBonus}. Grand Tichu: ±${D.grandBonus}.`],
      ['Trận', `Cộng dồn qua các ván tới ${D.target} điểm. Chip trả theo điểm chênh mỗi ván.`],
    ],
    tips: [
      'Chuyền cho đồng đội lá to (A, K…), cho đối thủ lá nhỏ hoặc Chó.',
      'Đồng đội đang thắng nước thì thường nên bỏ lượt, đừng chặn bạn mình.',
      'Giữ bom để chặn đối thủ sắp hết bài hoặc phá Tichu của họ.',
      'Ra Chó khi đồng đội mạnh (hoặc đã gọi Tichu) để trao quyền đi cho bạn.',
      'Chỉ gọi Tichu khi có Rồng/Phượng, nhiều A hoặc có bom.',
    ],
    types: { single: 'Lẻ', pair: 'Đôi', triple: 'Sám', full: 'Cù lũ', straight: 'Sảnh', pairs: 'Đôi thông', bomb4: 'Bom tứ quý', bombsf: 'Bom thùng phá sảnh', dog: 'Chó', invalid: 'Không phải bộ hợp lệ' },
    qType: 'Những lá này là bộ gì?',
    qBeat: 'Bài của bạn có chặn được bài trên bàn không?',
    qPoints: 'Nước này bao nhiêu điểm?',
    table: 'Trên bàn',
    yours: 'Bài của bạn',
    cards: 'Các lá',
    yes: 'Chặn được',
    no: 'Không chặn được',
    whyType: (x) => `Đây là: ${x}.`,
    whyBeat: (ok, a, b) => (ok ? `${b} chặn được ${a}.` : `${b} không chặn được ${a}: cần cùng loại, cùng số lá và lớn hơn (hoặc một quả bom).`),
    whyPoints: (n) => `5 = 5, 10 và K = 10, Rồng +25, Phượng −25 → ${n} điểm.`,
    bank: [
      { q: 'Ai đi đầu ván?', options: ['Người có Mạt chược', 'Người có Rồng', 'Chủ bàn', 'Người gọi Tichu'], answer: 0, explain: 'Mạt chược luôn đi đầu.' },
      { q: 'Ăn nước có Rồng thì sao?', options: ['Phải cho một đối thủ', 'Giữ lại', 'Cho đồng đội', 'Bỏ đi'], answer: 0, explain: 'Rồng +25 điểm nhưng nước đó phải tặng một đối thủ.' },
      { q: 'Gọi Tichu thành công khi nào?', options: ['Người gọi về nhất', 'Đội người gọi thắng ván', 'Người gọi không về bét', 'Ăn được Rồng'], answer: 0, explain: 'Tichu = hứa về nhất: +100, không thì −100.' },
      { q: 'Bom đánh được khi nào?', options: ['Bất cứ lúc nào trên bàn có bài, cả khi chưa tới lượt', 'Chỉ khi tới lượt', 'Chỉ khi đi đầu', 'Chỉ ở nước cuối'], answer: 0, explain: 'Bom có thể chen ngang bất kỳ lúc nào.' },
      { q: 'Phượng đánh lẻ có giá trị?', options: ['Lá trước + ½', '1', 'Lớn nhất', '0'], answer: 0, explain: 'Phượng lẻ cao hơn lá trước nửa bậc, nhưng không chặn được Rồng.' },
      { q: 'Thắng đôi là gì?', options: ['Hai đồng đội về nhất và nhì', 'Thắng hai ván liên tiếp', 'Có hai quả bom', 'Gọi cả Tichu và Grand'], answer: 0, explain: `Thắng đôi: +${D.doubleWin} cho đội đó.` },
    ],
  },
  en: {
    title: 'Tichu basics',
    lessons: { cards: 'The deck', combos: 'Combinations', flow: 'Deal & pass', turns: 'Playing', scoring: 'Scoring', tips: 'Tips' },
    deck: [
      ['4 players, 2 teams', 'Partners sit opposite; the first team to 1000 points wins the match.'],
      ['56 cards', '52 normal cards (2 → A, suits don’t rank) + 4 specials.'],
      ['Mah Jong (1)', 'Lowest. Its holder leads; playing it lets you make a wish.'],
      ['Dog', 'Only as a lead: hands the lead to your partner.'],
      ['Phoenix', 'Wild in combinations (not bombs); as a single, ½ above the last one. −25.'],
      ['Dragon', 'Highest single, only bombs beat it. +25, but its trick goes to an opponent.'],
      ['Card points', '5 = 5; 10 and K = 10; Dragon +25; Phoenix −25. Total 100.'],
    ],
    combos: [
      ['Single', ['9C'], 'One card.'],
      ['Pair', ['QS', 'QH'], 'Two of a rank (the Phoenix may stand in).'],
      ['Triple', ['7S', '7D', '7H'], 'Three of a rank.'],
      ['Full house', ['4S', '4D', '4C', 'JH', 'JS'], 'Triple + pair (ranked by the triple).'],
      ['Straight', ['MJ', '2D', '3S', '4H', '5C'], '5+ in a row; the Mah Jong counts as 1.'],
      ['Consecutive pairs', ['8S', '8H', '9D', '9C'], '2+ pairs in a row.'],
      ['Four-of-a-kind bomb', ['6S', '6C', '6D', '6H'], 'Beats any normal play. Can be played out of turn!'],
      ['Straight-flush bomb', ['3H', '4H', '5H', '6H', '7H'], '5+ in a row, one suit: beats four-of-a-kind bombs.'],
    ],
    flow: [
      ['Grand Tichu', 'After 8 cards, call Grand Tichu (+200 / −200) if you expect to go out first — before seeing the other 6.'],
      ['Passing', 'With 14 cards, everyone passes 1 card to the next player, 1 to their partner, 1 to the previous player.'],
      ['Tichu', 'Before playing your first card you may call Tichu (+100 / −100): a promise to go out first.'],
    ],
    turns: [
      ['Leading', 'The Mah Jong holder leads. Playing it lets you wish for a rank: whoever holds it and can play it must.'],
      ['Turns', 'Beat with the same type and size, higher — or pass. Passing doesn’t stop you playing on your next turn in the same trick.'],
      ['Winning a trick', 'Three passes in a row: the last player takes the cards and leads.'],
      ['End', 'When three players are out — or partners go out first and second (double victory).'],
    ],
    scoring: [
      ['Double victory', `Partners out 1st and 2nd: +${D.doubleWin} to that team, card points aren’t counted.`],
      ['Last player', 'Cards left in hand go to the other team; their tricks go to whoever went out first.'],
      ['Team points', 'Add up the card points in the tricks each team took.'],
      ['Calls', `Tichu: out first +${D.tichuBonus}, otherwise −${D.tichuBonus}. Grand Tichu: ±${D.grandBonus}.`],
      ['Match', `Scores add up over hands to ${D.target}. Chips follow each hand’s point difference.`],
    ],
    tips: [
      'Pass your partner a strong card (A, K…), your opponents low cards or the Dog.',
      'When your partner is winning the trick, usually pass instead of beating them.',
      'Save bombs to stop an opponent about to go out or to break their Tichu.',
      'Lead the Dog when your partner is strong (or called Tichu) to hand them the lead.',
      'Call Tichu only with the Dragon/Phoenix, several aces or a bomb.',
    ],
    types: { single: 'Single', pair: 'Pair', triple: 'Triple', full: 'Full house', straight: 'Straight', pairs: 'Consecutive pairs', bomb4: 'Four-of-a-kind bomb', bombsf: 'Straight-flush bomb', dog: 'Dog', invalid: 'Not a valid combination' },
    qType: 'What combination is this?',
    qBeat: 'Can your cards beat the cards on the table?',
    qPoints: 'How many points is this trick worth?',
    table: 'On the table',
    yours: 'Your cards',
    cards: 'Cards',
    yes: 'Yes, it beats it',
    no: 'No',
    whyType: (x) => `It is: ${x}.`,
    whyBeat: (ok, a, b) => (ok ? `${b} beats ${a}.` : `${b} does not beat ${a}: same type, same size and higher (or a bomb).`),
    whyPoints: (n) => `5 = 5, 10 and K = 10, Dragon +25, Phoenix −25 → ${n} points.`,
    bank: [
      { q: 'Who leads the hand?', options: ['The Mah Jong holder', 'The Dragon holder', 'The host', 'Whoever called Tichu'], answer: 0, explain: 'The Mah Jong always leads.' },
      { q: 'You win a trick with the Dragon…', options: ['Give it to an opponent', 'Keep it', 'Give it to your partner', 'Discard it'], answer: 0, explain: 'The Dragon is +25 but its trick goes to an opponent.' },
      { q: 'A Tichu call succeeds when…', options: ['The caller goes out first', 'The caller’s team wins the hand', 'The caller isn’t last', 'They win the Dragon'], answer: 0, explain: 'Tichu = a promise to go out first: +100, or −100.' },
      { q: 'When can a bomb be played?', options: ['Any time there are cards on the table, even out of turn', 'Only on your turn', 'Only as a lead', 'Only in the last trick'], answer: 0, explain: 'Bombs can interrupt at any time.' },
      { q: 'A single Phoenix is worth…', options: ['The last single + ½', '1', 'The highest card', '0'], answer: 0, explain: 'Half a rank above the previous single — but never above the Dragon.' },
      { q: 'A double victory is…', options: ['Partners going out 1st and 2nd', 'Winning two hands in a row', 'Holding two bombs', 'Calling both Tichu and Grand'], answer: 0, explain: `Double victory: +${D.doubleWin} to that team.` },
    ],
  },
};

export function lessons(lang) {
  const c = T[lang] || T.vi;
  return [
    { id: 'cards', title: c.lessons.cards, blocks: [{ type: 'defs', items: c.deck }, { type: 'cards', cards: ['MJ', 'DG', 'PH', 'DR', '5H', 'TS', 'KD'] }] },
    { id: 'combos', title: c.lessons.combos, blocks: [{ type: 'ranks', items: c.combos }] },
    { id: 'flow', title: c.lessons.flow, blocks: [{ type: 'steps', items: c.flow }] },
    { id: 'turns', title: c.lessons.turns, blocks: [{ type: 'steps', items: c.turns }] },
    { id: 'scoring', title: c.lessons.scoring, blocks: [{ type: 'defs', items: c.scoring }] },
    { id: 'tips', title: c.lessons.tips, blocks: [{ type: 'tips', items: c.tips }] },
  ];
}

export const title = (lang) => (T[lang] || T.vi).title;

const NORMAL = TICHU_DECK.filter((c) => !isSpecial(c));
const R = '23456789TJQKA';
const sameRank = (v, k, rand) => shuffled(NORMAL.filter((c) => c[0] === R[v]), rand).slice(0, k);

/** A random combination of a given shape. */
function makePlay(rand) {
  const v = Math.floor(rand() * 13);
  const w = (v + 1 + Math.floor(rand() * 12)) % 13;
  const run = (len, suit) => {
    const low = Math.floor(rand() * (13 - len + 1));
    return Array.from({ length: len }, (_, i) => R[low + i] + (suit || 'SCDH'[Math.floor(rand() * 4)]));
  };
  const makers = [
    () => [pick(NORMAL, rand)],
    () => sameRank(v, 2, rand),
    () => [sameRank(v, 1, rand)[0], 'PH'],
    () => sameRank(v, 3, rand),
    () => [...sameRank(v, 3, rand), ...sameRank(w, 2, rand)],
    () => run(5 + Math.floor(rand() * 3)),
    () => {
      const low = Math.floor(rand() * 11);
      return [...sameRank(low, 2, rand), ...sameRank(low + 1, 2, rand)];
    },
    () => sameRank(v, 4, rand),
    () => run(5, 'H'),
    () => ['DR'],
    () => ['PH'],
    () => ['DG'],
    () => [sameRank(v, 1, rand)[0], sameRank(w, 1, rand)[0]], // not a combination
  ];
  for (;;) {
    const cards = pick(makers, rand)();
    if (new Set(cards).size === cards.length) return cards;
  }
}

const label = (c, k) => (k ? c.types[k.type] : c.types.invalid);

function typeQuestion(c, rand) {
  const cards = makePlay(rand);
  const k = detectCombo(cards);
  const answer = k ? k.type : 'invalid';
  const all = Object.keys(c.types).map((v) => ({ v, label: c.types[v] }));
  const others = shuffled(all.filter((o) => o.v !== answer), rand).slice(0, 3);
  return {
    prompt: c.qType,
    groups: [{ label: c.cards, cards: sortTichu(cards) }],
    options: shuffled([all.find((o) => o.v === answer), ...others], rand),
    answer,
    explain: c.whyType(label(c, k)),
  };
}

function beatQuestion(c, rand) {
  for (;;) {
    const table = makePlay(rand);
    const tk = detectCombo(table);
    if (!tk || tk.type === 'dog') continue;
    const mine = makePlay(rand);
    if (mine.some((x) => table.includes(x))) continue;
    const mk = detectCombo(mine, tk);
    if (!mk) continue;
    const ok = canBeat(tk, mk);
    return {
      prompt: c.qBeat,
      groups: [
        { label: c.table, cards: sortTichu(table) },
        { label: c.yours, cards: sortTichu(mine) },
      ],
      options: [
        { v: 'yes', label: c.yes },
        { v: 'no', label: c.no },
      ],
      answer: ok ? 'yes' : 'no',
      explain: c.whyBeat(ok, label(c, tk), label(c, mk)),
    };
  }
}

function pointsQuestion(c, rand) {
  const pool = shuffled([...NORMAL.filter((x) => '5TK'.includes(x[0])), 'DR', 'PH', ...shuffled(NORMAL, rand).slice(0, 6)], rand);
  const cards = [...new Set(pool)].slice(0, 4 + Math.floor(rand() * 3));
  const n = pointsOf(cards);
  const wrong = shuffled([n + 5, n - 5, n + 10, n - 10, n + 25, n - 25, n + 15], rand).filter((x) => x !== n).slice(0, 3);
  return {
    prompt: c.qPoints,
    groups: [{ label: c.cards, cards: sortTichu(cards) }],
    options: shuffled([n, ...wrong], rand).map((x) => ({ v: String(x), label: String(x) })),
    answer: String(n),
    explain: c.whyPoints(n),
  };
}

export function exam(lang, rand = Math.random) {
  const c = T[lang] || T.vi;
  const gen = [];
  for (let i = 0; i < 3; i++) gen.push(typeQuestion(c, rand));
  for (let i = 0; i < 2; i++) gen.push(beatQuestion(c, rand));
  for (let i = 0; i < 2; i++) gen.push(pointsQuestion(c, rand));
  return assemble(gen, c.bank, 3, rand);
}
