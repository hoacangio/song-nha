import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, isChipAmount, cleanNick, isSecret, takeToken, CODE_RE } from '../../src/lib/protocol.js';
import { csvCell } from '../../public/js/lib/csv.js';

const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return 'ok';
};

test('parseMessage whitelists types and fields', () => {
  assert.deepEqual(parseMessage('{"t":"bet","amount":10}'), { t: 'bet', amount: 10 });
  assert.equal(code(() => parseMessage('{"t":"eval"}')), 'unknown_type');
  assert.equal(code(() => parseMessage('{"t":"bet","amount":1,"x":2}')), 'unknown_field');
  assert.equal(code(() => parseMessage('[1]')), 'bad_shape');
  assert.equal(code(() => parseMessage('nope')), 'bad_json');
  assert.equal(code(() => parseMessage('{"t":"toString"}')), 'unknown_type');
  assert.equal(code(() => parseMessage('{"t":"hasOwnProperty"}')), 'unknown_type');
});

test('parseMessage rejects prototype pollution keys', () => {
  assert.equal(code(() => parseMessage('{"t":"settings","options":{"__proto__":{"x":1}}}')), 'forbidden_key');
  assert.equal(code(() => parseMessage('{"t":"settings","options":{"constructor":{"prototype":{}}}}')), 'forbidden_key');
  assert.equal({}.x, undefined);
});

test('parseMessage caps size', () => {
  assert.equal(code(() => parseMessage(JSON.stringify({ t: 'hello', nick: 'x'.repeat(3000) }))), 'too_large');
});

test('chip amounts are positive safe integers', () => {
  assert.equal(isChipAmount(10), true);
  for (const v of [0, -5, 1.5, NaN, Infinity, '10', 2 ** 60, null]) assert.equal(isChipAmount(v), false, String(v));
});

test('nicknames are cleaned', () => {
  assert.equal(cleanNick('  Hòa ‮ evil  '), 'Hòa evil');
  assert.equal(cleanNick('a'.repeat(50)).length, 20);
  assert.equal(cleanNick(42), '');
});

test('secrets must be UUIDs; codes WORD-123', () => {
  assert.equal(isSecret('3f2b1c8e-1a2b-4c3d-8e9f-0123456789ab'), true);
  assert.equal(isSecret('not-a-uuid'), false);
  assert.ok(CODE_RE.test('SONG-123'));
  assert.ok(!CODE_RE.test('song-123'));
  assert.ok(!CODE_RE.test('SONG-12'));
});

test('token bucket refills over time', () => {
  const b = { tokens: 2, at: 0 };
  assert.equal(takeToken(b, 0, { capacity: 2, rate: 1 }), true);
  assert.equal(takeToken(b, 0, { capacity: 2, rate: 1 }), true);
  assert.equal(takeToken(b, 0, { capacity: 2, rate: 1 }), false);
  assert.equal(takeToken(b, 1000, { capacity: 2, rate: 1 }), true);
});

test('CSV cells neutralise formula injection', () => {
  assert.equal(csvCell('=SUM(A1)'), `"'=SUM(A1)"`);
  assert.equal(csvCell('+1'), `"'+1"`);
  assert.equal(csvCell('-1'), `"'-1"`);
  assert.equal(csvCell('@x'), `"'@x"`);
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell(-20), '-20', 'numbers stay numeric');
});
