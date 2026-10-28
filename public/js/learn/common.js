// Helpers shared by the course modules (pure: no DOM).

export const EXAM_SIZE = 10;
export const PASS_SCORE = 8;

export function shuffled(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (list, rand = Math.random) => list[Math.floor(rand() * list.length)];

/** Options list with the answer plus distractors, shuffled. `all` = [{v,label}]. */
export function optionsWith(answer, all, n = 4, rand = Math.random) {
  const right = all.find((o) => o.v === answer);
  const others = shuffled(all.filter((o) => o.v !== answer), rand).slice(0, n - 1);
  return shuffled([right, ...others], rand);
}

/** Turns a static bank entry { q, options: [label…], answer: index, explain } into a question. */
export function fromBank(entry, rand = Math.random) {
  const opts = entry.options.map((label, i) => ({ v: String(i), label }));
  return { prompt: entry.q, groups: [], options: shuffled(opts, rand), answer: String(entry.answer), explain: entry.explain };
}

/** Builds an exam: generated questions first, then bank questions, trimmed to EXAM_SIZE. */
export function assemble(generated, bank, nBank, rand = Math.random) {
  const fixed = shuffled(bank, rand).slice(0, nBank).map((b) => fromBank(b, rand));
  return shuffled([...generated, ...fixed], rand).slice(0, EXAM_SIZE);
}
