// Sound effects synthesised with Web Audio — no audio files, no third-party samples.
// Off by default; the context is created/resumed on the first user gesture (required on iOS).

let ctx = null;
let master = null;
let enabled = false;
let volume = 0.7;
let noiseBuf = null;

export function setSoundEnabled(on) {
  enabled = !!on;
  if (enabled) unlock();
}
export function setVolume(v) {
  volume = Math.min(1, Math.max(0, Number(v) || 0));
  if (master) master.gain.value = volume;
}
export const soundEnabled = () => enabled;

/** Call from a user gesture (click/tap) so browsers allow audio. */
export function unlock() {
  if (!enabled) return;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {}
}

const ready = () => enabled && ctx && ctx.state === 'running';

function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.25, to = null, attack = 0.005 } = {}) {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise({ at = 0, dur = 0.08, freq = 3000, q = 1, gain = 0.3, type = 'bandpass', sweep = null } = {}) {
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random() * 0.3);
  src.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  /** Card sliding off the deck. */
  deal: (at = 0) => noise({ at, dur: 0.09, freq: 5200, sweep: 1800, q: 0.8, gain: 0.22 }),
  /** Card turned over. */
  flip: (at = 0) => {
    noise({ at, dur: 0.05, freq: 2600, q: 2, gain: 0.25 });
    noise({ at: at + 0.05, dur: 0.04, freq: 4200, q: 2, gain: 0.15 });
  },
  /** Clay chips clicking. */
  chip: (at = 0) => {
    for (const [d, f] of [[0, 3400], [0.045, 2900], [0.08, 3800]]) {
      tone(f, { at: at + d, dur: 0.05, type: 'triangle', gain: 0.12 });
      noise({ at: at + d, dur: 0.03, freq: 6000, q: 4, gain: 0.1 });
    }
  },
  /** Cards slapped on the table. */
  play: (at = 0) => {
    noise({ at, dur: 0.12, freq: 1200, sweep: 400, q: 0.7, gain: 0.35, type: 'lowpass' });
    tone(140, { at, dur: 0.1, type: 'sine', gain: 0.25, to: 70 });
  },
  /** Chặt heo: heavy hit + rising stab. */
  chop: (at = 0) => {
    noise({ at, dur: 0.22, freq: 900, sweep: 200, q: 0.5, gain: 0.5, type: 'lowpass' });
    tone(110, { at, dur: 0.25, type: 'sawtooth', gain: 0.18, to: 55 });
    tone(440, { at: at + 0.06, dur: 0.18, type: 'square', gain: 0.08, to: 880 });
  },
  pass: (at = 0) => tone(330, { at, dur: 0.09, type: 'triangle', gain: 0.1, to: 260 }),
  /** Your turn: soft two-note chime. */
  turn: (at = 0) => {
    tone(784, { at, dur: 0.18, type: 'sine', gain: 0.2 });
    tone(1175, { at: at + 0.12, dur: 0.28, type: 'sine', gain: 0.18 });
  },
  tick: (at = 0) => tone(1500, { at, dur: 0.03, type: 'square', gain: 0.05 }),
  tap: (at = 0) => tone(900, { at, dur: 0.025, type: 'triangle', gain: 0.05 }),
  win: (at = 0) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: at + i * 0.09, dur: 0.22, type: 'triangle', gain: 0.18 }));
    SOUNDS.chip(at + 0.35);
  },
  bigwin: (at = 0) => {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, { at: at + i * 0.08, dur: 0.3, type: 'triangle', gain: 0.18 }));
    for (let i = 0; i < 3; i++) SOUNDS.chip(at + 0.45 + i * 0.12);
  },
  lose: (at = 0) => [392, 330, 262].forEach((f, i) => tone(f, { at: at + i * 0.12, dur: 0.22, type: 'sine', gain: 0.14 })),
  push: (at = 0) => {
    tone(523, { at, dur: 0.15, type: 'sine', gain: 0.12 });
    tone(523, { at: at + 0.15, dur: 0.15, type: 'sine', gain: 0.12 });
  },
  shuffle: (at = 0) => {
    for (let i = 0; i < 8; i++) noise({ at: at + i * 0.035, dur: 0.05, freq: 3500 + Math.random() * 2500, q: 1, gain: 0.12 });
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

/** Plays a named effect (no-op when muted or not unlocked yet). */
export function sfx(name, at = 0) {
  if (!ready() || !SOUNDS[name]) return;
  try {
    SOUNDS[name](at);
  } catch {}
}

/**
 * Derives sound cues from two consecutive table snapshots, so the server needs no extra events.
 * Returns a list of [name, delaySeconds].
 */
export function cuesFor(prev, next) {
  const out = [];
  const h0 = prev?.hand;
  const h1 = next?.hand;
  if (!h1) return out;
  const me = next.you.seat;
  const newHand = !h0 || prev.handNo !== next.handNo;
  if (newHand) out.push(['shuffle', 0]);

  // Cards appearing (dealt / drawn) and being revealed.
  let dealt = 0;
  let flips = 0;
  h1.seats.forEach((s, i) => {
    if (!s) return;
    const o = newHand ? null : h0.seats?.[i];
    const before = o ? (o.count ?? o.cards?.length ?? 0) : 0;
    const after = s.count ?? s.cards?.length ?? 0;
    if (after > before && h1.game !== 'tienlen') dealt += after - before;
    if (o && !o.cards && s.cards && i !== me) flips++;
  });
  if (h1.game === 'tienlen' && newHand) dealt = 13;
  for (let k = 0; k < Math.min(dealt, 13); k++) out.push(['deal', 0.15 + k * (h1.game === 'tienlen' ? 0.04 : 0.09)]);
  if (flips) out.push(['flip', 0.05]);

  // Chips: a new bet anywhere.
  if (h1.game === 'xidach') {
    const bets0 = newHand ? [] : h0.seats.map((s) => s?.bet ?? null);
    if (h1.seats.some((s, i) => s && s.bet != null && bets0[i] == null)) out.push(['chip', 0]);
  }

  // Tiến lên: a new trick on the table / chop / pass.
  if (h1.game === 'tienlen' && !newHand) {
    const k0 = h0.trick ? `${h0.trick.seat}:${h0.trick.cards.join()}` : '';
    const k1 = h1.trick ? `${h1.trick.seat}:${h1.trick.cards.join()}` : '';
    if (k1 && k1 !== k0) out.push([h1.trick.chop ? 'chop' : 'play', 0]);
    else if (h1.seats.some((s, i) => s?.passed && !h0.seats[i]?.passed)) out.push(['pass', 0]);
  }

  // My turn begins.
  const myTurn = !!h1.actions && h1.phase !== 'done';
  const wasMyTurn = !newHand && !!h0.actions && h0.phase !== 'done';
  if (myTurn && !wasMyTurn) out.push(['turn', 0.1]);

  // My result.
  const mine = me >= 0 ? h1.seats[me] : null;
  const mineBefore = me >= 0 && !newHand ? h0.seats[me] : null;
  const delta = (s) => s?.settled?.delta ?? s?.result?.delta ?? null;
  const d1 = delta(mine);
  const d0 = delta(mineBefore);
  if (d1 != null && d0 == null) out.push([d1 > 0 ? (d1 >= 100 ? 'bigwin' : 'win') : d1 < 0 ? 'lose' : 'push', 0.25]);
  else if (h1.phase === 'done' && h0?.phase !== 'done' && me >= 0 && h1.dealer === me) {
    const net = h1.seats.reduce((s, x) => s - (x?.settled?.delta ?? 0), 0);
    out.push([net > 0 ? 'win' : net < 0 ? 'lose' : 'push', 0.25]);
  }
  return out;
}
