// Tiến lên UI: tap-to-select, Play enabled only for valid beating combos, full game with bots, fit.
import { test, expect } from '@playwright/test';

async function setup(browser, { width = 390, height = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.fill('#nick', 'Hòa');
  await page.click('[data-act=setGame][data-v=tienlen]');
  // turn tới trắng off so the game always has turns to play
  await page.click('[data-act=rulesOpen]');
  await page.click('[data-act=rulesTab][data-v=instant]');
  for (const k of ['instantDragon', 'instantFour2', 'instantSixPairs', 'instantFivePairSeq']) await page.uncheck(`#o-${k}`);
  await page.click('.sheet.rules .btn.primary'); // save & close
  await page.click('[data-act=createTable]');
  await expect(page.locator('.seat.me')).toBeVisible();
  // the options typed in the sheet reached the server
  expect(await page.evaluate(() => window.App.app.table.state.opts.game.instantDragon)).toBe(false);
  for (let i = 0; i < 3; i++) await page.click('.actions [data-act=addBot]');
  await expect(page.locator('.seat:not(.empty)')).toHaveCount(4);
  await page.click('[data-act=start]');
  await expect(page.locator('.tl-hand .card')).toHaveCount(13);
  return { ctx, page, errors };
}

/** Taps the visible left strip of a card (the rest is covered by the next card, as on a real phone). */
const tap = (page, card) => page.click(`.tl-hand [data-card="${card}"]`, { position: { x: 8, y: 24 } });

const state = (page) => page.evaluate(() => window.App.app.table.state);

test('select cards by tap; Play only enabled for a valid, beating combo; full game finishes', async ({ browser }) => {
  // A 4-player game is up to ~65 moves and bots think 0.9 s each (≈ 45 s of bot time alone),
  // so give slow CI runners plenty of room.
  test.setTimeout(240_000);
  const { ctx, page, errors } = await setup(browser);
  const deadline = Date.now() + 200_000;
  let checkedSelection = false;
  while (Date.now() < deadline) {
    const s = await state(page);
    if (s.hand.phase === 'done') break;
    if (!s.hand.actions) {
      await page.waitForTimeout(200);
      continue;
    }
    const mine = s.hand.seats[s.you.seat].cards;
    if (!checkedSelection && mine.length >= 2) {
      // two random non-matching cards are not a combo → Play disabled
      const [a, b] = [mine[0], mine.find((c) => c[0] !== mine[0][0])];
      if (b) {
        await tap(page, a);
        await tap(page, b);
        await expect(page.locator(`.tl-hand [data-card="${a}"]`)).toHaveClass(/sel/);
        await expect(page.locator('[data-act=playSel]')).toBeDisabled();
        await tap(page, a); // unselect
        await tap(page, b);
        await expect(page.locator('.tl-hand .card.sel')).toHaveCount(0);
        checkedSelection = true;
      }
    }
    await page.click('[data-act=hint]');
    if (await page.locator('[data-act=playSel]:not([disabled])').count()) {
      const before = (await state(page)).hand.seats[s.you.seat].count;
      await page.click('[data-act=playSel]');
      await expect.poll(async () => (await state(page)).hand.seats[s.you.seat]?.count ?? 0).toBeLessThan(before);
    } else {
      await page.click('[data-act=pass]');
    }
    await page.waitForTimeout(150);
  }
  expect(checkedSelection).toBe(true);
  expect((await state(page)).hand.phase, 'game finished within the deadline').toBe('done');
  await expect(page.locator('.badge.win')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('.delta').first()).toBeVisible();
  const s = await state(page);
  const total = s.seats.reduce((a, x) => a + (x ? x.chips : 0), 0);
  expect(total).toBe(4000);
  expect(errors).toEqual([]);
  await ctx.close();
});

for (const vp of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 360, height: 640 },
]) {
  test(`Tiến lên table with 13 cards fits ${vp.width}x${vp.height}`, async ({ browser }) => {
    const { ctx, page, errors } = await setup(browser, vp);
    const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth }));
    expect(m.sh).toBeLessThanOrEqual(vp.height);
    expect(m.sw).toBeLessThanOrEqual(vp.width);
    const cards = await page.locator('.tl-hand .card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    expect(cards).toHaveLength(13);
    for (const b of cards) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(vp.width);
    }
    // each card keeps a usable tap strip (≥ 20 px visible)
    for (let i = 0; i < cards.length - 1; i++) expect(cards[i + 1].left - cards[i].left).toBeGreaterThanOrEqual(20);
    const actions = await page.locator('.dock .actions').boundingBox();
    expect(actions.y + actions.height).toBeLessThanOrEqual(vp.height);
    await page.screenshot({ path: `test-results/tienlen-${vp.width}x${vp.height}.png` });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
