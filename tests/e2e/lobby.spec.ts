import { expect, test } from '@playwright/test';
import { closeAll, hostRoom, joinAll, joinPlayer, pageErrors, PHONE, playerBot, readyUp, startGame, type HostHandle, type PlayerHandle } from '../helpers/players';

let host: HostHandle | null = null;
let players: PlayerHandle[] = [];

test.afterEach(async () => {
  await closeAll(host, players);
  host = null;
  players = [];
  expect(pageErrors.splice(0)).toEqual([]);
});

test('8-player game: all seats shown, a ninth player is turned away, 16 posts per round', async ({ browser }) => {
  host = await hostRoom(browser, { quick: true });
  players = await joinAll(browser, host.code, ['Ana', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal']);
  await expect(host.page.getByTestId('roster-row')).toHaveCount(8);
  await expect(host.page.getByText('Open seat')).toHaveCount(0);

  // A ninth phone sees the room is full before trying, and cannot join.
  const ninth = await browser.newContext(PHONE);
  const ninthPage = await ninth.newPage();
  await ninthPage.goto(`/join/${host.code}`);
  await expect(ninthPage.getByText('This room is full. Games have up to eight players.')).toBeVisible();
  await expect(ninthPage.getByTestId('join-room')).toBeDisabled();
  await ninth.close();

  await startGame(host, 8);
  await expect(host.page.getByTestId('locked-total')).toHaveText('0 of 16 posts locked', { timeout: 30_000 });
  await expect(host.page.getByTestId('writer-tile')).toHaveCount(8);
  await Promise.all(players.map((player) => playerBot(player)));
  await expect(host.page.getByTestId('host-final')).toBeVisible();
  await expect(host.page.locator('ol[aria-label="Scoreboard"] li')).toHaveCount(8);
});

test('duplicate names are refused, and a late joiner is told the game started', async ({ browser }) => {
  host = await hostRoom(browser, { quick: true });
  players = await joinAll(browser, host.code, ['Alex', 'Sam', 'Jo']);
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await page.goto(`/join/${host.code}`);
  await page.getByTestId('name-input').fill('  ALEX ');
  await page.getByTestId('join-room').click();
  await expect(page.getByText("That name's taken in this room. Try another.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/join/${host.code}$`));

  await startGame(host, 3);
  await page.goto(`/join/${host.code}`);
  await expect(page.getByText('This game has already started. Join the next one.')).toBeVisible();
  await expect(page.getByTestId('join-room')).toBeDisabled();
  await context.close();
});

test('the host can remove a lobby player, and a player can leave', async ({ browser }) => {
  host = await hostRoom(browser);
  players = await joinAll(browser, host.code, ['Alex', 'Sam', 'Jo', 'Dee']);
  const [alex, , , dee] = players;
  await host.page.getByRole('button', { name: 'Remove Dee' }).click();
  await expect(host.page.getByRole('dialog', { name: 'Remove Dee from the room?' })).toBeVisible();
  await host.page.getByTestId('confirm-remove').click();
  await expect(dee!.page.getByText("You've been removed from this room.")).toBeVisible();
  await expect(host.page.getByTestId('roster-row')).toHaveCount(3);

  await alex!.page.getByRole('button', { name: 'Leave room' }).click();
  await alex!.page.getByRole('dialog', { name: 'Leave this room?' }).getByRole('button', { name: 'Leave' }).click();
  await expect(alex!.page).toHaveURL(/\/$/);
  await expect(host.page.getByTestId('roster-row')).toHaveCount(2);
  // Leaving clears the seat credential: coming back means joining again, not a silent rejoin.
  await alex!.page.goto(`/play/${host.code}`);
  await expect(alex!.page).toHaveURL(new RegExp(`/join/${host.code}$`));
});

test('direct URL reloads work on the production server, and unknown routes get the branded 404', async ({ browser }) => {
  host = await hostRoom(browser);
  players = [await joinPlayer(browser, host.code, 'Alex')];
  await host.page.reload();
  await expect(host.page.getByTestId('host-lobby')).toBeVisible();
  await expect(host.page.getByTestId('room-code')).toHaveText(host.code);

  const phone = players[0]!.page;
  await phone.reload();
  await expect(phone.getByText("You're in, Alex.")).toBeVisible();
  await expect(host.page.getByTestId('roster-row')).toHaveCount(1);
  await readyUp(players[0]!);

  // A browser without the host credential never gets host controls.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(`/host/${host.code}`);
  await expect(strangerPage.getByText("This browser doesn't host this room.")).toBeVisible();
  await expect(strangerPage.getByTestId('start-game')).toHaveCount(0);
  const missing = await strangerPage.goto('/definitely/not/here');
  expect(missing?.status()).toBe(404);
  await expect(strangerPage.getByText('This page is between opportunities.')).toBeVisible();
  await strangerPage.getByRole('link', { name: 'Back to Larpbox' }).click();
  await expect(strangerPage.getByText('Tiny achievement. Huge announcement.')).toBeVisible();
  await stranger.close();
});
