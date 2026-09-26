import { expect, test } from '@playwright/test';
import { closeAll, hostRoom, joinAll, pageErrors, playerBot, startGame, type HostHandle, type PlayerHandle } from '../helpers/players';

let host: HostHandle | null = null;
let players: PlayerHandle[] = [];

test.afterEach(async () => {
  await closeAll(host, players);
  host = null;
  players = [];
  expect(pageErrors.splice(0)).toEqual([]);
});

test('nobody writes: every position stays unfilled and the game ends in an all-zero joint win', async ({ browser }) => {
  host = await hostRoom(browser, { quick: true });
  players = await joinAll(browser, host.code, ['Alex', 'Sam', 'Jo']);
  await startGame(host, 3);
  await expect(host.page.getByText('Both positions remain unfilled.')).toBeVisible({ timeout: 60_000 });
  await expect(players[0]!.page.getByText('Both positions remain unfilled.')).toBeVisible();
  await expect(host.page.getByTestId('host-final')).toBeVisible({ timeout: 60_000 });
  await expect(host.page.getByText('Co-CEOs of Doing Nothing')).toBeVisible();
  await expect(host.page.getByText('A room full of professionals. No endorsements.')).toBeVisible();
  for (const player of players) await expect(player.page.getByTestId('final-total')).toHaveText('0');
});

test('no votes at all: writers earn nothing and the result says so', async ({ browser }) => {
  host = await hostRoom(browser, { quick: true });
  players = await joinAll(browser, host.code, ['Alex', 'Sam', 'Jo']);
  await startGame(host, 3);
  const bots = Promise.all(players.map((player) => playerBot(player, { guess: 'skip', endorse: 'skip' })));
  await expect(host.page.getByText('No endorsements. Tough room.')).toBeVisible({ timeout: 90_000 });
  await bots;
  await expect(host.page.getByText('A room full of professionals. No endorsements.')).toBeVisible();
});

test('all Neither: writers get nothing, correct guessers are still paid', async ({ browser }) => {
  host = await hostRoom(browser, { quick: true });
  players = await joinAll(browser, host.code, ['Alex', 'Sam', 'Jo', 'Dee']);
  await startGame(host, 4);
  const bots = Promise.all(players.map((player) => playerBot(player, { endorse: 'NEITHER' })));
  await expect(host.page.getByTestId('result-A')).toContainText('+0 Clout', { timeout: 90_000 });
  await expect(host.page.getByTestId('result-B')).toContainText('+0 Clout');
  await expect(host.page.getByText(/2 readers chose neither/)).toBeVisible();
  await bots;
  // Final totals can only come from correct guesses: multiples of 250.
  for (const player of players) {
    const total = Number((await player.page.getByTestId('final-total').textContent())?.replace(/\D/g, '') ?? 'NaN');
    expect(total % 250).toBe(0);
  }
});
