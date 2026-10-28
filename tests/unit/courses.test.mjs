import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, COURSE_IDS, EXAM_SIZE, PASS_SCORE, isComplete, normalizeProgress, lessonCount } from '../../public/js/learn/index.js';
import { classify, compareHands, XIDACH_DEFAULTS } from '../../public/js/domain/xidach.js';
import { detectCombo, canBeat, TIENLEN_DEFAULTS } from '../../public/js/domain/tienlen.js';
import { bestHand } from '../../public/js/domain/holdem.js';
import { isCardList } from '../../public/js/domain/cards.js';
import { isTichuCardList, detectCombo as tcDetect, canBeat as tcBeat, pointsOf } from '../../public/js/domain/tichu.js';
import { evaluate as mbEval, compare as mbCompare, judge as mbJudge } from '../../public/js/domain/maubinh.js';

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('every course has lessons in both languages with the same ids', () => {
  for (const id of COURSE_IDS) {
    const vi = COURSES[id].lessons('vi');
    const en = COURSES[id].lessons('en');
    assert.ok(vi.length >= 4, id);
    assert.deepEqual(vi.map((l) => l.id), en.map((l) => l.id), id);
    for (const l of [...vi, ...en]) assert.ok(l.title && l.blocks.length, `${id}/${l.id}`);
    assert.ok(COURSES[id].title('vi') && COURSES[id].title('en'));
  }
});

test('exams: 10 well-formed questions, answer among the options, distinct cards', () => {
  for (const id of COURSE_IDS) {
    for (const lang of ['vi', 'en']) {
      for (let seed = 1; seed <= 300; seed++) {
        const qs = COURSES[id].exam(lang, rng(seed));
        assert.equal(qs.length, EXAM_SIZE, `${id} ${seed}`);
        for (const q of qs) {
          assert.ok(q.prompt && q.explain, `${id} prompt/explain`);
          const vs = q.options.map((o) => o.v);
          assert.equal(new Set(vs).size, vs.length, `${id} duplicate options`);
          assert.ok(vs.includes(q.answer), `${id} answer not in options: ${q.prompt}`);
          assert.ok(q.options.length >= 2 && q.options.length <= 4);
          const all = q.groups.flatMap((g) => g.cards);
          assert.ok(id === 'tichu' ? isTichuCardList(all, 56) : isCardList(all, 52), `${id} cards: ${all}`);
        }
      }
    }
  }
});

test('Xì dách exam answers agree with the rule engine', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const q of COURSES.xidach.exam('en', rng(seed))) {
      if (q.groups.length === 1) {
        const r = classify(q.groups[0].cards, { minAge: 16 });
        assert.equal(q.answer, r.kind === 'normal' ? `pts:${r.total}` : r.kind);
      } else if (q.groups.length === 2) {
        const p = classify(q.groups[0].cards, { minAge: XIDACH_DEFAULTS.playerMin });
        const d = classify(q.groups[1].cards, { minAge: XIDACH_DEFAULTS.dealerMin });
        const o = compareHands(p, d, XIDACH_DEFAULTS).outcome;
        assert.equal(q.answer, o > 0 ? 'player' : o < 0 ? 'dealer' : 'push');
      }
    }
  }
});

test('Tiến lên exam answers agree with the rule engine', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const q of COURSES.tienlen.exam('en', rng(seed))) {
      if (q.groups.length === 1) {
        const k = detectCombo(q.groups[0].cards);
        assert.equal(q.answer, k ? k.type : 'invalid');
      } else if (q.groups.length === 2) {
        const ok = canBeat(detectCombo(q.groups[0].cards), detectCombo(q.groups[1].cards), TIENLEN_DEFAULTS);
        assert.equal(q.answer, ok ? 'yes' : 'no');
      }
    }
  }
});

test("Hold'em exam answers agree with the evaluator", () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const q of COURSES.holdem.exam('en', rng(seed))) {
      if (q.groups.length === 3) {
        const [board, a, b] = q.groups.map((g) => g.cards);
        const sa = bestHand([...a, ...board]).score;
        const sb = bestHand([...b, ...board]).score;
        assert.equal(q.answer, sa > sb ? 'a' : sb > sa ? 'b' : 'tie');
      } else if (q.groups.length === 2) {
        const [board, mine] = q.groups.map((g) => g.cards);
        assert.equal(q.answer, bestHand([...mine, ...board]).category);
      }
    }
  }
});

test('completion needs every lesson and a passing score', () => {
  const n = lessonCount('xidach');
  const ids = COURSES.xidach.lessons('vi').map((l) => l.id);
  assert.equal(isComplete('xidach', { seen: ids, best: PASS_SCORE }), true);
  assert.equal(isComplete('xidach', { seen: ids.slice(0, n - 1), best: 10 }), false);
  assert.equal(isComplete('xidach', { seen: ids, best: PASS_SCORE - 1 }), false);
  const p = normalizeProgress({ xidach: { seen: ['goal', 5], best: 99 }, __proto__: null });
  assert.deepEqual(p.xidach, { seen: ['goal'], best: EXAM_SIZE, passedAt: null });
  assert.deepEqual(p.holdem, { seen: [], best: 0, passedAt: null });
});

test('Mậu binh exam answers agree with the rule engine', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const q of COURSES.maubinh.exam('vi', rng(seed))) {
      if (q.groups.length === 1 && q.groups[0].cards.length === 5) assert.equal(q.answer, String(mbEval(q.groups[0].cards).cat));
      if (q.groups.length === 2) {
        const r = mbCompare(mbEval(q.groups[0].cards), mbEval(q.groups[1].cards));
        assert.equal(q.answer, r > 0 ? 'a' : r < 0 ? 'b' : 'tie');
      }
      if (q.groups.length === 3) assert.equal(q.answer, mbJudge(q.groups.flatMap((g) => g.cards)).valid ? 'ok' : 'lung');
    }
  }
});

test('Tichu exam answers agree with the rule engine', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const q of COURSES.tichu.exam('en', rng(seed))) {
      if (!q.groups.length) continue;
      if (q.groups.length === 2) {
        const a = tcDetect(q.groups[0].cards);
        const b = tcDetect(q.groups[1].cards, a);
        assert.equal(q.answer, tcBeat(a, b) ? 'yes' : 'no');
      } else if (/points/.test(q.prompt)) assert.equal(q.answer, String(pointsOf(q.groups[0].cards)));
      else assert.equal(q.answer, tcDetect(q.groups[0].cards)?.type ?? 'invalid');
    }
  }
});
