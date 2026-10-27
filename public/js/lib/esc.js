const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** HTML-escape any value for text or attribute context. Every user string goes through this. */
export const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => MAP[c]);

/** Formats chips with thousands separators. */
export const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '0');

export const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');
