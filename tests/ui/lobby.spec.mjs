// "🎲 Random table" joins a table whose host allowed strangers.
import { test, expect } from '@playwright/test';

test('host allows strangers; a player taps 🎲 and lands at that table', async ({ browser }) => {
  const host = await browser.newContext({ locale: 'vi-VN' });
  const hp = await host.newPage();
  await hp.goto('/');
  await hp.fill('#nick', 'Chủ bàn');
  await hp.click('[data-act=setGame][data-v=holdem]');
  await hp.click('[data-act=rulesOpen]');
  await hp.check('#o-public');
  await hp.click('.sheet.rules .btn.primary');
  await hp.click('[data-act=createTable]');
  await expect(hp.locator('.seat.me')).toBeVisible();
  await expect(hp.locator('.pub-chip')).toBeVisible();
  const code = (await hp.locator('.code-chip').innerText()).trim();

  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, locale: 'vi-VN' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.fill('#nick', 'Người lạ');
  // still one screen on a small phone with the extra button
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(640);
  await page.click('[data-act=setGame][data-v=xidach]'); // no public Xì dách table → falls back to any game
  await page.click('[data-act=joinRandom]');
  await expect(page.locator('.code-chip')).toHaveText(code);
  await expect(page.locator('.seat.me')).toBeVisible();
  await expect(hp.locator('.seat:not(.empty)')).toHaveCount(2);

  // The host switches it off: nobody else is sent there.
  await hp.click('[data-act=drawer]').catch(() => {});
  await hp.click('[data-act=tab][data-v=settings]');
  await hp.click('[data-act=togglePublic]');
  await expect(hp.locator('.pub-chip')).toHaveCount(0);
  const third = await browser.newContext({ locale: 'vi-VN' });
  const tp = await third.newPage();
  await tp.goto('/');
  await tp.fill('#nick', 'Khác');
  await tp.click('[data-act=joinRandom]');
  await expect(tp.locator('.toast')).toBeVisible();
  await expect(tp.locator('.home')).toBeVisible();
  await Promise.all([host.close(), ctx.close(), third.close()]);
});
