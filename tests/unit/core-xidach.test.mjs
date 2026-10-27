// Full-table flows for Xì dách through the table core (no sockets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable, handle, tick, snapshot, seatOf, SEAT_HOLD_MS, onLeave } from '../../src/table/core.js';

const H = { pid: 'host', isHost: true, nick: 'Host' };
const A = { pid: 'aaaa', isHost: false, nick: 'An' };
const B = { pid: 'bbbb', isHost: false, nick: 'Bình' };

function table(opts = {}) {
  return createTable({ code: 'SONG-001', game: 'xidach', options: { turnSeconds: 20, ...opts }, hostKey: 'k', now: 0 });
}

async function seated(...actors) {
  const t = table();
  for (const a of actors) await handle(t, a, { t: 'sit' }, 0);
  return t;
}

const chipsTotal = (t) => t.seats.reduce((s, x) => s + (x ? x.chips : 0), 0);

test('a hand runs bet → play → dealer → done and conserves chips', async () => {
  const t = await seated(H, A, B);
  const before = chipsTotal(t);
  await handle(t, H, { t: 'start' }, 0);
  const h = t.hand;
  assert.equal(h.phase, 'bet');
  assert.equal(h.dealer, 0, 'first dealer is seat 0');
  for (const p of [A, B]) await handle(t, p, { t: 'bet', amount: 20 }, 1);
  assert.notEqual(h.phase, 'bet');
  let now = 2;
  for (let guard = 0; guard < 30 && t.hand.phase !== 'done'; guard++) {
    now += 1;
    const turn = t.hand.turn;
    const actor = [H, A, B].find((x) => seatOf(t, x.pid) === turn);
    const v = snapshot(t, { ...actor, connected: new Set() }, now).hand;
    if (t.hand.phase === 'play') await handle(t, actor, { t: v.actions.stay ? 'stay' : 'hit' }, now);
    else await handle(t, actor, { t: v.actions.xet ? 'xetAll' : 'hit' }, now);
  }
  assert.equal(t.hand.phase, 'done');
  assert.equal(chipsTotal(t), before, 'zero-sum (no player went below 0 here)');
  assert.equal(t.history.length, 1);
  assert.ok(t.lastReveal && t.lastReveal.seed.length === 64);
});

test('out-of-turn and invalid bets are rejected', async () => {
  const t = await seated(H, A, B);
  await handle(t, H, { t: 'start' }, 0);
  const err = async (actor, msg) => {
    try {
      await handle(t, actor, msg, 1);
      return 'ok';
    } catch (e) {
      return e.code;
    }
  };
  assert.equal(await err(H, { t: 'bet', amount: 20 }), 'not_in_hand', 'dealer does not bet');
  assert.equal(await err(A, { t: 'bet', amount: 5 }), 'bad_amount', 'below min');
  assert.equal(await err(A, { t: 'bet', amount: 10.5 }), 'bad_amount');
  assert.equal(await err(A, { t: 'bet', amount: -10 }), 'bad_amount');
  assert.equal(await err(A, { t: 'bet', amount: 1e12 }), 'bad_amount');
  assert.equal(await err(A, { t: 'hit' }), 'wrong_phase');
  assert.equal(await err(A, { t: 'start' }), 'host_only');
  await handle(t, A, { t: 'bet', amount: 10 }, 1);
  assert.equal(await err(A, { t: 'bet', amount: 10 }), 'already_bet');
});

test('private cards are only in the owner snapshot', async () => {
  const t = await seated(H, A, B);
  await handle(t, H, { t: 'start' }, 0);
  await handle(t, A, { t: 'bet', amount: 10 }, 1);
  await handle(t, B, { t: 'bet', amount: 10 }, 1);
  if (t.hand.phase === 'done') return; // dealer had an instant hand — everything is public
  const aSeat = seatOf(t, A.pid);
  const bSeat = seatOf(t, B.pid);
  const aView = snapshot(t, { ...A, connected: new Set() }, 2);
  const bView = snapshot(t, { ...B, connected: new Set() }, 2);
  const spec = snapshot(t, { pid: null, isHost: false, connected: new Set() }, 2);
  assert.deepEqual(aView.hand.seats[aSeat].cards, t.hand.cards[aSeat]);
  if (!t.hand.shown[aSeat]) {
    assert.equal(bView.hand.seats[aSeat].cards, null);
    assert.equal(spec.hand.seats[aSeat].cards, null);
  }
  assert.equal(aView.hand.seats[0].cards, null, 'dealer hidden');
  const blob = JSON.stringify(bView);
  for (const c of t.hand.deck) assert.ok(!blob.includes(`"${c}"`), 'deck never leaks');
  assert.ok(!blob.includes(t.fair.seed), 'seed hidden until reveal');
  void bSeat;
});

test('turn timer auto-stands and bet timeout sits players out', async () => {
  const t = await seated(H, A, B);
  await handle(t, H, { t: 'start' }, 0);
  await handle(t, A, { t: 'bet', amount: 10 }, 1);
  await tick(t, 25_000); // B never bets
  if (t.hand.phase === 'done') return;
  assert.deepEqual(t.hand.players, [seatOf(t, A.pid)]);
  await tick(t, 50_000); // A times out → dealer
  await tick(t, 100_000); // dealer times out → auto play
  assert.equal(t.hand.phase, 'done');
});

test('bots play a whole hand by themselves', async () => {
  const t = await seated(H);
  await handle(t, H, { t: 'addBot' }, 0);
  await handle(t, H, { t: 'addBot' }, 0);
  await handle(t, H, { t: 'start' }, 0);
  // Host is dealer (seat 0); bots bet and play on tick.
  let now = 0;
  for (let i = 0; i < 40 && t.hand.phase !== 'dealer' && t.hand.phase !== 'done'; i++) await tick(t, (now += 1000));
  if (t.hand.phase === 'dealer') await tick(t, (now += 60_000));
  assert.equal(t.hand.phase, 'done');
});

test('a disconnected player keeps the seat for 60 s', async () => {
  const t = await seated(H, A);
  onLeave(t, A.pid, 1000);
  await tick(t, 1000 + SEAT_HOLD_MS - 1);
  assert.ok(seatOf(t, A.pid) >= 0);
  await tick(t, 1000 + SEAT_HOLD_MS + 1);
  assert.equal(seatOf(t, A.pid), -1);
  assert.ok(t.ledger[A.pid], 'ledger remembers chips');
});

test('rebuy tops up everyone and is counted as buy-in', async () => {
  const t = await seated(H, A);
  await handle(t, H, { t: 'rebuy', amount: 500 }, 0);
  assert.equal(t.seats[seatOf(t, A.pid)].chips, 1500);
  assert.equal(snapshot(t, { ...A, connected: new Set() }, 0).board.find((r) => r.pid === A.pid).net, 0);
});

test('settings are sanitised and host-only', async () => {
  const t = await seated(H, A);
  await handle(t, H, { t: 'settings', options: { turnSeconds: 9999, game: { minBet: -4, dealerMode: 'evil' } } }, 0);
  assert.equal(t.opts.turnSeconds, 120);
  assert.equal(t.opts.game.minBet, 1);
  assert.equal(t.opts.game.dealerMode, 'rotate');
  await assert.rejects(handle(t, A, { t: 'settings', options: {} }, 0));
});
