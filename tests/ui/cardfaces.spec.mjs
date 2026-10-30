// Every face-up card on the table shows its rank: nothing (the next card, a badge…) covers the rank corner.
import { test, expect } from '@playwright/test';

const covered = (page) =>
  page.evaluate(() => {
    const bad = [];
    // hit-testing skips pointer-events:none layers (the felt centre); measure with them enabled
    const st = document.createElement('style');
    st.textContent = '.felt * { pointer-events: auto !important; }';
    document.head.appendChild(st);
    for (const el of document.querySelectorAll('.seat .card[data-card] .ci')) { // cards in seats (the centre ignores pointer events and is laid out without overlap)
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const card = el.closest('.card');
      // the centre of the rank label must belong to its own card
      // topmost card at that point (the felt centre ignores pointer events, so look at every layer)
      const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 6));
      const top = stack.map((e) => e.closest('.card, .badge, .delta, .bet-chip, .who, .avatar')).find(Boolean);
      if (top !== card) bad.push(`${card.dataset.card} under ${top?.className || 'nothing'}`);
    }
    st.remove();
    return { bad, n: document.querySelectorAll('.seat .card[data-card]').length };
  });

for (const vp of [
  { width: 1000, height: 460, mobile: true },
  { width: 640, height: 360, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 1440, height: 900 },
]) {
  for (const [game, bots] of [['xidach', 3], ['holdem', 5], ['maubinh', 3]]) {
    test(`${game}: revealed cards readable at ${vp.width}x${vp.height}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, locale: 'vi-VN' });
      const page = await ctx.newPage();
      await page.goto('/');
      await page.fill('#nick', 'Hòa');
      await page.click(`[data-act=setGame][data-v=${game}]`);
      await page.click('[data-act=createTable]');
      await expect(page.locator('.seat.me')).toBeVisible();
      for (let i = 0; i < bots; i++) await page.click('.actions [data-act=addBot]');
      await page.click('[data-act=start]');
      // play until the hand is over so bot cards are face up
      for (let i = 0; i < 200; i++) {
        const st = await page.evaluate(() => {
          const h = window.App.app.table.state.hand;
          return { phase: h?.phase, a: h?.actions };
        });
        if (st.phase === 'done') break;
        const a = st.a;
        if (a?.bet) await page.click('[data-act=bet], [data-act=placeBet]').catch(() => {});
        if (a?.stay) await page.click('[data-act=stay]').catch(() => {});
        if (a?.xet) await page.click('[data-act=xetAll]').catch(() => {});
        if (a?.call || a?.check) await page.click('[data-act=hdCheck], [data-act=hdCall]').catch(() => {});
        if (a?.arrange) await page.click('[data-act=mbSubmit]').catch(() => {});
        await page.waitForTimeout(400);
      }
      await expect.poll(() => page.evaluate(() => window.App.app.table.state.hand.phase), { timeout: 60_000 }).toBe('done');
      await page.waitForTimeout(600);
      const r = await covered(page);
      await page.screenshot({ path: `test-results/cards-${game}-${vp.width}x${vp.height}.png` });
      expect(r.n, 'some face-up cards on the felt').toBeGreaterThan(0);
      expect(r.bad, `covered ranks at ${vp.width}x${vp.height}`).toEqual([]);
      await ctx.close();
    });
  }
}
