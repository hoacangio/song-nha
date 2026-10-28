// Mậu binh and Tichu in the browser: full hands with bots, one-screen fit, no console errors.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function open(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, locale: 'vi-VN', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.fill('#nick', 'Hòa');
  return { ctx, page, errors };
}

async function tableWithBots(page, game, bots) {
  await page.click(`[data-act=setGame][data-v=${game}]`);
  await page.click('[data-act=createTable]');
  await expect(page.locator('.seat.me')).toBeVisible();
  for (let i = 0; i < bots; i++) await page.click('.actions [data-act=addBot]');
  await expect(page.locator('.seat:not(.empty)')).toHaveCount(bots + 1);
  await page.click('[data-act=start]');
}

const fits = async (page, vp, what) => {
  const m = await page.evaluate(() => ({ h: document.documentElement.scrollHeight - innerHeight, w: document.documentElement.scrollWidth - innerWidth }));
  expect(m.h, `${what} scrolls at ${vp.width}x${vp.height}`).toBeLessThanOrEqual(0);
  expect(m.w, `${what} scrolls sideways`).toBeLessThanOrEqual(0);
  // measured in one synchronous step: the table re-renders on every server update
  const bottom = await page.evaluate(() => document.querySelector('.dock')?.getBoundingClientRect().bottom ?? 0);
  expect(bottom, `${what} controls on screen`).toBeLessThanOrEqual(vp.height + 1);
};

for (const vp of [
  { width: 390, height: 844, mobile: true },
  { width: 360, height: 640, mobile: true },
  { width: 667, height: 375, mobile: true },
  { width: 1440, height: 900 },
]) {
  test(`Mậu binh: swap cards, auto-arrange, lock in, reveal — fits ${vp.width}x${vp.height}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page, errors } = await open(browser, vp);
    await tableWithBots(page, 'maubinh', 3);
    await expect(page.locator('.mb-row')).toHaveCount(3);
    await expect(page.locator('.mb-cards .card')).toHaveCount(13);
    await fits(page, vp, 'arranging');
    // tap two cards: they swap places
    const order = () => page.locator('.mb-cards .card').evaluateAll((els) => els.map((e) => e.dataset.card));
    const before = await order();
    await page.click(`.mb-cards [data-card="${before[0]}"]`);
    await page.click(`.mb-cards [data-card="${before[12]}"]`);
    const after = await order();
    expect(after[0]).toBe(before[12]);
    expect(after[12]).toBe(before[0]);
    // auto-arrange is always valid, then lock in
    await page.click('[data-act=mbAuto]');
    await expect(page.locator('.mb-rows.lung')).toHaveCount(0);
    await page.click('[data-act=mbSubmit]');
    await expect.poll(() => page.evaluate(() => window.App.app.table.state.hand.phase), { timeout: 30_000 }).toBe('done');
    await expect(page.locator('.mb-mini')).toHaveCount(3, { timeout: 5000 });
    await fits(page, vp, 'showdown');
    await page.screenshot({ path: `test-results/maubinh-${vp.width}x${vp.height}.png` });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('Tichu: a whole hand against three bots (Grand Tichu, passing, play) with every screen fitting', async ({ browser }) => {
  test.setTimeout(300_000);
  const vp = { width: 390, height: 844, mobile: true };
  const { ctx, page, errors } = await open(browser, vp);
  await tableWithBots(page, 'tichu', 3);
  await expect(page.locator('[data-act=tcGrand]')).toHaveCount(2);
  await expect(page.locator('.tc-hand .card')).toHaveCount(8);
  await fits(page, vp, 'grand tichu');
  await page.click('[data-act=tcGrand][data-v="0"]');
  await expect(page.locator('.tc-slots')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.tc-hand .card')).toHaveCount(14);
  // pick three cards by hand: they fill the slots in order; tapping again removes one
  const cards = await page.locator('.tc-hand .card').evaluateAll((els) => els.map((e) => e.dataset.card));
  // overlapping cards: tap the visible left strip, like a finger would
  const tap = (c) => page.click(`.tc-hand [data-card="${c}"]`, { position: { x: 5, y: 30 } });
  for (const c of cards.slice(0, 3)) await tap(c);
  await expect(page.locator('.tc-slot .card')).toHaveCount(3);
  await tap(cards[1]);
  await expect(page.locator('.tc-slot .card')).toHaveCount(2);
  await tap(cards[3]);
  await fits(page, vp, 'passing');
  await page.click('[data-act=tcGive]');
  await expect.poll(() => page.evaluate(() => window.App.app.table.state.hand.phase), { timeout: 30_000 }).toBe('play');
  await fits(page, vp, 'play');
  const deadline = Date.now() + 240_000;
  let myTurns = 0;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const h = window.App.app.table.state.hand;
      return { phase: h.phase, a: h.actions };
    });
    if (st.phase === 'done') break;
    if (st.a?.dragon) await page.click('[data-act=tcDragon] >> nth=0');
    else if (st.a?.play) {
      myTurns++;
      await page.click('[data-act=tcHint]');
      const canPlay = await page.locator('[data-act=tcPlay]:not([disabled])').count();
      if (canPlay) await page.click('[data-act=tcPlay]');
      else await page.click('[data-act=pass]');
      if (myTurns === 2) await fits(page, vp, 'my turn');
    }
    await page.waitForTimeout(250);
  }
  expect(await page.evaluate(() => window.App.app.table.state.hand.phase)).toBe('done');
  await fits(page, vp, 'hand over');
  await page.screenshot({ path: 'test-results/tichu-done-390.png' });
  expect(errors).toEqual([]);
  await ctx.close();
});

for (const vp of [
  { width: 640, height: 360, mobile: true },
  { width: 1440, height: 900 },
]) {
  test(`Tichu screens fit ${vp.width}x${vp.height}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page, errors } = await open(browser, vp);
    if (vp.mobile) await page.click('.bottom-bar [data-v=play]');
    await tableWithBots(page, 'tichu', 3);
    await expect(page.locator('[data-act=tcGrand]')).toHaveCount(2);
    await fits(page, vp, 'grand');
    await page.click('[data-act=tcGrand][data-v="0"]');
    await expect(page.locator('.tc-slots')).toBeVisible({ timeout: 20_000 });
    await page.click('[data-act=tcGiveHint]');
    await fits(page, vp, 'passing');
    await page.click('[data-act=tcGive]');
    await expect.poll(() => page.evaluate(() => window.App.app.table.state.hand.phase), { timeout: 30_000 }).toBe('play');
    await fits(page, vp, 'play');
    await page.screenshot({ path: `test-results/tichu-${vp.width}x${vp.height}.png` });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('new courses: Mậu binh and Tichu lessons, exams and certificates', async ({ browser }) => {
  test.setTimeout(120_000);
  const vp = { width: 390, height: 844, mobile: true };
  const { ctx, page, errors } = await open(browser, vp);
  for (const game of ['maubinh', 'tichu']) {
    await page.goto(`/hoc/${game}`);
    const lessons = await page.locator('.learn-nav [data-act=learnTab]').evaluateAll((els) => els.map((e) => e.dataset.v).filter((v) => v !== 'exam' && v !== 'cert'));
    expect(lessons.length).toBeGreaterThanOrEqual(5);
    for (const id of lessons) {
      await page.click(`.learn-nav [data-act=learnTab][data-v=${id}]`);
      const over = await page.evaluate(() => { const b = document.querySelector('.learn-body'); return b.scrollHeight - b.clientHeight; });
      expect(over, `${game}/${id}`).toBeLessThanOrEqual(1);
    }
    await page.click('.learn-nav [data-act=learnTab][data-v=exam]');
    await page.click('[data-act=examStart]');
    for (let i = 0; i < 10; i++) {
      const a = await page.evaluate(() => window.App.app.ui.exam.qs[window.App.app.ui.exam.i].answer);
      await page.click(`[data-act=examPick][data-v="${a}"]`);
      await page.click('[data-act=examNext]');
    }
    await expect(page.locator('.big-score')).toHaveText('10/10');
    await page.click('.exam-result [data-act=learnTab][data-v=cert]');
    await expect(page.locator('img.cert-img')).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=certDownload]')]);
    expect(download.suggestedFilename()).toBe(`song-nha-chung-chi-${game}.png`);
    const bytes = await readFile(await download.path());
    expect(bytes.length).toBeGreaterThan(30_000);
  }
  expect(errors).toEqual([]);
  await ctx.close();
});
