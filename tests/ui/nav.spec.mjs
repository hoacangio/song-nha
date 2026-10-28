// Learn menu placement: mobile bottom bar tabs (Chơi / Gần đây / Học luật / ⚙), desktop right column,
// and a 🎓 tab in the table sidebar. Every state fits without scrolling.
import { test, expect } from '@playwright/test';
import { COURSE_IDS } from '../../public/js/learn/index.js';

const fits = (page) => page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

test('mobile bottom bar switches home sections and opens the learn menu', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  const bar = page.locator('.bottom-bar');
  await expect(bar).toBeVisible();
  await expect(page.locator('#nick')).toBeVisible();
  await expect(page.locator('.learn-menu')).toBeHidden();
  expect(await fits(page)).toBeLessThanOrEqual(0);

  await bar.locator('[data-v=recent]').click();
  await expect(page.locator('.recent-head')).toBeVisible();
  await expect(page.locator('#nick')).toBeHidden();
  expect(await fits(page)).toBeLessThanOrEqual(0);

  await bar.locator('[data-v=learn]').click();
  await expect(bar.locator('[data-v=learn]')).toHaveClass(/on/);
  await expect(page.locator('.learn-menu .course-row')).toHaveCount(COURSE_IDS.length);
  expect(await fits(page)).toBeLessThanOrEqual(0);
  await page.click('.learn-menu [data-act=learnOpen][data-game=tienlen]');
  await expect(page.locator('[data-act=learnGame][data-v=tienlen]')).toHaveClass(/on/);
  await page.click('.learn-head [data-act=learnClose]');
  await expect(page.locator('.learn-menu')).toBeVisible(); // stays on the 🎓 tab

  await bar.locator('[data-act=settingsOpen]').click();
  await expect(page.locator('.sheet.settings')).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('desktop: learn menu in the right column, no bottom bar; table sidebar has a 🎓 tab', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'vi-VN' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('.bottom-bar')).toBeHidden();
  await expect(page.locator('.side-col .learn-menu .course-row')).toHaveCount(COURSE_IDS.length);
  await expect(page.locator('#nick')).toBeVisible();
  expect(await fits(page)).toBeLessThanOrEqual(0);

  await page.fill('#nick', 'Hòa');
  await page.click('[data-act=createTable]');
  await expect(page.locator('.code-chip')).toBeVisible();
  await page.click('.tabs [data-act=tab][data-v=learn]');
  await expect(page.locator('.tab-body .learn-menu .course-row')).toHaveCount(COURSE_IDS.length);
  await page.click('.tab-body [data-act=learnOpen][data-game=holdem]');
  await expect(page.locator('[data-act=learnGame][data-v=holdem]')).toHaveClass(/on/);
  expect(await fits(page)).toBeLessThanOrEqual(0);
  await ctx.close();
});

test('courses are a page: /hoc/<game>/<lesson> deep links, Back returns to the table still seated', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'vi-VN' });
  const page = await ctx.newPage();
  await page.goto('/hoc/tienlen/exam');
  await expect(page.locator('main.learn-page')).toBeVisible();
  await expect(page.locator('.overlay')).toHaveCount(0);
  await expect(page.locator('.learn-nav [data-v=exam]')).toHaveClass(/on/);
  await page.click('.learn-head [data-act=learnClose]'); // opened from a link → home
  await expect(page).toHaveURL(/\/$/);

  await page.fill('#nick', 'Hòa');
  await page.click('[data-act=createTable]');
  await expect(page.locator('.seat.me')).toBeVisible();
  const tableUrl = page.url();
  await page.click('.menu-btn');
  await page.click('.tabs [data-act=tab][data-v=learn]');
  await page.click('.tab-body [data-act=learnOpen][data-game=xidach]');
  await expect(page).toHaveURL(/\/hoc\/xidach$/);
  await expect(page.locator('.back-btn')).toHaveAttribute('aria-label', 'Về bàn');
  // lesson switches replace the URL, "Bài tiếp" walks through the lessons
  await page.click('.learn-foot [data-act=learnTab]');
  await expect(page).toHaveURL(/\/hoc\/xidach\/[a-z-]+$/);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
  await page.goBack(); // one step back leaves the course
  await expect(page).toHaveURL(tableUrl);
  await expect(page.locator('.seat.me')).toBeVisible();
  expect(await page.evaluate(() => window.App.app.table.status)).toBe('open');
  await ctx.close();
});

test('mobile dialogs are bottom sheets that close with a swipe down; desktop keeps centred dialogs', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'vi-VN' });
  const page = await ctx.newPage();
  await page.goto('/');
  for (const open of ['[data-act=settingsOpen] >> nth=0', '[data-act=rulesOpen]']) {
    if (open.includes('settings')) await page.click('.bottom-bar [data-act=settingsOpen]');
    else await page.click(open);
    const sheet = page.locator('.overlay > .sheet');
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(350); // slide-up animation
    const box = await sheet.boundingBox();
    expect(Math.round(box.y + box.height)).toBe(844);
    expect(Math.round(box.width)).toBe(390);
    // drag the handle down
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 100, { steps: 6 });
    await page.mouse.move(box.x + box.width / 2, box.y + 260, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.overlay')).toHaveCount(0);
  }
  // a short drag snaps back
  await page.click('.bottom-bar [data-act=settingsOpen]');
  await page.waitForTimeout(350);
  const b = await page.locator('.overlay > .sheet').boundingBox();
  await page.mouse.move(b.x + 100, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + 100, b.y + 40, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.overlay')).toHaveCount(1);
  await ctx.close();

  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'vi-VN' });
  const dp = await desk.newPage();
  await dp.goto('/');
  await dp.click('.home-head [data-act=settingsOpen]');
  await dp.waitForTimeout(300);
  const d = await dp.locator('.overlay > .sheet').boundingBox();
  expect(d.y).toBeGreaterThan(20);
  expect(d.y + d.height).toBeLessThan(780);
  await desk.close();
});
