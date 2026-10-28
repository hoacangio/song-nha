// Vietnamese is the default even on an English browser; choosing English is remembered.
import { test, expect } from '@playwright/test';

test('an English-language browser still opens in Vietnamese; EN is remembered after switching', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.locator('[data-act=createTable]')).toHaveText('Tạo bàn');
  await page.click('[data-act=setLang][data-v=en]');
  await expect(page.locator('[data-act=createTable]')).toHaveText('Create table');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-act=createTable]')).toHaveText('Create table');
  await ctx.close();
});
