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

test('one post each (the default): the odd player out judges, and unlocked picks count when time runs out', async ({ browser }) => {
  host = await hostRoom(browser, { quick: true, postsPerPlayer: 1 });
  players = await joinAll(browser, host.code, ['Alex', 'Sam', 'Jo']);
  await startGame(host, 3);
  await expect(host.page.getByTestId('host-writing')).toBeVisible({ timeout: 30_000 });
  await expect(host.page.getByText('One post each.')).toBeVisible();
  await expect(host.page.getByText('Judging this round')).toBeVisible();

  // Exactly one phone sits out; the two writers get a single composer and no tabs.
  for (const player of players) {
    await expect(player.page.getByTestId('composer').or(player.page.getByTestId('sitting-out'))).toBeVisible();
  }
  const judging = [];
  for (const player of players) if (await player.page.getByTestId('sitting-out').isVisible()) judging.push(player);
  expect(judging).toHaveLength(1);
  const judge = judging[0]!;
  const writers = players.filter((player) => player !== judge);
  for (const writer of writers) {
    await expect(writer.page.getByTestId('post-tab-1')).toHaveCount(0);
    await writer.page.getByTestId('composer').fill(`${writer.name} is humbled to announce a single, focused milestone.`);
    await writer.page.getByTestId('lock-post').click();
  }

  // The judge is the only reader. Pick a guess but never lock it.
  await expect(judge.page.getByTestId('lock-guess')).toBeVisible({ timeout: 30_000 });
  await judge.page.getByRole('radiogroup', { name: 'What actually happened?' }).getByRole('radio').nth(1).click();
  await expect(judge.page.getByTestId('pick-hint')).toHaveText('Lock it in, or your pick counts when time runs out.');

  // Time runs out: the pick counted as a guess.
  await expect(judge.page.getByTestId('lock-endorsement')).toBeVisible({ timeout: 30_000 });
  await expect(judge.page.getByTestId('guess-verdict')).toBeVisible();
  await expect(judge.page.getByText("You didn't lock a guess for this one.")).toHaveCount(0);

  // No endorsement pick at all: it counts as Neither.
  await expect(judge.page.getByTestId('pick-hint')).toHaveText('If time runs out with nothing picked, it counts as Neither.');
  await expect(host.page.getByText('1 reader chose neither')).toBeVisible({ timeout: 30_000 });
  await expect(host.page.getByTestId('result-A')).toContainText('+0 Clout');
});
