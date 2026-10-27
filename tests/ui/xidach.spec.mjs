// End-to-end UI tests for Xì dách: full hand with bots, one-screen fit, reconnect mid-hand.
import { test, expect } from '@playwright/test';

const PHONES = [
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '375x667', width: 375, height: 667, mobile: true },
  { name: '360x640', width: 360, height: 640, mobile: true },
  { name: 'desktop', width: 1280, height: 800, mobile: false },
];

async function newPlayer(browser, { width = 390, height = 844, mobile = true, nick = 'Hòa' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.fill('#nick', nick);
  return { ctx, page, errors };
}

async function createTableWithBots(page, bots) {
  await page.click('[data-act=createTable]');
  await expect(page.locator('.felt')).toBeVisible();
  await expect(page.locator('.seat.me')).toBeVisible(); // auto-seated
  for (let i = 0; i < bots; i++) {
    const before = await page.locator('.seat:not(.empty)').count();
    await page.click('.actions [data-act=addBot]');
    await expect(page.locator('.seat:not(.empty)')).toHaveCount(before + 1);
  }
  return (await page.locator('.code-chip').innerText()).trim();
}

/** Clicks whatever action this player has until the hand is over. */
async function playHand(page) {
  await page.click('[data-act=start]');
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const phase = await page.evaluate(() => window.App.app.table?.state?.hand?.phase);
    if (phase === 'done') return;
    const enabled = async (sel) => (await page.locator(`${sel}:not([disabled])`).count()) > 0;
    if (await enabled('[data-act=bet]')) await page.click('[data-act=bet]');
    else if (await enabled('[data-act=stay]')) await page.click('[data-act=stay]');
    else if (await enabled('[data-act=xetAll]')) await page.click('[data-act=xetAll]');
    else if (await enabled('.actions [data-act=hit]')) await page.click('.actions [data-act=hit]');
    await page.waitForTimeout(150);
  }
  throw new Error('hand did not finish');
}

test('full Xì dách hand against bots, then the next hand starts', async ({ browser }) => {
  const { page, ctx, errors } = await newPlayer(browser);
  await createTableWithBots(page, 3);
  await playHand(page);
  await expect(page.locator('.phase')).toHaveText(/Kết thúc ván/);
  await expect(page.locator('.delta').first()).toBeVisible();
  // fairness: the seed of the finished hand verifies against its commitment
  await page.click('[data-act=drawer]');
  await page.click('[data-act=tab][data-v=fairness]');
  await page.click('[data-act=verify]');
  await expect(page.locator('.tab-body')).toContainText('Khớp');
  // history has the hand
  await page.click('[data-act=tab][data-v=history]');
  await expect(page.locator('.hist li')).toHaveCount(1);
  await page.click('.close-x');
  await expect(page.locator('.screen.drawer-open')).toHaveCount(0);
  // auto next hand (dealer rotates to a bot, so we bet next)
  await expect(page.locator('[data-act=bet]')).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
  await ctx.close();
});

for (const vp of PHONES) {
  test(`table fits one screen without scrolling — ${vp.name}`, async ({ browser }) => {
    const { page, ctx, errors } = await newPlayer(browser, vp);
    await createTableWithBots(page, 7); // full 8-seat table
    await page.click('[data-act=start]');
    await page.waitForTimeout(2500); // bots bet, cards dealt
    for (const stage of ['dealing', 'dealer']) {
      const m = await page.evaluate(() => ({
        sh: document.documentElement.scrollHeight,
        sw: document.documentElement.scrollWidth,
        h: innerHeight,
        w: innerWidth,
      }));
      expect(m.sh, `${stage}: vertical scroll`).toBeLessThanOrEqual(m.h);
      expect(m.sw, `${stage}: horizontal scroll`).toBeLessThanOrEqual(m.w);
      for (const sel of ['.tbar', '.dock .actions', '.seat.me']) {
        const box = await page.locator(sel).boundingBox();
        expect(box, sel).not.toBeNull();
        expect(box.y + box.height, `${sel} bottom`).toBeLessThanOrEqual(m.h + 1);
        expect(box.y, `${sel} top`).toBeGreaterThanOrEqual(-1);
      }
      const seats = await page.locator('.seat').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      for (const b of seats) {
        expect(b.left).toBeGreaterThanOrEqual(-2);
        expect(b.right).toBeLessThanOrEqual(m.w + 2);
      }
      if (stage === 'dealing') {
        await expect(page.locator('[data-act=xetAll]')).toBeVisible({ timeout: 30_000 });
      }
    }
    await page.screenshot({ path: `test-results/fit-${vp.name}.png` });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('reconnect mid-hand keeps the seat and the same private cards', async ({ browser }) => {
  const host = await newPlayer(browser, { nick: 'Chủ' });
  const code = await createTableWithBots(host.page, 0);
  const guest = await newPlayer(browser, { nick: 'Khách' });
  await guest.page.goto(`/t/${code}`);
  await expect(guest.page.locator('.seat.me')).toBeVisible();
  await expect(host.page.locator('.seat:not(.empty)')).toHaveCount(2);

  await host.page.click('[data-act=start]'); // host deals first (seat 0), guest bets
  await guest.page.click('[data-act=bet]');
  await expect(guest.page.locator('.my-hand .card')).toHaveCount(2);
  const cardsBefore = await guest.page.locator('.my-hand .card').evaluateAll((els) => els.map((e) => e.dataset.card));
  const seatBefore = await guest.page.evaluate(() => window.App.app.table.state.you.seat);

  // 1) network drop: the socket closes without a clean shutdown → backoff reconnect
  await guest.page.evaluate(() => window.App.app.table.sock.ws.close(4000, 'test drop'));
  await expect(guest.page.locator('.conn')).toHaveCount(0, { timeout: 10_000 });
  await expect(guest.page.locator('.my-hand .card')).toHaveCount(2);
  // 2) full reload: same device secret → same player
  await guest.page.reload();
  await expect(guest.page.locator('.my-hand .card')).toHaveCount(2);
  const cardsAfter = await guest.page.locator('.my-hand .card').evaluateAll((els) => els.map((e) => e.dataset.card));
  const seatAfter = await guest.page.evaluate(() => window.App.app.table.state.you.seat);
  expect(seatAfter).toBe(seatBefore);
  expect(cardsAfter).toEqual(cardsBefore);
  // the host never sees the guest's cards while the hand runs
  const seen = await host.page.evaluate((s) => {
    const h = window.App.app.table.state.hand;
    return { cards: h.seats[s].cards, settled: !!h.seats[s].settled, phase: h.phase };
  }, seatBefore);
  if (seen.phase !== 'done' && !seen.settled) expect(seen.cards).toBeNull();
  expect([...host.errors, ...guest.errors]).toEqual([]);
  await host.ctx.close();
  await guest.ctx.close();
});
