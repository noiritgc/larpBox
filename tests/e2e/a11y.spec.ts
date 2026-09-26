import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { closeAll, findByRole, hostRoom, joinAll, joinPlayer, pageErrors, PHONE, startGame, writeAll, type HostHandle, type PlayerHandle } from '../helpers/players';

/**
 * Automated WCAG 2.1 A/AA checks (axe-core) on the static pages and on live host/phone screens.
 * Automated scans catch a subset of issues; screenshots and keyboard checks cover the rest.
 */

let host: HostHandle | null = null;
let players: PlayerHandle[] = [];

test.afterEach(async () => {
  await closeAll(host, players);
  host = null;
  players = [];
  expect(pageErrors.splice(0)).toEqual([]);
});

async function expectNoViolations(page: Page, label: string) {
  // Measure the settled screen: mid-fade elements are translucent and would skew contrast.
  // Infinite animations (the writing marquee) never finish, so only finite ones are awaited.
  await page.evaluate(async () => {
    for (let pass = 0; pass < 3; pass += 1) {
      const running = document.getAnimations().filter((animation) => {
        const timing = animation.effect?.getComputedTiming();
        return timing !== undefined && timing.iterations !== Infinity && animation.playState !== 'finished';
      });
      if (running.length === 0) return;
      await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
    }
  });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
  }));
  expect(summary, `${label} accessibility violations`).toEqual([]);
}

test('static pages have no automated accessibility violations', async ({ browser }) => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  for (const path of ['/', '/join', '/help', '/host/new', '/no-such-page']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoViolations(page, path);
  }
  await context.close();
});

test('live lobby, writing and duel screens have no automated accessibility violations', async ({ browser }) => {
  host = await hostRoom(browser, { quick: true, writingSeconds: 180, guessSeconds: 30, endorseSeconds: 30 });
  await expectNoViolations(host.page, 'host lobby (empty)');
  const guest = await joinPlayer(browser, host.code, 'Guest');
  players = [guest];
  await expectNoViolations(guest.page, 'phone lobby');
  players.push(...(await joinAll(browser, host.code, ['Sam', 'Jo'])));
  await guest.page.getByTestId('ready-button').click();
  await expectNoViolations(host.page, 'host lobby (full)');
  await startGame(host, 3);
  await expect(guest.page.getByTestId('composer')).toBeVisible({ timeout: 30_000 });
  await expectNoViolations(guest.page, 'phone writing');
  await expectNoViolations(host.page, 'host writing');

  await writeAll(players);
  await expect(host.page.getByTestId('host-duel-guess')).toBeVisible({ timeout: 30_000 });
  const reader = await findByRole(players, 'reader', 'guess');
  await expectNoViolations(reader.page, 'phone guess');
  await expectNoViolations(host.page, 'host guess');
  await reader.page.getByRole('radiogroup', { name: 'What actually happened?' }).getByRole('radio').first().click();
  await reader.page.getByTestId('lock-guess').click();
  await expect(host.page.getByTestId('host-duel-endorse')).toBeVisible({ timeout: 30_000 });
  await expectNoViolations(reader.page, 'phone endorse');
  await expectNoViolations(host.page, 'host endorse');
  await reader.page.getByRole('radio', { name: 'Endorse A' }).click();
  await reader.page.getByTestId('lock-endorsement').click();
  await expect(host.page.getByTestId('host-duel-result')).toBeVisible({ timeout: 30_000 });
  await expectNoViolations(reader.page, 'phone result');
  await expectNoViolations(host.page, 'host result');
});
