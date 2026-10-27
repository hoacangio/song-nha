// Fair shuffling and commit–reveal helpers. Works in browsers, Workers and Node 22
// (all expose globalThis.crypto).

const U32 = 0x1_0000_0000;

/** Uniform integer in [0, n) using rejection sampling (no modulo bias). */
export function randomInt(n, rng = globalThis.crypto) {
  if (!Number.isInteger(n) || n <= 0 || n > U32) throw new RangeError('randomInt: bad bound');
  const limit = U32 - (U32 % n); // largest multiple of n that fits
  const buf = new Uint32Array(1);
  for (;;) {
    rng.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** In-place Fisher–Yates shuffle; returns the array. */
export function shuffle(arr, rng = globalThis.crypto) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, rng);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export function randomHex(bytes = 32, rng = globalThis.crypto) {
  const b = new Uint8Array(bytes);
  rng.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Commitment published before dealing: SHA-256(serverSeed + ":" + deckOrder). */
export function commitment(seed, deck) {
  return sha256Hex(`${seed}:${deck.join(',')}`);
}

/** Anyone can re-check a revealed hand. */
export async function verifyCommitment(commit, seed, deck) {
  return (await commitment(seed, deck)) === commit;
}
