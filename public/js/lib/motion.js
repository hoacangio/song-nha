// One-shot animations that survive re-renders: we remember when an element key was first
// rendered and give it a negative animation-delay equal to its age, so a re-render
// continues the animation instead of restarting it.
const firstSeen = new Map();
let reduced = false;
try {
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
} catch {}

export function ageOf(key) {
  const now = performance.now();
  if (!firstSeen.has(key)) firstSeen.set(key, now);
  return now - firstSeen.get(key);
}

export function seenBefore(key) {
  return firstSeen.has(key);
}

/**
 * Returns `{ cls, style }` for a one-shot animation of `duration` ms that starts `stagger` ms
 * after the key is first seen. After it has finished, returns empty strings.
 */
export function oneShot(key, cls, duration, stagger = 0) {
  if (reduced) return { cls: '', style: '' };
  const age = ageOf(key);
  if (age > stagger + duration) return { cls: '', style: '' };
  return { cls, style: `animation-delay:${Math.round(stagger - age)}ms;` };
}

export function forgetMotion(prefix) {
  for (const k of firstSeen.keys()) if (k.startsWith(prefix)) firstSeen.delete(k);
}

export const prefersReducedMotion = () => reduced;
