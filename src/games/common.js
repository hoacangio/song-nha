export class GameError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** Integer option clamped to [min, max]; falls back when not a finite integer. */
export function clampInt(v, min, max, fallback) {
  if (typeof v !== 'number' || !Number.isInteger(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export function pick(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback;
}
