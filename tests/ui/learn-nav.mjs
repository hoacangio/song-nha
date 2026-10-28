// Opens a course from the learn menu: the 🎓 bottom-bar tab on mobile, the right column on desktop.
export async function openLearn(page, game = 'xidach') {
  if (new URL(page.url()).pathname.startsWith('/hoc/')) await page.goto('/');
  const bar = page.locator('.bottom-bar [data-act=homeTab][data-v=learn]');
  if (await bar.isVisible()) await bar.click();
  await page.click(`.learn-menu [data-act=learnOpen][data-game=${game}]`);
}

// Back to the 🃏 Chơi section (mobile only; on desktop every section is visible).
export async function playTab(page) {
  await page.locator('main.home').waitFor(); // leaving the course page runs a view transition
  const bar = page.locator('.bottom-bar [data-act=homeTab][data-v=play]');
  if (await bar.isVisible()) await bar.click();
}
