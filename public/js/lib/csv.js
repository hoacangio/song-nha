// CSV helpers. Text cells that a spreadsheet could treat as a formula (= + - @, tab, CR)
// are prefixed with an apostrophe; everything is quoted.

export function csvCell(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
