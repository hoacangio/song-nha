// The device secret never leaves this browser except over TLS to our own server, which only
// ever broadcasts a salted hash of it (pid).
import { load, save } from '../lib/store.js';

/** RFC 4122 v4 (crypto.randomUUID is missing on non-secure origins such as a LAN IP). */
function uuid4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function deviceSecret() {
  let s = load('sn.secret', null);
  if (typeof s !== 'string' || !/^[0-9a-f-]{36}$/i.test(s)) {
    s = uuid4();
    save('sn.secret', s);
  }
  return s;
}
