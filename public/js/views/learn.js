// "Học luật Poker" — a beginner's guide to Texas Hold'em with a practice quiz.
import { esc } from '../lib/esc.js';
import { getLang } from '../lib/i18n.js';
import { cardHtml } from '../ui/cards.js';
import { bestHand, CATEGORIES } from '../domain/holdem.js';
import { DECK } from '../domain/cards.js';

const C = {
  vi: {
    title: 'Học luật Poker (Texas Hold’em)',
    tabs: { rankings: 'Thứ tự bài', flow: 'Cách chơi', actions: 'Hành động', tips: 'Mẹo', quiz: 'Luyện tập' },
    rankIntro: 'Dùng 5 lá tốt nhất từ 2 lá riêng + 5 lá chung. Mạnh → yếu (chạm để xem giải thích):',
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
    rankNote: 'Chất không phân hơn thua trong Poker: hai tay bằng nhau thì chia đôi pot.',
    flow: [
      ['Blind', 'Hai người bên trái nút Dealer (D) bỏ tiền bắt buộc: Small Blind (SB) và Big Blind (BB). Nút D xoay vòng mỗi ván.'],
      ['Preflop', 'Mỗi người nhận 2 lá úp. Người bên trái BB nói trước, lần lượt theo chiều kim đồng hồ.'],
      ['Flop', 'Lật 3 lá chung. Vòng cược mới, bắt đầu từ người còn lại đầu tiên bên trái nút D.'],
      ['Turn', 'Lật lá chung thứ 4. Thêm một vòng cược.'],
      ['River', 'Lật lá chung thứ 5. Vòng cược cuối.'],
      ['Showdown', 'Người còn lại lật bài; tay 5 lá mạnh nhất thắng pot. Nếu mọi người khác bỏ bài, người còn lại thắng ngay, không cần lật.'],
    ],
    actions: [
      ['Bỏ bài (Fold)', 'Bỏ tay bài, mất số chip đã bỏ vào pot.'],
      ['Xem (Check)', 'Không cược thêm — chỉ được khi chưa ai cược ở vòng này.'],
      ['Theo (Call)', 'Bỏ thêm chip cho bằng mức cược cao nhất.'],
      ['Cược / Tố (Bet / Raise)', 'Đặt cược hoặc nâng mức cược. Mức tố tối thiểu = mức nâng gần nhất (ít nhất 1 BB).'],
      ['All-in', 'Bỏ hết chip. Nếu ít chip hơn mức cược, bạn chỉ thắng được phần tương ứng (main pot); phần dư thành side pot cho những người còn lại.'],
    ],
    sideTitle: 'Ví dụ side pot',
    side: 'An all-in 50, Bình và Cúc mỗi người 200 → main pot 150 (cả ba có quyền thắng) và side pot 300 (chỉ Bình và Cúc).',
    tips: [
      'Bắt đầu chặt tay: chơi đôi lớn (AA, KK, QQ, JJ), A-K, A-Q; bỏ phần lớn các tay nhỏ lẻ.',
      'Vị trí rất quan trọng: nói sau (gần nút D) giúp bạn có nhiều thông tin hơn.',
      'Đừng theo chỉ vì đã bỏ nhiều chip vào pot — chip đã bỏ không còn là của bạn.',
      'Nhìn bài chung: có 3–4 lá cùng chất hay liên tiếp thì đối thủ có thể có Thùng hoặc Sảnh.',
      'Dùng nút “?” cạnh bài của bạn để xem nhanh thứ tự bài khi đang chơi.',
    ],
    quizQ: 'Ai thắng ván này?',
    quizA: 'Tay A',
    quizB: 'Tay B',
    quizTie: 'Hòa (chia pot)',
    quizNext: 'Câu khác',
    board: 'Bài chung',
    right: 'Chính xác!',
    wrong: 'Chưa đúng.',
    score: 'Điểm',
    winner: (w) => (w === 'tie' ? 'Hai tay bằng nhau.' : `Tay ${w.toUpperCase()} thắng.`),
    close: 'Đóng',
    funNote: 'Chỉ để giải trí – không dùng tiền thật',
  },
  en: {
    title: 'Learn Poker (Texas Hold’em)',
    tabs: { rankings: 'Hand rankings', flow: 'How a hand works', actions: 'Actions', tips: 'Tips', quiz: 'Practice' },
    rankIntro: 'Best five of your 2 hole cards + 5 community cards. Strongest first (tap for details):',
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
    rankNote: 'Suits never break ties in poker: equal hands split the pot.',
    flow: [
      ['Blinds', 'The two players left of the Dealer button (D) post forced bets: Small Blind (SB) and Big Blind (BB). The button moves every hand.'],
      ['Pre-flop', 'Everyone gets 2 face-down cards. The player left of the BB acts first, then clockwise.'],
      ['Flop', 'Three community cards. A new betting round starts with the first live player left of the button.'],
      ['Turn', 'The fourth community card, another betting round.'],
      ['River', 'The fifth community card, the last betting round.'],
      ['Showdown', 'Remaining players show; the best five-card hand wins. If everyone else folds, the last player wins without showing.'],
    ],
    actions: [
      ['Fold', 'Give up the hand and the chips you already put in.'],
      ['Check', 'Bet nothing — only when nobody has bet this round.'],
      ['Call', 'Match the highest bet.'],
      ['Bet / Raise', 'Put chips in, or increase the bet. A raise must be at least the previous raise (minimum one big blind).'],
      ['All-in', 'Put in all your chips. With fewer chips than the bet you can only win the matching part (main pot); the rest becomes a side pot for the others.'],
    ],
    sideTitle: 'Side pot example',
    side: 'An goes all-in for 50, Bình and Cúc put in 200 each → main pot 150 (all three can win) and side pot 300 (only Bình and Cúc).',
    tips: [
      'Start tight: play big pairs (AA, KK, QQ, JJ), A-K, A-Q; fold most small unconnected hands.',
      'Position matters: acting later (near the button) gives you more information.',
      'Don’t call just because you already put chips in — they are no longer yours.',
      'Read the board: 3–4 cards of one suit or in a row mean someone may hold a flush or straight.',
      'Tap “?” next to your cards for a quick hand-ranking chart while playing.',
    ],
    quizQ: 'Who wins this hand?',
    quizA: 'Hand A',
    quizB: 'Hand B',
    quizTie: 'Tie (split pot)',
    quizNext: 'Another one',
    board: 'Board',
    right: 'Correct!',
    wrong: 'Not quite.',
    score: 'Score',
    winner: (w) => (w === 'tie' ? 'The hands are equal.' : `Hand ${w.toUpperCase()} wins.`),
    close: 'Close',
    funNote: 'For fun only – no real money',
  },
};

const EXAMPLES = {
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

const L = () => C[getLang()] || C.vi;

/** A fresh practice question: board + two hands, with the answer. */
export function newQuiz(rand = Math.random) {
  const d = [...DECK];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  const a = d.slice(0, 2);
  const b = d.slice(2, 4);
  const board = d.slice(4, 9);
  const ha = bestHand([...a, ...board]);
  const hb = bestHand([...b, ...board]);
  const answer = ha.score > hb.score ? 'a' : hb.score > ha.score ? 'b' : 'tie';
  return { a, b, board, answer, ha: { category: ha.category, cards: ha.cards }, hb: { category: hb.category, cards: hb.cards } };
}

export function learnView(app) {
  const c = L();
  const tab = app.ui.learn || 'rankings';
  const tabs = Object.entries(c.tabs)
    .map(([k, label]) => `<button role="tab" class="tab ${k === tab ? 'on' : ''}" aria-selected="${k === tab}" data-act="learnTab" data-v="${k}">${esc(label)}</button>`)
    .join('');
  let body = '';
  if (tab === 'rankings') {
    body = `<p class="small">${esc(c.rankIntro)}</p><ol class="ranks">${[...CATEGORIES]
      .reverse()
      .map(
        (k, i) => `<li><details><summary class="rank-head"><span class="rank-no">${i + 1}</span><b>${esc(c.ranks[k][0])}</b>
          <span class="rank-cards">${EXAMPLES[k].map((card) => cardHtml(card, { size: 'xs' })).join('')}</span></summary>
          <p class="small muted">${esc(c.ranks[k][1])}</p></details></li>`,
      )
      .join('')}</ol><p class="small">${esc(c.rankNote)}</p>`;
  } else if (tab === 'flow') {
    body = `<ol class="steps">${c.flow.map(([h, p]) => `<li><b>${esc(h)}</b><p class="small">${esc(p)}</p></li>`).join('')}</ol>`;
  } else if (tab === 'actions') {
    body = `<dl class="defs">${c.actions.map(([h, p]) => `<dt>${esc(h)}</dt><dd class="small">${esc(p)}</dd>`).join('')}</dl>
      <h3>${esc(c.sideTitle)}</h3><p class="small">${esc(c.side)}</p>`;
  } else if (tab === 'tips') {
    body = `<ul class="tips">${c.tips.map((x) => `<li class="small">${esc(x)}</li>`).join('')}</ul>`;
  } else {
    const q = (app.ui.quiz ||= newQuiz());
    const picked = app.ui.quizPick;
    const handLabel = (h) => esc(c.ranks[h.category][0]);
    const hand = (key, cards, h) => `<div class="quiz-hand ${picked && q.answer === key ? 'won' : ''}">
        <div class="small"><b>${key === 'a' ? esc(c.quizA) : esc(c.quizB)}</b>${picked ? ` · ${handLabel(h)}` : ''}</div>
        <div class="rank-cards">${cards.map((card) => cardHtml(card, { size: 'md', extra: picked && h.cards.includes(card) ? 'in-best' : '' })).join('')}</div></div>`;
    body = `<p><b>${esc(c.quizQ)}</b> <span class="muted small">${esc(c.score)}: ${app.ui.quizScore || 0}/${app.ui.quizCount || 0}</span></p>
      <div class="small muted">${esc(c.board)}</div>
      <div class="rank-cards quiz-board">${q.board.map((card) => cardHtml(card, { size: 'md', extra: picked && (q.ha.cards.includes(card) || q.hb.cards.includes(card)) ? 'in-best' : '' })).join('')}</div>
      <div class="quiz-hands">${hand('a', q.a, q.ha)}${hand('b', q.b, q.hb)}</div>
      ${
        picked
          ? `<p class="quiz-result ${picked === q.answer ? 'up' : 'down'}"><b>${esc(picked === q.answer ? c.right : c.wrong)}</b> ${esc(c.winner(q.answer))}</p>
             <button class="btn primary block" data-act="quizNext">${esc(c.quizNext)}</button>`
          : `<div class="row quiz-choices">
               <button class="btn grow" data-act="quizPick" data-v="a">${esc(c.quizA)}</button>
               <button class="btn grow" data-act="quizPick" data-v="tie">${esc(c.quizTie)}</button>
               <button class="btn grow" data-act="quizPick" data-v="b">${esc(c.quizB)}</button>
             </div>`
      }`;
  }
  return `<div class="overlay learn-overlay" data-act="learnClose">
    <div class="sheet learn" role="dialog" aria-modal="true" aria-label="${esc(c.title)}" data-stop>
      <div class="learn-head"><h2>${esc(c.title)}</h2><button class="btn ghost icon" data-act="learnClose" aria-label="${esc(c.close)}">✕</button></div>
      <nav class="tabs" role="tablist">${tabs}</nav>
      <div class="learn-body">${body}</div>
      <p class="note">${esc(c.funNote)}</p>
    </div></div>`;
}
