// Bot personalities: assigned at random, visible in snapshots, and they change how bots play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable, handle, tick, snapshot } from '../../src/table/core.js';
import { PERSONA_IDS } from '../../src/games/personas.js';

const H = { pid: 'host', isHost: true, nick: 'Host' };

test('every added bot gets one of the personalities, shown to players', async () => {
  const t = createTable({ code: 'PERS-1234', game: 'holdem', options: {}, hostKey: 'k', now: 0 });
  await handle(t, H, { t: 'sit' }, 0);
  const seen = new Set();
  for (let k = 0; k < 40; k++) {
    await handle(t, H, { t: 'addBot' }, 0);
    const bot = t.seats.find((s) => s?.bot);
    assert.ok(PERSONA_IDS.includes(bot.persona));
    seen.add(bot.persona);
    const v = snapshot(t, { pid: H.pid, isHost: true, connected: new Set([H.pid]) }, 0);
    assert.equal(v.seats.find((s) => s?.bot).persona, bot.persona);
    assert.equal(v.seats.find((s) => s && !s.bot).persona, undefined);
    await handle(t, H, { t: 'removeBot', seat: t.seats.indexOf(bot) }, 0);
  }
  assert.equal(seen.size, PERSONA_IDS.length, 'all personalities appear');
});

test('personalities differ: reckless Xì dách bots bet more and draw to higher totals than careful ones', async () => {
  const stats = {};
  for (const persona of ['can', 'lieu']) {
    let bets = 0;
    let stands = [];
    for (let k = 0; k < 30; k++) {
      const t = createTable({ code: 'PERS-1235', game: 'xidach', options: {}, hostKey: 'k', now: 0 });
      await handle(t, H, { t: 'sit' }, 0);
      for (let i = 0; i < 3; i++) await handle(t, H, { t: 'addBot' }, 0);
      for (const s of t.seats) if (s?.bot) s.persona = persona;
      await handle(t, H, { t: 'start' }, 0);
      let now = 0;
      for (let i = 0; i < 200 && t.hand.phase !== 'done'; i++) await tick(t, (now += 1000));
      const h = t.hand;
      for (const p of h.players) if (t.seats[p].bot && h.bets[p]) bets += h.bets[p];
      stands.push(...h.players.filter((p) => t.seats[p].bot && p !== h.dealer).map((p) => h.cards[p].length));
    }
    stats[persona] = { bets, cards: stands.reduce((a, b) => a + b, 0) / stands.length };
  }
  assert.ok(stats.lieu.bets > stats.can.bets, JSON.stringify(stats));
  assert.ok(stats.lieu.cards > stats.can.cards, JSON.stringify(stats));
});
