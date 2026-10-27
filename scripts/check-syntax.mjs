#!/usr/bin/env node
// Syntax-checks every JS module (node --check) and verifies that every relative import resolves.
import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src', 'public', 'scripts', 'tests'];

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(m?js)$/.test(e.name)) yield p;
  }
}

let failed = 0;
let count = 0;
for (const d of DIRS) {
  for await (const file of walk(path.join(ROOT, d))) {
    count++;
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) {
      failed++;
      console.error(`✗ ${path.relative(ROOT, file)}\n${r.stderr}`);
      continue;
    }
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(file), m[1]);
      try {
        await access(target);
      } catch {
        failed++;
        console.error(`✗ ${path.relative(ROOT, file)}: cannot resolve ${m[1]}`);
      }
    }
  }
}
if (failed) {
  console.error(`${failed} problem(s) in ${count} files`);
  process.exit(1);
}
console.log(`syntax ok: ${count} files`);
