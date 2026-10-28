// Anti-spam pieces: creation quota windows, network keys, table expiry, score-board cap, lobby eviction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consume, clientNetwork, quotaKey, quotaLimits, QUOTA_DEFAULTS, HOUR, DAY } from '../../src/table/quota.js';
import { createTable, isExpired, nextWake, pruneLedger, IDLE_EXPIRY_MS, UNUSED_EXPIRY_MS, LEDGER_MAX } from '../../src/table/core.js';
import { LobbyDO, LOBBY_MAX } from '../../src/table/lobby.js';

const W = [
  { ms: HOUR, max: 3 },
  { ms: DAY, max: 5 },
];

test('consume: fixed windows, rejected attempts are not counted', () => {
  let s;
  let now = 0;
  for (let i = 0; i < 3; i++) {
    const r = consume(s, now, W);
    assert.ok(r.ok);
    s = r.state;
  }
  const no = consume(s, now + 1000, W);
  assert.equal(no.ok, false);
  assert.equal(no.retryMs, HOUR - 1000);
  for (let i = 0; i < 5; i++) s = consume(s, now + 2000, W).state; // hammering while blocked
  assert.equal(s[String(HOUR)].n, 3, 'blocked tries do not count');
  now += HOUR;
  assert.ok((s = consume(s, now, W).state));
  s = consume(s, now, W).state; // 5th today
  const day = consume(s, now, W);
  assert.equal(day.ok, false, 'daily cap');
  assert.equal(day.retryMs, DAY - HOUR);
});

const req = (ip) => new Request('https://x/', { headers: ip == null ? {} : { 'cf-connecting-ip': ip } });

test('clientNetwork: IPv4 as is, IPv6 grouped by /64, junk rejected', () => {
  assert.equal(clientNetwork(req('203.0.113.7')), '203.0.113.7');
  assert.equal(clientNetwork(req('2001:db8:aa:bb::1')), '2001:db8:aa:bb::/64');
  assert.equal(clientNetwork(req('2001:0db8:00aa:00bb:1:2:3:4')), '2001:db8:aa:bb::/64');
  assert.equal(clientNetwork(req('2001:db8::1')), '2001:db8:0:0::/64');
  assert.equal(clientNetwork(req('2001:DB8:AA:BB:ffff::9')), '2001:db8:aa:bb::/64');
  assert.equal(clientNetwork(req('not-an-ip')), null);
  assert.equal(clientNetwork(req(null)), null);
});

test('quota keys are hashed (no raw IP stored) and stable', async () => {
  const k = await quotaKey('203.0.113.7');
  assert.match(k, /^net:[0-9a-f]{24}$/);
  assert.ok(!k.includes('203'));
  assert.equal(k, await quotaKey('203.0.113.7'));
  assert.notEqual(k, await quotaKey('203.0.113.8'));
});

test('quotaLimits: defaults, overrides, junk ignored', () => {
  assert.deepEqual(quotaLimits({}), { ...QUOTA_DEFAULTS });
  assert.equal(quotaLimits({ CREATE_PER_HOUR: '4' }).perHour, 4);
  assert.equal(quotaLimits({ CREATE_PER_HOUR: '-1' }).perHour, QUOTA_DEFAULTS.perHour);
  assert.equal(quotaLimits({ CREATE_PER_DAY: 'abc' }).perDay, QUOTA_DEFAULTS.perDay);
});

test('a never-played table expires after 6h idle, a played one after 7 days', () => {
  const t = createTable({ code: 'SEN-1234', game: 'xidach', options: {}, hostKey: 'h', now: 0 });
  assert.equal(isExpired(t, UNUSED_EXPIRY_MS - 1), false);
  assert.equal(isExpired(t, UNUSED_EXPIRY_MS), true);
  assert.equal(nextWake(t), UNUSED_EXPIRY_MS);
  t.handNo = 1;
  assert.equal(isExpired(t, UNUSED_EXPIRY_MS), false);
  assert.equal(nextWake(t), IDLE_EXPIRY_MS);
});

test('pruneLedger keeps seated players and drops the oldest leavers', () => {
  const t = createTable({ code: 'SEN-1234', game: 'xidach', options: {}, hostKey: 'h', now: 0 });
  for (let i = 0; i < LEDGER_MAX + 10; i++) t.ledger[`p${i}`] = { nick: `P${i}`, buyIn: 1000, chips: 1000, at: i };
  t.seats[0] = { pid: 'p0', nick: 'P0', chips: 1000, bot: false };
  pruneLedger(t);
  const keys = Object.keys(t.ledger);
  assert.equal(keys.length, LEDGER_MAX);
  assert.ok(keys.includes('p0'), 'seated oldest player kept');
  assert.ok(!keys.includes('p1') && keys.includes(`p${LEDGER_MAX + 9}`), 'oldest leaver dropped, newest kept');
});

function memoryState() {
  const map = new Map();
  return { storage: { get: async (k) => structuredClone(map.get(k)), put: async (k, v) => void map.set(k, structuredClone(v)) }, map };
}

test('a full lobby evicts an entry nobody is at instead of refusing a live table', async () => {
  const st = memoryState();
  const tables = {};
  const now = Date.now();
  for (let i = 0; i < LOBBY_MAX; i++) {
    const code = `SEN-${1000 + i}`;
    tables[code] = { code, game: 'xidach', seats: 8, taken: 1, online: i === 5 ? 0 : 1, at: now };
  }
  st.map.set('tables', tables);
  const lobby = new LobbyDO(st);
  const up = (b) => lobby.fetch(new Request('https://lobby/upsert', { method: 'POST', body: JSON.stringify(b) }));
  assert.equal((await up({ code: 'MAI-9001', game: 'xidach', seats: 8, taken: 1, online: 1 })).status, 200);
  const after = st.map.get('tables');
  assert.equal(Object.keys(after).length, LOBBY_MAX);
  assert.ok(!after['SEN-1005'] && after['MAI-9001'], 'the empty table made room');
  // when everyone listed has people online, an empty newcomer is the one refused
  assert.equal((await up({ code: 'MAI-9002', game: 'xidach', seats: 8, taken: 1, online: 0 })).status, 503);
});
