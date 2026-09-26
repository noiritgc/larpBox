import { expect, test } from '@playwright/test';
import {
  closeAll,
  findByRole,
  hostRoom,
  joinAll,
  pageErrors,
  startGame,
  writeAll,
  type HostHandle,
  type PlayerHandle,
} from '../helpers/players';

let host: HostHandle | null = null;
let players: PlayerHandle[] = [];

test.afterEach(async () => {
  await closeAll(host, players);
  host = null;
  players = [];
  expect(pageErrors.splice(0)).toEqual([]);
});

async function toWriting(options: Parameters<typeof hostRoom>[1], browser: import('@playwright/test').Browser, names = ['Alex', 'Sam', 'Jo']) {
  host = await hostRoom(browser, options);
  players = await joinAll(browser, host.code, names);
  await startGame(host, names.length);
  await expect(host.page.getByTestId('host-writing')).toBeVisible({ timeout: 30_000 });
  for (const player of players) await expect(player.page.getByTestId('composer')).toBeVisible();
}

test('a phone reload while drafting restores the text, and a locked post survives reload', async ({ browser }) => {
  await toWriting({ quick: true, writingSeconds: 180 }, browser);
  const writer = players[0]!;
  const page = writer.page;
  const draft = 'Humbled to announce a draft that survives a refresh. #Resilience';
  await page.getByTestId('composer').fill(draft);
  // Reload immediately: the text only exists in this phone's storage.
  await page.reload();
  await expect(page.getByTestId('composer')).toHaveValue(draft);
  await expect(page.getByText('We restored your draft from this phone.')).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  await page.getByTestId('lock-post').click();
  await expect(page.getByTestId('locked-post')).toHaveText(draft);
  await page.reload();
  await expect(page.getByTestId('post-tab-1')).toContainText('locked');
  await page.getByTestId('post-tab-1').click();
  await expect(page.getByTestId('locked-post')).toHaveText(draft);
  // The host counts it exactly once.
  await expect(host!.page.getByTestId('locked-total')).toHaveText(/^1 of 6 posts locked$/);
});

test('an unlocked valid draft is auto-submitted at the deadline; an empty one forfeits', async ({ browser }) => {
  await toWriting({ quick: true, writingSeconds: 90 }, browser);
  const lazy = players[0]!;
  const draft = 'A saved draft that I never locked, submitted on time anyway.';
  await lazy.page.getByTestId('composer').fill(draft);
  await expect(lazy.page.getByTestId('save-status')).toHaveText('Saved');
  // Everyone else locks both posts; the lazy writer's second post stays empty.
  await writeAll(players.slice(1));
  let sawAutoSubmitLabel = false;
  let sawAbsenceCard = false;
  let sawDraftOnHost = false;
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    if (await host!.page.getByTestId('host-final').isVisible()) break;
    if (await lazy.page.getByText('Your saved draft was submitted.').first().isVisible()) sawAutoSubmitLabel = true;
    if (await host!.page.getByText('This professional had nothing to announce.').first().isVisible()) sawAbsenceCard = true;
    if (await host!.page.getByText(draft).first().isVisible()) sawDraftOnHost = true;
    // Readers endorse whatever is available so the game keeps moving.
    for (const player of players) {
      const guess = player.page.getByTestId('lock-guess');
      if (await guess.isVisible()) {
        await player.page.getByRole('radiogroup', { name: 'What actually happened?' }).getByRole('radio').first().click().catch(() => {});
        await guess.click().catch(() => {});
      }
    }
    await host!.page.waitForTimeout(150);
  }
  expect(sawAutoSubmitLabel).toBe(true);
  expect(sawAbsenceCard).toBe(true);
  expect(sawDraftOnHost).toBe(true);
});

test('a reader who drops and returns before the deadline can still vote; after it they cannot', async ({ browser }) => {
  await toWriting({ quick: true, writingSeconds: 180, guessSeconds: 30, endorseSeconds: 30 }, browser, ['Alex', 'Sam', 'Jo', 'Dee']);
  await writeAll(players);
  await expect(host!.page.getByTestId('host-duel-guess')).toBeVisible({ timeout: 30_000 });
  const reader = await findByRole(players, 'reader', 'guess');
  // Drop the connection (not a reload), then come back before the guess deadline.
  await reader.context.setOffline(true);
  await expect(reader.page.getByText('Reconnecting… Keep this page open.')).toBeVisible({ timeout: 20_000 });
  await reader.context.setOffline(false);
  await expect(reader.page.getByTestId('network-status')).toHaveText('Connected', { timeout: 20_000 });
  await reader.page.getByRole('radiogroup', { name: 'What actually happened?' }).getByRole('radio').first().click();
  await reader.page.getByTestId('lock-guess').click();
  await expect(reader.page.getByTestId('guess-locked')).toBeVisible();

  // In ENDORSE the same reader drops again and misses the deadline entirely.
  await expect(host!.page.getByTestId('host-duel-endorse')).toBeVisible({ timeout: 30_000 });
  await reader.context.setOffline(true);
  await expect(host!.page.getByTestId('host-duel-result')).toBeVisible({ timeout: 30_000 });
  await reader.context.setOffline(false);
  await expect(reader.page.getByTestId('duel-result')).toBeVisible({ timeout: 20_000 });
  await expect(reader.page.getByTestId('lock-endorsement')).toHaveCount(0);
});

test('host going offline freezes every timer; it returns paused and Resume continues', async ({ browser }) => {
  await toWriting({ quick: true, writingSeconds: 90 }, browser);
  const phone = players[0]!.page;
  await host!.page.close();
  await expect(phone.getByText('The big screen disconnected. Waiting for the host.')).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByRole('timer')).toHaveAccessibleName('Timer paused');
  // Well past the scaled 18-second writing time: still writing, nothing auto-submitted.
  await phone.waitForTimeout(20_000);
  await expect(phone.getByTestId('composer')).toBeVisible();

  const hostPage = await host!.context.newPage();
  host = { ...host!, page: hostPage };
  await hostPage.goto(`/host/${host.code}`);
  await expect(hostPage.getByTestId('pause-overlay')).toBeVisible();
  await expect(phone.getByText('Host paused the game. Your time is safe.')).toBeVisible();
  await hostPage.getByTestId('resume').click();
  await expect(hostPage.getByTestId('pause-overlay')).toHaveCount(0);
  await expect(phone.getByText('Host paused the game. Your time is safe.')).toHaveCount(0);
  await expect(phone.getByRole('timer')).not.toHaveAccessibleName('Timer paused');
});

test('opening the same seat in a second tab requires an explicit takeover', async ({ browser }) => {
  await toWriting({ quick: true, writingSeconds: 180 }, browser);
  const original = players[0]!;
  const second = await original.context.newPage();
  await second.goto(`/play/${host!.code}`);
  await expect(second.getByTestId('session-conflict')).toBeVisible();
  await second.getByTestId('use-this-tab').click();
  await expect(second.getByTestId('composer')).toBeVisible();
  await expect(original.page.getByTestId('session-conflict')).toBeVisible();
  // The replaced tab does not fight back on its own.
  await original.page.waitForTimeout(3_000);
  await expect(second.getByTestId('session-conflict')).toHaveCount(0);
  await expect(second.getByTestId('network-status')).toHaveText('Connected');
});
