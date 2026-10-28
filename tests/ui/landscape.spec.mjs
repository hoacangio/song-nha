// Landscape phones: every screen fits without page scrolling; the table puts the controls beside the felt.
import { test, expect } from '@playwright/test';

const over = (page) =>
  page.evaluate(() => ({
    h: document.documentElement.scrollHeight - innerHeight,
    w: document.documentElement.scrollWidth - document.documentElement.clientWidth, iw: innerWidth - document.documentElement.clientWidth,
  }));

for (const vp of [
  { width: 640, height: 360 },
  { width: 844, height: 390 },
]) {
  test(`landscape ${vp.width}x${vp.height}: home, sheets, course page and all three tables fit`, async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, locale: 'vi-VN' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await page.fill('#nick', 'Hòa');
    const fits = async (what) => {
      const o = await over(page);
      expect(o.h, `${what} scrolls vertically`).toBeLessThanOrEqual(0);
      expect(o.w, `${what} scrolls horizontally`).toBeLessThanOrEqual(0);
      expect(o.iw, `${what} is wider than the screen`).toBeLessThanOrEqual(0);
    };
    for (const tab of ['play', 'recent', 'learn']) {
      await page.click(`.bottom-bar [data-v=${tab}]`);
      await fits(`home ${tab}`);
    }
    await page.click('.bottom-bar [data-v=play]');
    // play tab is two columns: create and join side by side
    const create = await page.locator('.panel.create').boundingBox();
    const join = await page.locator('.side-col [data-mtab=play]').boundingBox();
    expect(join.x).toBeGreaterThan(create.x + create.width - 1);

    await page.click('[data-act=setGame][data-v=holdem]');
    await page.click('[data-act=rulesOpen]');
    await page.waitForTimeout(350); // bottom sheet slides up
    const sheet = await page.locator('.sheet.rules').boundingBox();
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(vp.height);
    await page.click('.sheet.rules .learn-head [data-act=rulesClose]');

    await page.goto('/hoc/holdem/rankings');
    await fits('course page');
    expect(await page.evaluate(() => { const b = document.querySelector('.learn-body'); return b.scrollHeight - b.clientHeight; })).toBeLessThanOrEqual(1);
    await page.goto('/');

    for (const [game, bots] of [['xidach', 5], ['tienlen', 3], ['holdem', 6]]) {
      await page.click('.bottom-bar [data-v=play]');
      await page.click(`[data-act=setGame][data-v=${game}]`);
      await page.click('[data-act=createTable]');
      await expect(page.locator('.seat.me')).toBeVisible();
      for (let i = 0; i < bots; i++) await page.click('.actions [data-act=addBot]');
      await page.click('[data-act=start]');
      await expect(page.locator('.dock .actions')).toBeVisible();
      await page.waitForTimeout(1500);
      await fits(`${game} table`);
      const felt = await page.locator('.felt').boundingBox();
      const dock = await page.locator('.dock').boundingBox();
      if (game === 'tienlen') expect(dock.y, 'Tiến lên hand under the felt').toBeGreaterThanOrEqual(felt.y + felt.height - 1);
      else expect(dock.x, `${game} controls beside the felt`).toBeGreaterThanOrEqual(felt.x + felt.width - 1);
      expect(dock.y + dock.height).toBeLessThanOrEqual(vp.height);
      await page.screenshot({ path: `test-results/landscape-${game}-${vp.width}.png` });
      await page.click('.tbar [data-act=home]');
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
