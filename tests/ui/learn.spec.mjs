// Courses: every lesson / exam step / certificate fits without scrolling; passing the exam unlocks a
// downloadable PNG certificate.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const overflow = (page) =>
  page.evaluate(() => {
    const b = document.querySelector('.learn-body');
    return { body: b.scrollHeight - b.clientHeight, page: document.documentElement.scrollHeight - innerHeight };
  });

async function open(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, locale: 'vi-VN', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.fill('#nick', 'Nguyễn Thái Hòa');
  return { ctx, page, errors };
}

async function passCourse(page, game, vp) {
  await page.click(`[data-act=learnGame][data-v=${game}]`);
  // Read every lesson
  const lessons = await page.locator('.learn .tabs [data-act=learnTab]').evaluateAll((els) => els.map((e) => e.dataset.v).filter((v) => v !== 'exam' && v !== 'cert'));
  expect(lessons.length).toBeGreaterThanOrEqual(4);
  for (const id of lessons) {
    await page.click(`.learn .tabs [data-act=learnTab][data-v=${id}]`);
    const o = await overflow(page);
    expect(o.body, `${game}/${id} lesson scrolls at ${vp.width}x${vp.height}`).toBeLessThanOrEqual(1);
    expect(o.page).toBeLessThanOrEqual(0);
  }
  // Certificate is locked before the exam
  await page.click('.learn .tabs [data-act=learnTab][data-v=cert]');
  await expect(page.locator('.checklist li')).toHaveCount(2);
  // Exam: answer correctly using the generated questions' answers
  await page.click('.learn .tabs [data-act=learnTab][data-v=exam]');
  await page.click('[data-act=examStart]');
  for (let i = 0; i < 10; i++) {
    const answer = await page.evaluate(() => {
      const ex = window.App.app.ui.exam;
      return ex.qs[ex.i].answer;
    });
    const o = await overflow(page);
    expect(o.body, `${game} question ${i + 1} scrolls`).toBeLessThanOrEqual(1);
    await page.click(`[data-act=examPick][data-v="${answer}"]`);
    await expect(page.locator('.btn.opt.right')).toHaveCount(1);
    const o2 = await overflow(page);
    expect(o2.body, `${game} question ${i + 1} feedback scrolls`).toBeLessThanOrEqual(1);
    await page.click('[data-act=examNext]');
  }
  await expect(page.locator('.big-score')).toHaveText('10/10');
  await page.click('.exam-result [data-act=learnTab][data-v=cert]');
  await expect(page.locator('img.cert-img')).toBeVisible();
  const o = await overflow(page);
  expect(o.body, `${game} certificate scrolls`).toBeLessThanOrEqual(1);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=certDownload]')]);
  expect(download.suggestedFilename()).toBe(`song-nha-chung-chi-${game}.png`);
  const bytes = await readFile(await download.path());
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.length).toBeGreaterThan(30_000);
  await expect(page.locator(`[data-act=learnGame][data-v=${game}]`)).toContainText('🏅');
}

for (const vp of [
  { width: 360, height: 640, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 1750, height: 1214, mobile: false },
]) {
  test(`three courses → exams → certificates at ${vp.width}x${vp.height}`, async ({ browser }) => {
    test.setTimeout(150_000);
    const { ctx, page, errors } = await open(browser, vp);
    await page.click('[data-act=learnOpen]');
    for (const game of ['xidach', 'tienlen', 'holdem']) await passCourse(page, game, vp);
    if (vp.width === 390) await page.screenshot({ path: 'test-results/learn-cert-390.png' });
    // Progress survives a reload
    await page.reload();
    await page.click('[data-act=learnOpen]');
    await expect(page.locator('[data-act=learnGame] >> text=🏅')).toHaveCount(3);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('a failed exam does not unlock the certificate', async ({ browser }) => {
  const { ctx, page } = await open(browser, { width: 390, height: 844, mobile: true });
  await page.click('[data-act=learnOpen]');
  await page.click('[data-act=learnGame][data-v=tienlen]');
  await page.click('.learn .tabs [data-act=learnTab][data-v=exam]');
  await page.click('[data-act=examStart]');
  for (let i = 0; i < 10; i++) {
    const wrong = await page.evaluate(() => {
      const q = window.App.app.ui.exam.qs[window.App.app.ui.exam.i];
      return q.options.find((o) => o.v !== q.answer).v;
    });
    await page.click(`[data-act=examPick][data-v="${wrong}"]`);
    await page.click('[data-act=examNext]');
  }
  await expect(page.locator('.big-score')).toHaveText('0/10');
  await page.click('.learn .tabs [data-act=learnTab][data-v=cert]');
  await expect(page.locator('img.cert-img')).toHaveCount(0);
  await expect(page.locator('.checklist')).toBeVisible();
  await ctx.close();
});
