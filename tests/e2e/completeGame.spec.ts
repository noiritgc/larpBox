import { expect, test, type Page } from '@playwright/test';
import { closeAll, hostRoom, joinAll, pageErrors, playerBot, startGame, type HostHandle, type PlayerHandle } from '../helpers/players';

let host: HostHandle | null = null;
let players: PlayerHandle[] = [];

test.afterEach(async () => {
  await closeAll(host, players);
  host = null;
  players = [];
  expect(pageErrors.splice(0)).toEqual([]);
});

async function finalTotals(page: Page): Promise<number> {
  const text = (await page.getByTestId('final-total').textContent()) ?? '';
  return Number(text.replace(/[^\d]/g, ''));
}

test('3-player Standard game: setup, readiness, both rounds, final and rematch', async ({ browser }) => {
  host = await hostRoom(browser);
  players = await joinAll(browser, host.code, ['Alex', 'Sam', 'Jo']);
  await startGame(host, 3);

  await Promise.all(players.map((player, index) => playerBot(player, { endorse: index === 0 ? 'A' : 'B' })));
  await expect(host.page.getByTestId('host-final')).toBeVisible();

  // Every phone's final total matches its row on the big screen, and the ranks are consistent.
  const hostRows = host.page.locator('ol[aria-label="Scoreboard"] li');
  await expect(hostRows).toHaveCount(3);
  for (const player of players) {
    const total = await finalTotals(player.page);
    const row = hostRows.filter({ hasText: player.name });
    await expect(row).toContainText(total.toLocaleString('en-US'));
  }

  // Rematch returns everyone to the lobby with scores reset.
  await host.page.getByTestId('play-again').click();
  await host.page.getByTestId('confirm-rematch').click();
  await expect(host.page.getByTestId('host-lobby')).toBeVisible();
  for (const player of players) {
    await expect(player.page.getByTestId('ready-button')).toHaveText("I'm ready");
  }
});

test('5-player Quick game: odd player count, ten posts, five post-offs, nobody omitted', async ({ browser }) => {
  host = await hostRoom(browser, { quick: true });
  players = await joinAll(browser, host.code, ['Ana', 'Ben', 'Cy', 'Dee', 'Eli']);
  await startGame(host, 5);
  const hostPage = host.page;
  const seenDuels = new Set<string>();
  const watcher = (async () => {
    for (;;) {
      if (await hostPage.getByTestId('host-final').isVisible().catch(() => false)) return;
      const context = await hostPage.locator('.host-topbar-center').textContent().catch(() => null);
      const match = context?.match(/Post-off\s*(\d+)\s*of\s*(\d+)/);
      if (match) seenDuels.add(`${match[1]}/${match[2]}`);
      await hostPage.waitForTimeout(100);
    }
  })();
  await Promise.all(players.map((player) => playerBot(player)));
  await watcher;
  await expect(host.page.getByTestId('host-final')).toBeVisible();
  expect([...seenDuels].sort()).toEqual(['1/5', '2/5', '3/5', '4/5', '5/5']);
  await expect(host.page.locator('ol[aria-label="Scoreboard"] li')).toHaveCount(5);
  for (const player of players) await expect(player.page.getByTestId('final-total')).toBeVisible();
});
