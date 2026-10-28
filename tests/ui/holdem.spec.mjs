// Hold'em UI: full hand with bots (call/check/raise flow), one-screen fit, learn overlay.
import { test, expect } from '@playwright/test';

async function setup(browser, { width = 390, height = 844, mobile = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.fill('#nick', 'Hòa');
  await page.click('[data-act=setGame][data-v=holdem]');
  return { ctx, page, errors };
}

const state = (page) => page.evaluate(() => window.App.app.table.state);

async function tableWithBots(page, bots) {
  await page.click('[data-act=createTable]');
  await expect(page.locator('.seat.me')).toBeVisible();
  for (let i = 0; i < bots; i++) await page.click('.actions [data-act=addBot]');
  await expect(page.locator('.seat:not(.empty)')).toHaveCount(bots + 1);
}

test('a full hand against bots: raise once, then call/check to the end', async ({ browser }) => {
  test.setTimeout(150_000);
  const { ctx, page, errors } = await setup(browser);
  await tableWithBots(page, 3);
  await page.click('[data-act=start]');
  await expect(page.locator('.my-hand .card')).toHaveCount(2);
  let raised = false;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const s = await state(page);
    if (s.hand.phase === 'done') break;
    const a = s.hand.actions;
    if (!a) {
      await page.waitForTimeout(200);
      continue;
    }
    if (!raised && a.raise) {
      await page.click('[data-act=raiseOpen]');
      await expect(page.locator('#raiseAmt')).toBeVisible();
      await page.click('[data-act=raisePreset] >> nth=1');
      await page.click('[data-act=raiseConfirm]');
      raised = true;
    } else if (a.check) await page.click('[data-act=hdCheck]');
    else await page.click('[data-act=hdCall]');
    await page.waitForTimeout(200);
  }
  const s = await state(page);
  expect(s.hand.phase).toBe('done');
  expect(s.seats.reduce((x, p) => x + (p ? p.chips : 0), 0)).toBe(4000);
  await expect(page.locator('.delta').first()).toBeVisible();
  // history records the board for the hand
  await page.click('[data-act=drawer]');
  await page.click('[data-act=tab][data-v=history]');
  await expect(page.locator('.hist li')).toHaveCount(1);
  expect(errors).toEqual([]);
  await ctx.close();
});

for (const vp of [
  { width: 390, height: 844, mobile: true },
  { width: 360, height: 640, mobile: true },
  { width: 1750, height: 1214, mobile: false },
]) {
  test(`9-seat Hold'em table and learn guide fit ${vp.width}x${vp.height}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx, page, errors } = await setup(browser, vp);
    // learn guide: every tab fits without scrolling
    await page.click('[data-act=learnOpen]');
    await expect(page.locator('[data-act=learnGame][data-v=holdem]')).toHaveClass(/on/);
    const tabs = await page.locator('.learn .tabs [data-act=learnTab]').evaluateAll((els) => els.map((e) => e.dataset.v));
    expect(tabs).toEqual(['rankings', 'flow', 'actions', 'tips', 'exam', 'cert']);
    for (const tab of tabs) {
      await page.click(`.learn .tabs [data-act=learnTab][data-v=${tab}]`);
      const over = await page.evaluate(() => {
        const b = document.querySelector('.learn-body');
        return b.scrollHeight - b.clientHeight;
      });
      expect(over, `learn tab ${tab}`).toBeLessThanOrEqual(1);
    }
    await page.click('.learn-head [data-act=learnClose]');
    await tableWithBots(page, 8);
    await page.click('[data-act=start]');
    await expect(page.locator('.my-hand .card')).toHaveCount(2);
    await page.waitForTimeout(2000);
    const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth }));
    expect(m.sh).toBeLessThanOrEqual(vp.height);
    expect(m.sw).toBeLessThanOrEqual(vp.width);
    const actions = await page.locator('.dock .actions').boundingBox();
    expect(actions.y + actions.height).toBeLessThanOrEqual(vp.height);
    await page.screenshot({ path: `test-results/holdem-${vp.width}x${vp.height}.png` });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
