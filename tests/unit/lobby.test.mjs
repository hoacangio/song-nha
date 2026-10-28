import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTable, eligible, LOBBY_TTL_MS } from '../../src/table/lobby.js';
import { createTable, handle } from '../../src/table/core.js';

const E = (code, o = {}) => ({ code, game: 'xidach', seats: 8, taken: 2, online: 1, at: 1000, ...o });

test('only public tables with a free seat and someone online are eligible', () => {
  const list = [E('SEN-001'), E('SEN-002', { taken: 8 }), E('SEN-003', { online: 0 }), E('SEN-004', { game: 'holdem' }), E('SEN-005', { at: -LOBBY_TTL_MS })];
  assert.deepEqual(eligible(list, { now: 1000 }).map((e) => e.code), ['SEN-001', 'SEN-004']);
  assert.deepEqual(eligible(list, { game: 'holdem', now: 1000 }).map((e) => e.code), ['SEN-004']);
  assert.equal(pickTable([E('SEN-002', { taken: 8 })], { now: 1000 }), null);
});

test('random pick is weighted by people online', () => {
  const list = [E('SEN-001', { online: 1 }), E('SEN-002', { online: 3 })];
  const counts = { 'SEN-001': 0, 'SEN-002': 0 };
  for (let i = 0; i < 4000; i++) counts[pickTable(list, { now: 1000 }).code]++;
  assert.ok(counts['SEN-002'] > counts['SEN-001'] * 2, JSON.stringify(counts));
  assert.equal(pickTable(list, { now: 1000, rand: () => 0 }).code, 'SEN-001');
  assert.equal(pickTable(list, { now: 1000, rand: () => 0.99 }).code, 'SEN-002');
});

test('public is off by default, host-only, and settings keep it', async () => {
  const H = { pid: 'host', isHost: true, nick: 'H' };
  const A = { pid: 'aaaa', isHost: false, nick: 'A' };
  const t = createTable({ code: 'SEN-010', game: 'xidach', options: {}, hostKey: 'k', now: 0 });
  assert.equal(t.opts.public, false);
  assert.equal(createTable({ code: 'SEN-011', game: 'xidach', options: { public: 'yes' }, hostKey: 'k', now: 0 }).opts.public, false);
  assert.equal(createTable({ code: 'SEN-012', game: 'xidach', options: { public: true }, hostKey: 'k', now: 0 }).opts.public, true);
  await assert.rejects(handle(t, A, { t: 'setPublic', on: true }, 1), /host_only/);
  await assert.rejects(handle(t, H, { t: 'setPublic', on: 'yes' }, 1), /bad_options/);
  await handle(t, H, { t: 'setPublic', on: true }, 1);
  assert.equal(t.opts.public, true);
  await handle(t, H, { t: 'settings', options: { turnSeconds: 40 } }, 2);
  assert.equal(t.opts.public, true, 'other settings do not reset it');
});
