// "Học luật chơi bài": a course per game (lessons → exam → downloadable certificate).
// Every tab fits the screen without scrolling.
import { esc } from '../lib/esc.js';
import { getLang } from '../lib/i18n.js';
import { cardHtml } from '../ui/cards.js';
import { COURSES, COURSE_IDS, EXAM_SIZE, PASS_SCORE, isComplete, lessonsDone, lessonCount } from '../learn/index.js';

const S = {
  vi: {
    title: 'Học luật chơi bài',
    games: { xidach: 'Xì dách', tienlen: 'Tiến lên', holdem: "Hold'em" },
    exam: 'Kiểm tra',
    cert: 'Chứng chỉ',
    close: 'Đóng',
    intro: (n, p) => `${n} câu hỏi, đúng từ ${p} câu trở lên là đạt. Câu hỏi được tạo ngẫu nhiên và chấm theo đúng luật của game.`,
    best: (b) => `Điểm cao nhất: ${b}/${EXAM_SIZE}`,
    start: 'Bắt đầu kiểm tra',
    q: (i, n, k) => `Câu ${i}/${n} · đúng ${k}`,
    right: 'Chính xác!',
    wrong: 'Chưa đúng.',
    next: 'Câu tiếp',
    result: 'Xem kết quả',
    passed: (sc) => `Đạt! ${sc}/${EXAM_SIZE} câu đúng.`,
    failed: (sc) => `Chưa đạt: ${sc}/${EXAM_SIZE}. Cần ${PASS_SCORE} câu đúng.`,
    retry: 'Làm lại',
    getCert: 'Nhận chứng chỉ 🏅',
    readAll: 'Hãy đọc hết các bài học để nhận chứng chỉ.',
    needTitle: 'Để nhận chứng chỉ khoá này:',
    needLessons: (d, n) => `Đọc các bài học (${d}/${n})`,
    needExam: `Đạt bài kiểm tra (≥ ${PASS_SCORE}/${EXAM_SIZE})`,
    toExam: 'Làm bài kiểm tra',
    name: 'Tên trên chứng chỉ',
    askName: 'Bạn tên gì?',
    askNameHelp: 'Tên này sẽ in trên chứng chỉ và cũng là tên của bạn khi vào bàn. Bạn có thể đổi sau.',
    namePh: 'Ví dụ: Hòa',
    makeFirst: 'Lưu tên & tạo chứng chỉ',
    make: 'Cập nhật',
    download: 'Tải chứng chỉ (PNG)',
    making: 'Đang tạo chứng chỉ…',
    note: 'Chứng chỉ được tạo ngay trên máy của bạn, chỉ để giải trí.',
  },
  en: {
    title: 'Learn the games',
    games: { xidach: 'Xì dách', tienlen: 'Tiến lên', holdem: "Hold'em" },
    exam: 'Exam',
    cert: 'Certificate',
    close: 'Close',
    intro: (n, p) => `${n} questions; ${p} or more correct to pass. Questions are generated at random and graded by the game's own rules.`,
    best: (b) => `Best score: ${b}/${EXAM_SIZE}`,
    start: 'Start the exam',
    q: (i, n, k) => `Question ${i}/${n} · ${k} correct`,
    right: 'Correct!',
    wrong: 'Not quite.',
    next: 'Next question',
    result: 'See the result',
    passed: (sc) => `Passed! ${sc}/${EXAM_SIZE} correct.`,
    failed: (sc) => `Not passed: ${sc}/${EXAM_SIZE}. You need ${PASS_SCORE}.`,
    retry: 'Try again',
    getCert: 'Get the certificate 🏅',
    readAll: 'Open every lesson to receive the certificate.',
    needTitle: 'To receive this certificate:',
    needLessons: (d, n) => `Read the lessons (${d}/${n})`,
    needExam: `Pass the exam (≥ ${PASS_SCORE}/${EXAM_SIZE})`,
    toExam: 'Take the exam',
    name: 'Name on the certificate',
    askName: 'What is your name?',
    askNameHelp: 'It is printed on the certificate and is also your name at the tables. You can change it later.',
    namePh: 'e.g. Hoa',
    makeFirst: 'Save name & create certificate',
    make: 'Update',
    download: 'Download certificate (PNG)',
    making: 'Creating your certificate…',
    note: 'The certificate is created on your device, just for fun.',
  },
};

export const learnLang = () => (getLang() === 'en' ? 'en' : 'vi');
const s = () => S[learnLang()];

function renderBlocks(blocks) {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'text':
          return `<p class="small ${b.hideShort ? 'hide-short' : ''}">${esc(b.p)}</p>`;
        case 'h':
          return `<h3>${esc(b.p)}</h3>`;
        case 'steps':
          return `<ol class="steps">${b.items.map(([h, p]) => `<li><b>${esc(h)}</b><p class="small">${esc(p)}</p></li>`).join('')}</ol>`;
        case 'defs':
          return `<dl class="defs">${b.items.map(([h, p]) => `<dt>${esc(h)}</dt><dd class="small">${esc(p)}</dd>`).join('')}</dl>`;
        case 'tips':
          return `<ul class="tips">${b.items.map((x) => `<li class="small">${esc(x)}</li>`).join('')}</ul>`;
        case 'cards':
          return `<div class="rank-cards">${b.cards.map((c) => cardHtml(c, { size: 'sm' })).join('')}</div>`;
        case 'ranks':
          return `<ol class="ranks">${b.items
            .map(
              ([name, cards, desc], i) => `<li><details><summary class="rank-head"><span class="rank-no">${i + 1}</span><b>${esc(name)}</b>
                <span class="rank-cards">${cards.map((c) => cardHtml(c, { size: 'xs' })).join('')}</span></summary>
                <p class="small muted">${esc(desc)}</p></details></li>`,
            )
            .join('')}</ol>`;
        default:
          return '';
      }
    })
    .join('');
}

function examBody(app, game) {
  const x = s();
  const ex = app.ui.exam?.game === game ? app.ui.exam : null;
  const prog = app.learnProg[game];
  if (!ex) {
    return `<div class="exam-intro">
      <p>${esc(x.intro(EXAM_SIZE, PASS_SCORE))}</p>
      <p class="muted small">${esc(x.best(prog.best))}</p>
      <button class="btn primary block" data-act="examStart">${esc(x.start)}</button></div>`;
  }
  if (ex.i >= ex.qs.length) {
    const ok = ex.score >= PASS_SCORE;
    const done = lessonsDone(game, prog, learnLang()) === lessonCount(game, learnLang());
    return `<div class="exam-result ${ok ? 'pass' : 'fail'}">
      <div class="big-score">${ex.score}/${EXAM_SIZE}</div>
      <p><b>${esc(ok ? x.passed(ex.score) : x.failed(ex.score))}</b></p>
      ${ok && !done ? `<p class="small">${esc(x.readAll)}</p>` : ''}
      <div class="row centered">
        <button class="btn" data-act="examStart">${esc(x.retry)}</button>
        ${ok && done ? `<button class="btn primary" data-act="learnTab" data-v="cert">${esc(x.getCert)}</button>` : ''}
      </div></div>`;
  }
  const q = ex.qs[ex.i];
  const picked = ex.picked;
  const hl = picked != null && q.highlight ? new Set(q.highlight) : null;
  const groups = q.groups.length
    ? `<div class="q-groups">${q.groups
        .map(
          (g) => `<div class="q-group ${g.half ? 'half' : ''}"><div class="small muted">${esc(g.label)}</div>
            <div class="rank-cards">${g.cards.map((c) => cardHtml(c, { size: 'md', extra: hl?.has(c) ? 'in-best' : '' })).join('')}</div></div>`,
        )
        .join('')}</div>`
    : '';
  const opts = q.options
    .map((o) => {
      const cls = picked == null ? '' : o.v === q.answer ? 'right' : o.v === picked ? 'wrong' : 'dim';
      return `<button class="btn opt ${cls}" data-act="examPick" data-v="${esc(o.v)}" ${picked != null ? 'disabled' : ''}>${esc(o.label)}</button>`;
    })
    .join('');
  return `<div class="exam">
    <div class="small muted">${esc(x.q(ex.i + 1, ex.qs.length, ex.score))}</div>
    <p class="q-prompt"><b>${esc(q.prompt)}</b></p>
    ${groups}
    <div class="q-options ${q.options.length > 3 ? 'grid2' : ''}">${opts}</div>
    ${
      picked != null
        ? `<p class="q-explain ${picked === q.answer ? 'up' : 'down'}"><b>${esc(picked === q.answer ? x.right : x.wrong)}</b> ${esc(q.explain)}</p>
           <button class="btn primary block" data-act="examNext">${esc(ex.i + 1 >= ex.qs.length ? x.result : x.next)}</button>`
        : ''
    }</div>`;
}

function certBody(app, game) {
  const x = s();
  const prog = app.learnProg[game];
  if (!isComplete(game, prog, learnLang())) {
    const d = lessonsDone(game, prog, learnLang());
    const n = lessonCount(game, learnLang());
    return `<div class="cert-need"><p><b>${esc(x.needTitle)}</b></p>
      <ul class="checklist">
        <li class="${d === n ? 'ok' : ''}">${d === n ? '✓' : '○'} ${esc(x.needLessons(d, n))}</li>
        <li class="${prog.best >= PASS_SCORE ? 'ok' : ''}">${prog.best >= PASS_SCORE ? '✓' : '○'} ${esc(x.needExam)} · ${esc(x.best(prog.best))}</li>
      </ul>
      <button class="btn primary block" data-act="learnTab" data-v="exam">${esc(x.toExam)}</button></div>`;
  }
  const c = app.ui.cert;
  const ready = c && c.game === game && c.url;
  if (!app.nickSaved || (c?.game === game && c.needName)) {
    // No saved name yet: ask for it here (it is also the name used at tables).
    return `<form class="cert cert-ask" data-submit="certMake">
      <p><b>${esc(x.askName)}</b></p>
      <p class="small muted">${esc(x.askNameHelp)}</p>
      <input id="certName" data-keep maxlength="20" autocomplete="nickname" placeholder="${esc(x.namePh)}" value="">
      <button class="btn primary block" type="submit">${esc(x.makeFirst)}</button></form>`;
  }
  return `<div class="cert">
    <form class="row cert-name" data-submit="certMake">
      <label for="certName" class="small">${esc(x.name)}</label>
      <input id="certName" data-keep maxlength="20" autocomplete="nickname" value="${esc(app.nick)}">
      <button class="btn sm" type="submit">${esc(x.make)}</button>
    </form>
    ${ready ? `<img class="cert-img" src="${esc(c.url)}" alt="${esc(x.cert)}">` : `<div class="cert-img placeholder">${esc(x.making)}</div>`}
    <button class="btn primary block" data-act="certDownload" ${ready ? '' : 'disabled'}>${esc(x.download)}</button>
    <p class="small muted">${esc(x.note)}</p></div>`;
}

export function learnView(app) {
  const x = s();
  const L = app.ui.learn;
  const game = L.game;
  const course = COURSES[game];
  const lessons = course.lessons(learnLang());
  const prog = app.learnProg[game];
  const tab = L.tab;
  const chips = COURSE_IDS.map((id) => {
    const mark = isComplete(id, app.learnProg[id], learnLang()) ? ' 🏅' : '';
    return `<button class="chip-btn ${id === game ? 'on' : ''}" data-act="learnGame" data-v="${id}">${esc(x.games[id])}${mark}</button>`;
  }).join('');
  const tabs = [
    ...lessons.map(
      (l) =>
        `<button role="tab" class="tab ${l.id === tab ? 'on' : ''}" aria-selected="${l.id === tab}" data-act="learnTab" data-v="${l.id}">${prog.seen.includes(l.id) ? '✓ ' : ''}${esc(l.title)}</button>`,
    ),
    `<button role="tab" class="tab ${tab === 'exam' ? 'on' : ''}" aria-selected="${tab === 'exam'}" data-act="learnTab" data-v="exam">${esc(x.exam)}${prog.best >= PASS_SCORE ? ' ✓' : ''}</button>`,
    `<button role="tab" class="tab ${tab === 'cert' ? 'on' : ''}" aria-selected="${tab === 'cert'}" data-act="learnTab" data-v="cert">${isComplete(game, prog, learnLang()) ? '🏅 ' : '🔒 '}${esc(x.cert)}</button>`,
  ].join('');
  const lesson = lessons.find((l) => l.id === tab);
  const body = lesson ? renderBlocks(lesson.blocks) : tab === 'exam' ? examBody(app, game) : certBody(app, game);
  return `<div class="overlay learn-overlay" data-ov="learn" data-act="learnClose">
    <div class="sheet learn" role="dialog" aria-modal="true" aria-label="${esc(x.title)}" data-stop>
      <div class="learn-head"><h2>🎓 ${esc(course.title(learnLang()))}</h2><button class="btn ghost icon" data-act="learnClose" aria-label="${esc(x.close)}">✕</button></div>
      <div class="course-chips">${chips}</div>
      <nav class="tabs" role="tablist">${tabs}</nav>
      <div class="learn-body">${body}</div>
    </div></div>`;
}
