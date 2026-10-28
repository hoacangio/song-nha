#!/usr/bin/env node
// Turns `wrangler tail --format json` output into GitHub annotations: exceptions and error logs.
import { readFileSync } from 'node:fs';

const raw = readFileSync(process.argv[2] || 'tail.log', 'utf8');
// wrangler prints one JSON object per event (pretty-printed); split on top-level object boundaries.
const events = [];
let depth = 0;
let start = -1;
let inStr = false;
for (let i = 0; i < raw.length; i++) {
  const ch = raw[i];
  if (inStr) {
    if (ch === '\\') i++;
    else if (ch === '"') inStr = false;
    continue;
  }
  if (ch === '"') inStr = true;
  else if (ch === '{') {
    if (depth++ === 0) start = i;
  } else if (ch === '}' && --depth === 0) {
    try {
      events.push(JSON.parse(raw.slice(start, i + 1)));
    } catch {}
  }
}
const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r?\n/g, '%0A').slice(0, 3000);
let n = 0;
for (const ev of events) {
  const req = ev.event?.request ? `${ev.event.request.method} ${new URL(ev.event.request.url).pathname}` : ev.scriptName || '';
  for (const ex of ev.exceptions || []) {
    n++;
    console.log(`::error title=Worker exception (${ev.outcome}) ${req}::${esc(`${ex.name}: ${ex.message}\n${ex.stack || ''}`)}`);
  }
  for (const log of ev.logs || []) {
    if (log.level === 'error' || log.level === 'warn') {
      n++;
      console.log(`::warning title=Worker ${log.level} ${req}::${esc(log.message.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join(' '))}`);
    }
  }
  if (ev.outcome && ev.outcome !== 'ok' && !(ev.exceptions || []).length) console.log(`::warning title=Outcome ${ev.outcome} ${req}::${esc(JSON.stringify(ev).slice(0, 1500))}`);
}
console.log(`::notice title=tail::${events.length} events, ${n} errors/warnings`);
