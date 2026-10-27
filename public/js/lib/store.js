// localStorage that never throws (private mode, blocked storage, previews).
const mem = new Map();

export function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return mem.has(key) ? mem.get(key) : fallback;
  }
}

export function save(key, value) {
  mem.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
