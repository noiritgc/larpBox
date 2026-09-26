import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { closeAll, findByRole, joinPlayer, pageErrors, readyUp, startGame, type HostHandle, type PlayerHandle } from '../helpers/players';

/**
 * Layout assertions during a real game at the spec's sizes: TV 1920x1080 and 1280x720, phones
 * 390x844 and 360x640, with reduced motion and larger text. Screenshots are saved for review under
 * test-results; pixel baselines are deliberately not used (room codes, timers and fonts vary).
 */

const LONG = 'Humbled and honored to announce that after a period of deep reflection, I have completed a full-cycle overhaul of a mission-critical household asset.\nIt was not easy. Nobody asked me to.\nLeadership means doing it anyway.\n#Grateful #Resilience #Growth #Impact';

let host: HostHandle | null = null;
let players: PlayerHandle[] = [];
test.afterEach(async () => {
  await closeAll(host, players);
  host = null;
  players = [];
  expect(pageErrors.splice(0)).toEqual([]);
});

async function assertLayout(page: Page, label: string, options: { host?: boolean } = {}) {
  await page.evaluate(async () => {
    for (let pass = 0; pass < 3; pass += 1) {
      const running = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.playState !== 'finished');
      if (running.length === 0) return;
      await Promise.all(running.map((a) => a.finished.catch(() => undefined)));
    }
  });
  const report = await page.evaluate((isHost) => {
    const overflowX = document.documentElement.scrollWidth - window.innerWidth;
    const smallPost = [...document.querySelectorAll('.post-body')].some((el) => parseFloat(getComputedStyle(el).fontSize) < (isHost ? 24 : 15));
    // Text inside a post card must never be clipped horizontally.
    const clipped = [...document.querySelectorAll('.post-body')].some((el) => el.scrollWidth > el.clientWidth + 1);
    return { overflowX, smallPost, clipped };
  }, options.host === true);
  expect(report, label).toEqual({ overflowX: expect.any(Number), smallPost: false, clipped: false });
  expect(report.overflowX, `${label} horizontal overflow`).toBeLessThanOrEqual(1);
  mkdirSync('test-results/visual', { recursive: true });
  await page.screenshot({ path: `test-results/visual/${label}.png` });
}

for (const size of [
  { tv: { width: 1920, height: 1080 }, phone: { width: 390, height: 844 }, tag: 'large' },
  { tv: { width: 1280, height: 720 }, phone: { width: 360, height: 640 }, tag: 'small' },
]) {
  test(`screens hold their layout at TV ${size.tv.width}x${size.tv.height} and phone ${size.phone.width}x${size.phone.height}`, async ({ browser }) => {
    const hostContext = await browser.newContext({ viewport: size.tv, reducedMotion: 'reduce' });
    const hostPage = await hostContext.newPage();
    hostPage.on('pageerror', (error) => pageErrors.push(`host: ${error.message}`));
    await hostPage.goto('/host/new');
    await hostPage.getByRole('radio', { name: 'Quick: 1 round' }).click();
    await hostPage.getByRole('radiogroup', { name: 'Writing time per round' }).getByRole('radio', { name: '180s' }).click();
    await hostPage.getByRole('radiogroup', { name: 'Fact-guess time' }).getByRole('radio', { name: '30s' }).click();
    await hostPage.getByRole('radiogroup', { name: 'Endorse time' }).getByRole('radio', { name: '30s' }).click();
    await hostPage.getByTestId('create-room').click();
    await expect(hostPage).toHaveURL(/\/host\/[A-Z]{4}$/);
    const code = (await hostPage.getByTestId('room-code').textContent())?.trim() ?? '';
    host = { context: hostContext, page: hostPage, code };

    // One phone uses the small viewport with 150% text; the others are ordinary.
    const names = ['Wolfgang-Amadeus', 'Sam', 'Jo 🎉'];
    for (const [index, name] of names.entries()) {
      const player = await joinPlayer(browser, code, name, index);
      if (index === 0) await player.page.setViewportSize(size.phone);
      players.push(player);
    }
    // Larger text: the UI sizes type in px, so scale the whole page like browser zoom does. (Inline
    // <style> injection is blocked by the production CSP; CSSOM changes are allowed.)
    await players[0]!.page.evaluate(() => {
      document.documentElement.style.setProperty('zoom', '1.5');
    });
    for (const player of players) await readyUp(player);
    await assertLayout(hostPage, `${size.tag}-host-lobby`, { host: true });
    await assertLayout(players[0]!.page, `${size.tag}-phone-lobby`);
    await startGame(host, 3);

    await expect(players[0]!.page.getByTestId('composer')).toBeVisible({ timeout: 30_000 });
    await players[0]!.page.getByTestId('composer').fill(LONG);
    await assertLayout(players[0]!.page, `${size.tag}-phone-writing`);
    await assertLayout(hostPage, `${size.tag}-host-writing`, { host: true });
    await Promise.all(
      players.map(async (player) => {
        for (let tab = 1; tab <= 2; tab += 1) {
          await player.page.getByTestId('composer').fill(tab === 1 ? LONG : `${player.name} is humbled to announce another milestone today.`);
          await player.page.getByTestId('lock-post').click();
          if (tab === 1) await player.page.getByRole('button', { name: 'Write your other post' }).click();
        }
      }),
    );
    await expect(hostPage.getByTestId('host-duel-read')).toBeVisible({ timeout: 30_000 });
    await assertLayout(hostPage, `${size.tag}-host-read`, { host: true });
    await expect(hostPage.getByTestId('host-duel-guess')).toBeVisible({ timeout: 30_000 });
    await assertLayout(hostPage, `${size.tag}-host-guess`, { host: true });
    const reader = await findByRole(players, 'reader', 'guess');
    await assertLayout(reader.page, `${size.tag}-phone-guess`);
    await reader.page.getByRole('radiogroup', { name: 'What actually happened?' }).getByRole('radio').first().click();
    await reader.page.getByTestId('lock-guess').click();
    await expect(hostPage.getByTestId('host-duel-endorse')).toBeVisible({ timeout: 30_000 });
    await assertLayout(hostPage, `${size.tag}-host-endorse`, { host: true });
    await assertLayout(reader.page, `${size.tag}-phone-endorse`);
    await reader.page.getByRole('radio', { name: 'Endorse A' }).click();
    await reader.page.getByTestId('lock-endorsement').click();
    await expect(hostPage.getByTestId('host-duel-result')).toBeVisible({ timeout: 30_000 });
    await assertLayout(hostPage, `${size.tag}-host-result`, { host: true });
    await assertLayout(players[0]!.page, `${size.tag}-phone-result`);
  });
}
