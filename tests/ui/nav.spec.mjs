// Learn menu placement: mobile bottom bar tabs (Chơi / Gần đây / Học luật / ⚙), desktop right column,
// and a 🎓 tab in the table sidebar. Every state fits without scrolling.
import { test, expect } from '@playwright/test';

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
  await expect(page.locator('.learn-menu .course-row')).toHaveCount(3);
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
  await expect(page.locator('.side-col .learn-menu .course-row')).toHaveCount(3);
  await expect(page.locator('#nick')).toBeVisible();
  expect(await fits(page)).toBeLessThanOrEqual(0);

  await page.fill('#nick', 'Hòa');
  await page.click('[data-act=createTable]');
  await expect(page.locator('.code-chip')).toBeVisible();
  await page.click('.tabs [data-act=tab][data-v=learn]');
  await expect(page.locator('.tab-body .learn-menu .course-row')).toHaveCount(3);
  await page.click('.tab-body [data-act=learnOpen][data-game=holdem]');
  await expect(page.locator('[data-act=learnGame][data-v=holdem]')).toHaveClass(/on/);
  expect(await fits(page)).toBeLessThanOrEqual(0);
  await ctx.close();
});
