import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/** Phone-sized context. Each player gets its own context, so storage is never shared. */
export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
export const TV = { viewport: { width: 1920, height: 1080 } };

export interface PlayerHandle {
  name: string;
  context: BrowserContext;
  page: Page;
}

export interface HostHandle {
  context: BrowserContext;
  page: Page;
  code: string;
}

/** Uncaught page errors from every page created through these helpers. */
export const pageErrors: string[] = [];

export function watchErrors(page: Page, label: string): void {
  page.on('pageerror', (error) => pageErrors.push(`${label}: ${error.message}`));
}

export interface HostOptions {
  quick?: boolean;
  pack?: 'Mixed' | 'Everyday' | 'Campus & Work';
  writingSeconds?: 90 | 120 | 180;
  guessSeconds?: 20 | 30;
  endorseSeconds?: 20 | 30;
  viewport?: { width: number; height: number };
}

export async function hostRoom(browser: Browser, options: HostOptions = {}): Promise<HostHandle> {
  const context = await browser.newContext({ viewport: options.viewport ?? TV.viewport });
  const page = await context.newPage();
  watchErrors(page, 'host');
  await page.goto('/');
  await page.getByTestId('host-a-game').click();
  await expect(page).toHaveURL(/\/host\/new$/);
  if (options.quick) await page.getByRole('radio', { name: 'Quick: 1 round' }).click();
  if (options.pack) await page.getByRole('radio', { name: options.pack }).click();
  if (options.writingSeconds) {
    await page.getByRole('radiogroup', { name: 'Writing time per round' }).getByRole('radio', { name: `${options.writingSeconds}s` }).click();
  }
  if (options.guessSeconds) {
    await page.getByRole('radiogroup', { name: 'Fact-guess time' }).getByRole('radio', { name: `${options.guessSeconds}s` }).click();
  }
  if (options.endorseSeconds) {
    await page.getByRole('radiogroup', { name: 'Endorse time' }).getByRole('radio', { name: `${options.endorseSeconds}s` }).click();
  }
  await page.getByTestId('create-room').click();
  await expect(page).toHaveURL(/\/host\/[A-Z]{4}$/);
  const code = (await page.getByTestId('room-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z]{4}$/);
  return { context, page, code };
}

export async function joinPlayer(browser: Browser, code: string, name: string, avatarIndex = 0): Promise<PlayerHandle> {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  watchErrors(page, name);
  await page.goto(`/join/${code}`);
  await page.getByTestId('name-input').fill(name);
  const avatars = ['briefcase', 'coffee', 'ladder', 'trophy', 'necktie', 'spreadsheet', 'plant', 'stamp'];
  await page.getByTestId(`avatar-${avatars[avatarIndex % 8]}`).click();
  await page.getByTestId('join-room').click();
  await expect(page).toHaveURL(new RegExp(`/play/${code}$`));
  await expect(page.getByTestId('ready-button')).toBeVisible();
  return { name, context, page };
}

export async function readyUp(player: PlayerHandle): Promise<void> {
  const button = player.page.getByTestId('ready-button');
  await expect(button).toHaveText("I'm ready");
  await button.click();
  await expect(button).toHaveText('Ready — tap to undo');
}

export async function joinAll(browser: Browser, code: string, names: string[]): Promise<PlayerHandle[]> {
  const players: PlayerHandle[] = [];
  for (const [index, name] of names.entries()) players.push(await joinPlayer(browser, code, name, index));
  for (const player of players) await readyUp(player);
  return players;
}

export async function startGame(host: HostHandle, playerCount: number): Promise<void> {
  await expect(host.page.getByTestId('start-reason')).toHaveText(`${playerCount} of ${playerCount} ready`);
  await host.page.getByTestId('start-game').click();
  await expect(host.page.getByTestId('host-rules')).toBeVisible();
}

export interface BotPlan {
  /** Text per post; null leaves the post empty (forfeit); a function can vary by round/tab. */
  post?: (round: number, tab: number) => string | null;
  guess?: 'first' | 'skip';
  endorse?: 'A' | 'B' | 'NEITHER' | 'skip';
}

async function tryClick(page: Page, testId: string): Promise<boolean> {
  const locator = page.getByTestId(testId);
  try {
    if (await locator.isVisible()) {
      if (await locator.isEnabled()) {
        await locator.click({ timeout: 2_000 });
        return true;
      }
    }
  } catch {
    // The phase moved on while we were acting.
  }
  return false;
}

/**
 * Plays one phone until the final screen: writes and locks posts, guesses and endorses, acting
 * only through the visible UI. Runs concurrently with the other players' bots.
 */
export async function playerBot(player: PlayerHandle, plan: BotPlan = {}, maxMs = 4 * 60_000): Promise<void> {
  const { page } = player;
  const started = Date.now();
  const written = new Set<string>();
  while (Date.now() - started < maxMs) {
    try {
      if (await page.getByTestId('final').isVisible()) return;
      const composer = page.getByTestId('composer');
      if (await composer.isVisible()) {
        const truth = (await page.getByTestId('assignment-truth').textContent()) ?? '';
        const round = Number((await page.locator('.phone-sticky-bar h1').textContent())?.replace(/\D/g, '') || '1');
        const tab = (await page.getByTestId('post-tab-2').getAttribute('aria-selected')) === 'true' ? 2 : 1;
        const key = `${round}:${truth}`;
        const text = plan.post ? plan.post(round, tab) : `${player.name} is humbled to announce milestone ${round}.${tab}. Grateful!`;
        if (text === null) {
          written.add(key);
          // Leave this one empty; move to the other tab if it still needs work.
          const other = page.getByTestId(tab === 1 ? 'post-tab-2' : 'post-tab-1');
          if (await other.isVisible()) await other.click({ timeout: 1_000 }).catch(() => {});
          await page.waitForTimeout(300);
          continue;
        }
        if (!written.has(key)) {
          await composer.fill(text, { timeout: 2_000 });
          written.add(key);
        }
        await tryClick(page, 'lock-post');
        await page.waitForTimeout(100);
        continue;
      }
      const writeOther = page.getByRole('button', { name: 'Write your other post' });
      if (await writeOther.isVisible()) {
        await writeOther.click({ timeout: 1_000 }).catch(() => {});
        continue;
      }
      if (plan.guess !== 'skip' && (await page.getByTestId('lock-guess').isVisible())) {
        const options = page.getByRole('radiogroup', { name: 'What actually happened?' }).getByRole('radio');
        await options.first().click({ timeout: 1_000 });
        await tryClick(page, 'lock-guess');
        continue;
      }
      if (plan.endorse !== 'skip' && (await page.getByTestId('lock-endorsement').isVisible())) {
        const preferred = plan.endorse ?? 'A';
        const label = preferred === 'NEITHER' ? 'Endorse neither' : `Endorse ${preferred}`;
        const choice = page.getByRole('radio', { name: label });
        if (await choice.isEnabled()) await choice.click({ timeout: 1_000 });
        else await page.getByRole('radio', { name: 'Endorse neither' }).click({ timeout: 1_000 });
        await tryClick(page, 'lock-endorsement');
        continue;
      }
    } catch {
      // Snapshot replaced the screen mid-action; look again.
    }
    await page.waitForTimeout(120);
  }
  throw new Error(`${player.name} did not reach the final screen`);
}

export async function closeAll(host: HostHandle | null, players: PlayerHandle[]): Promise<void> {
  await host?.context.close();
  await Promise.all(players.map((player) => player.context.close()));
}

/** The phone showing a given duel role right now (reader or writer), by what its screen says. */
export async function findByRole(players: PlayerHandle[], role: 'reader' | 'writer', phase: 'guess' | 'endorse'): Promise<PlayerHandle> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    for (const player of players) {
      const readerMarker = phase === 'guess' ? 'lock-guess' : 'lock-endorsement';
      const isReader = await player.page.getByTestId(readerMarker).isVisible().catch(() => false);
      if (role === 'reader' && isReader) return player;
      if (role === 'writer' && !isReader) {
        const writerText = phase === 'guess' ? 'You already know.' : 'The truth is out.';
        if (await player.page.getByText(writerText).isVisible().catch(() => false)) return player;
      }
    }
    await players[0]?.page.waitForTimeout(100);
  }
  throw new Error(`no ${role} found`);
}

/** Locks both posts on every phone as fast as possible. */
export async function writeAll(players: PlayerHandle[], text = (player: PlayerHandle, tab: number) => `${player.name} is humbled to announce milestone ${tab}. Grateful!`): Promise<void> {
  await Promise.all(
    players.map(async (player) => {
      for (let tab = 1; tab <= 2; tab += 1) {
        await expect(player.page.getByTestId('composer')).toBeVisible();
        await player.page.getByTestId('composer').fill(text(player, tab));
        await player.page.getByTestId('lock-post').click();
        if (tab === 1) await player.page.getByRole('button', { name: 'Write your other post' }).click();
      }
      // Either this phone waits for the others, or the last lock already ended writing.
      await expect(player.page.getByTestId('composer')).toHaveCount(0);
    }),
  );
}
