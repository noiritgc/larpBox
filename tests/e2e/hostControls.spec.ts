import { expect, test } from '@playwright/test';
import { closeAll, hostRoom, joinAll, pageErrors, startGame, type HostHandle, type PlayerHandle } from '../helpers/players';

let host: HostHandle | null = null;
let players: PlayerHandle[] = [];

test.afterEach(async () => {
  await closeAll(host, players);
  host = null;
  players = [];
  expect(pageErrors.splice(0)).toEqual([]);
});

test('changing settings in the lobby clears readiness and tells everyone', async ({ browser }) => {
  host = await hostRoom(browser);
  players = await joinAll(browser, host.code, ['Alex', 'Sam', 'Jo']);
  await host.page.getByRole('button', { name: 'Settings' }).click();
  const dialog = host.page.getByRole('dialog', { name: 'Room settings' });
  await dialog.getByRole('radiogroup', { name: 'Writing time per post' }).getByRole('radio', { name: '90s' }).click();
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await expect(host.page.getByText('Settings changed. Everyone needs to ready up again.')).toBeVisible();
  await expect(host.page.getByTestId('start-game')).toBeDisabled();
  for (const player of players) {
    await expect(player.page.getByText('Settings changed. Ready up again.')).toBeVisible();
    await expect(player.page.getByTestId('ready-button')).toHaveText("I'm ready");
  }
});

test('pause freezes every phone, add 30 seconds works once, and ending the room reaches everyone', async ({ browser }) => {
  host = await hostRoom(browser, { quick: true, secondsPerPost: 90 });
  players = await joinAll(browser, host.code, ['Alex', 'Sam', 'Jo']);
  await startGame(host, 3);
  await expect(host.page.getByTestId('host-writing')).toBeVisible({ timeout: 30_000 });
  const phone = players[0]!.page;

  await host.page.getByTestId('host-menu').click();
  await host.page.getByTestId('menu-pause').click();
  await expect(host.page.getByTestId('pause-overlay')).toBeVisible();
  await expect(phone.getByText('Host paused the game. Your time is safe.')).toBeVisible();
  await expect(phone.getByTestId('lock-post')).toBeDisabled();
  const frozen = await phone.getByRole('timer').getAttribute('aria-label');
  await phone.waitForTimeout(2_500);
  expect(await phone.getByRole('timer').getAttribute('aria-label')).toBe(frozen);
  await host.page.getByTestId('resume').click();
  await expect(phone.getByText('Host paused the game. Your time is safe.')).toHaveCount(0);

  const hostPage = host.page;
  const secondsBefore = Number((await hostPage.getByRole('timer').getAttribute('aria-label'))?.match(/\d+/)?.[0]);
  await hostPage.getByTestId('host-menu').click();
  await hostPage.getByRole('menuitem', { name: 'Add 30 seconds' }).click();
  await expect
    .poll(async () => Number((await hostPage.getByRole('timer').getAttribute('aria-label'))?.match(/\d+/)?.[0]))
    .toBeGreaterThan(secondsBefore + 3);
  await host.page.getByTestId('host-menu').click();
  await expect(host.page.getByRole('menuitem', { name: 'Added 30 seconds' })).toBeDisabled();
  await host.page.keyboard.press('Escape');

  await host.page.getByTestId('host-menu').click();
  await host.page.getByTestId('menu-end').click();
  await expect(host.page.getByRole('dialog', { name: 'End this room?' })).toBeVisible();
  await host.page.getByTestId('confirm-end-room').click();
  for (const page of [host.page, ...players.map((p) => p.page)]) {
    await expect(page.getByTestId('room-ended')).toBeVisible();
    await expect(page.getByText('This room has ended.')).toBeVisible();
  }
});
