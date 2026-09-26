import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { closeAll, hostRoom, joinAll, startGame, type HostHandle, type PlayerHandle } from '../helpers/players';

/**
 * Screenshot capture for human/agent review of every phase on the TV and a phone. Not an assertion
 * of pixels: run with CAPTURE=1. Output goes to tests/e2e/screenshots (gitignored).
 */
const OUT = 'tests/e2e/screenshots';

test.skip(!process.env.CAPTURE, 'Set CAPTURE=1 to capture review screenshots');

let host: HostHandle | null = null;
let players: PlayerHandle[] = [];
test.afterEach(async () => {
  await closeAll(host, players);
});

async function snap(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

test('capture every phase', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const size = process.env.CAPTURE_TV === '720' ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };
  const tag = `${size.width}`;
  host = await hostRoom(browser, { viewport: size });
  await snap(host.page, `${tag}-01-host-lobby-empty`);
  players = await joinAll(browser, host.code, ['Alexandra', 'Sam', 'Jo 🎉', 'Priya']);
  const phone = players[0]!.page;
  await snap(host.page, `${tag}-02-host-lobby-full`);
  await snap(phone, `${tag}-02-phone-lobby`);
  await startGame(host, 4);
  await snap(host.page, `${tag}-03-host-rules`);
  await snap(phone, `${tag}-03-phone-rules`);
  await expect(host.page.getByTestId('host-round-intro')).toBeVisible();
  await snap(host.page, `${tag}-04-host-intro`);
  await expect(host.page.getByTestId('host-writing')).toBeVisible();
  await expect(phone.getByTestId('composer')).toBeVisible();
  await snap(phone, `${tag}-05-phone-writing-empty`);
  const long =
    'Thrilled to share that after months of quiet dedication, I have successfully restored a mission-critical household resource at the point of need.\nGrateful for the journey.\nLeadership is a verb. #Impact #Growth';
  await phone.getByTestId('composer').fill(long);
  await snap(phone, `${tag}-05-phone-writing-typed`);
  // Everyone locks both posts quickly.
  await Promise.all(
    players.map(async (player, index) => {
      for (let tab = 0; tab < 2; tab += 1) {
        const composer = player.page.getByTestId('composer');
        await composer.fill(index === 0 && tab === 0 ? long : `${player.name} is humbled to announce milestone ${tab + 1}. Onward and upward!`);
        await player.page.getByTestId('lock-post').click();
        if (tab === 0) {
          await snap(player.page, `${tag}-06-phone-locked-${index}`);
          await player.page.getByRole('button', { name: 'Write your other post' }).click();
        }
      }
    }),
  );
  await snap(host.page, `${tag}-07-host-writing-progress`);
  await expect(host.page.getByTestId('host-duel-read')).toBeVisible();
  await snap(host.page, `${tag}-08-host-read`);
  await snap(phone, `${tag}-08-phone-read`);
  await expect(host.page.getByTestId('host-duel-guess')).toBeVisible();
  await snap(host.page, `${tag}-09-host-guess`);
  for (const player of players) {
    if (await player.page.getByTestId('lock-guess').isVisible()) {
      await snap(player.page, `${tag}-09-phone-guess`);
      break;
    }
  }
  await Promise.all(
    players.map(async (player) => {
      if (await player.page.getByTestId('lock-guess').isVisible()) {
        await player.page.getByRole('radiogroup', { name: 'What actually happened?' }).getByRole('radio').first().click();
        await player.page.getByTestId('lock-guess').click();
      }
    }),
  );
  await expect(host.page.getByTestId('host-duel-endorse')).toBeVisible();
  await snap(host.page, `${tag}-10-host-endorse`);
  for (const player of players) {
    if (await player.page.getByTestId('lock-endorsement').isVisible()) {
      await snap(player.page, `${tag}-10-phone-endorse`);
      break;
    }
  }
  await Promise.all(
    players.map(async (player) => {
      if (await player.page.getByTestId('lock-endorsement').isVisible()) {
        await player.page.getByRole('radio', { name: 'Endorse A' }).click();
        await player.page.getByTestId('lock-endorsement').click();
      }
    }),
  );
  await expect(host.page.getByTestId('host-duel-result')).toBeVisible();
  await snap(host.page, `${tag}-11-host-result`);
  await snap(phone, `${tag}-11-phone-result`);
  await host.page.getByTestId('host-menu').click();
  await snap(host.page, `${tag}-12-host-menu`);
  await host.page.getByTestId('menu-pause').click();
  await expect(host.page.getByTestId('pause-overlay')).toBeVisible();
  await snap(host.page, `${tag}-13-host-paused`);
  await snap(phone, `${tag}-13-phone-paused`);
  await host.page.getByTestId('resume').click();
});
