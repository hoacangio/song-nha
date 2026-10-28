// Course registry and progress rules (pure; progress is persisted by the app).
import * as xidach from './xidach.js';
import * as tienlen from './tienlen.js';
import * as holdem from './holdem.js';
import * as maubinh from './maubinh.js';
import * as tichu from './tichu.js';
import { EXAM_SIZE, PASS_SCORE } from './common.js';

export const COURSES = { xidach, tienlen, holdem, maubinh, tichu };
export const COURSE_IDS = Object.keys(COURSES);
export { EXAM_SIZE, PASS_SCORE };

/** Progress for one course: { seen: [lessonId], best: number, passedAt: iso|null }. */
export function emptyProgress() {
  return { seen: [], best: 0, passedAt: null };
}

export function lessonsDone(game, prog, lang = 'vi') {
  const ids = COURSES[game].lessons(lang).map((l) => l.id);
  return ids.filter((id) => prog?.seen?.includes(id)).length;
}

export function lessonCount(game, lang = 'vi') {
  return COURSES[game].lessons(lang).length;
}

/** A course is complete when every lesson was opened and the exam was passed. */
export function isComplete(game, prog, lang = 'vi') {
  return !!prog && lessonsDone(game, prog, lang) === lessonCount(game, lang) && prog.best >= PASS_SCORE;
}

/** Sanitises progress read from storage. */
export function normalizeProgress(raw) {
  const out = {};
  for (const id of COURSE_IDS) {
    const p = raw && typeof raw === 'object' ? raw[id] : null;
    out[id] = {
      seen: Array.isArray(p?.seen) ? p.seen.filter((x) => typeof x === 'string').slice(0, 20) : [],
      best: Number.isInteger(p?.best) ? Math.max(0, Math.min(EXAM_SIZE, p.best)) : 0,
      passedAt: typeof p?.passedAt === 'string' ? p.passedAt : null,
    };
  }
  return out;
}
