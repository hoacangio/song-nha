// Bots never play on their own: once every person has left, no new hand is dealt (storage writes stop).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable, handle, tick, onLeave, onJoin, nextWake, humanPresent, SEAT_HOLD_MS } from '../../src/table/core.js';

const H = { pid: 'host', isHost: true, nick: 'Host' };

for (const game of ['xidach', 'tienlen', 'holdem', 'maubinh']) {
  test(`${game}: bots stop after the last person leaves; the next hand waits for someone to return`, async () => {
    const t = createTable({ code: 'IDLE-1234', game, options: {}, hostKey: 'k', now: 0 });
    await handle(t, H, { t: 'sit' }, 0);
    for (let i = 0; i < 3; i++) await handle(t, H, { t: 'addBot' }, 0);
    await handle(t, H, { t: 'start' }, 0);
    onLeave(t, H.pid, 1); // the host closes the app
    assert.equal(humanPresent(t), false);
    let now = 1;
    for (let i = 0; i < 2000 && t.hand.phase !== 'done'; i++) await tick(t, (now += 1000));
    assert.equal(t.hand.phase, 'done', 'the running hand still finishes (timeouts + bots)');
    const handNo = t.handNo;
    for (let i = 0; i < 300; i++) await tick(t, (now += 1000));
    assert.equal(t.handNo, handNo, 'no new hand without a person');
    assert.ok(nextWake(t) - now > 3600_000, 'no alarm is scheduled for it either');
    // the host comes back (within or after the seat hold): the pending hand starts on the next tick
    if (t.seats.some((s) => s && s.pid === H.pid)) {
      onJoin(t, { pid: H.pid, nick: 'Host', isHost: true });
      assert.ok(nextWake(t) <= now, 'due immediately');
      await tick(t, (now += 10));
      assert.equal(t.handNo, handNo + 1);
    }
    assert.ok(SEAT_HOLD_MS > 0);
  });
}
