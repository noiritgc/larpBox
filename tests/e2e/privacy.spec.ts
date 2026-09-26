import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { closeAll, hostRoom, joinAll, pageErrors, playerBot, startGame, type HostHandle, type PlayerHandle } from '../helpers/players';

/**
 * Secrecy is checked on what browsers actually receive (Socket.IO frames and long-polling
 * responses), not on what the DOM happens to show.
 */

interface Snapshot {
  role: 'host' | 'player';
  selfId?: string;
  phase: { name: string };
  players: { id: string }[];
  screen: Record<string, unknown> & { kind: string };
  raw: string;
}

function packetsOf(payload: string): string[] {
  // Engine.IO long-polling batches packets with a record separator.
  return payload.split('\u001e');
}

function recordSnapshots(page: Page, into: Snapshot[]): void {
  const take = (packet: string) => {
    if (!packet.startsWith('42')) return;
    try {
      const [event, data] = JSON.parse(packet.slice(2)) as [string, Omit<Snapshot, 'raw'>];
      if (event === 'room:state') into.push({ ...data, raw: JSON.stringify(data) });
    } catch {
      // Not an event packet.
    }
  };
  page.on('websocket', (ws) => ws.on('framereceived', (frame) => typeof frame.payload === 'string' && take(frame.payload)));
  page.on('response', async (response) => {
    if (!response.url().includes('/socket.io/') || response.request().method() !== 'GET') return;
    try {
      for (const packet of packetsOf(await response.text())) take(packet);
    } catch {
      // Response body unavailable (navigation); frames arrive again on the next connection.
    }
  });
}

let host: HostHandle | null = null;
let players: PlayerHandle[] = [];

test.afterEach(async () => {
  await closeAll(host, players);
  host = null;
  players = [];
  expect(pageErrors.splice(0)).toEqual([]);
});

test('network snapshots follow the secrecy timeline for the host and every phone', async ({ browser }) => {
  host = await hostRoom(browser, { quick: true });
  const hostSnapshots: Snapshot[] = [];
  recordSnapshots(host.page, hostSnapshots);
  await host.page.reload();
  await expect(host.page.getByTestId('host-lobby')).toBeVisible();
  players = await joinAll(browser, host.code, ['Alex', 'Sam', 'Jo', 'Dee']);
  const phoneSnapshots = new Map<PlayerHandle, Snapshot[]>();
  for (const player of players) {
    const list: Snapshot[] = [];
    recordSnapshots(player.page, list);
    phoneSnapshots.set(player, list);
    await player.page.reload();
    await expect(player.page.getByTestId('ready-button')).toBeVisible();
  }
  await startGame(host, 4);
  await Promise.all(players.map((player) => playerBot(player)));
  await expect(host.page.getByTestId('host-final')).toBeVisible();

  // Credentials never travel in snapshots.
  const tokens: string[] = [];
  for (const page of [host.page, ...players.map((p) => p.page)]) {
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /larpbox:(host|player):/.test(k)).map((k) => localStorage.getItem(k) ?? ''));
    for (const entry of stored) tokens.push((JSON.parse(entry) as { token: string }).token);
  }
  expect(tokens.length).toBe(5);

  // Truths each writer legitimately saw during writing.
  const writingTruths = new Map<PlayerHandle, Set<string>>();
  for (const [player, list] of phoneSnapshots) {
    const truths = new Set<string>();
    for (const snapshot of list) {
      if (snapshot.screen.kind !== 'WRITING') continue;
      const assignments = snapshot.screen.assignments as { truth: string }[];
      expect(assignments).toHaveLength(2);
      for (const assignment of assignments) truths.add(assignment.truth);
    }
    writingTruths.set(player, truths);
  }
  const allTruths = new Set([...writingTruths.values()].flatMap((set) => [...set]));
  expect(allTruths.size).toBe(4);

  const everySnapshot = [...hostSnapshots, ...[...phoneSnapshots.values()].flat()];
  expect(hostSnapshots.length).toBeGreaterThan(10);
  for (const snapshot of everySnapshot) {
    for (const token of tokens) expect(snapshot.raw).not.toContain(token);
    for (const secretKey of ['"tokenHash"', '"seed"', '"distractors"', '"writerBySide"', '"guesses"', '"endorsements"', '"promptId"']) {
      expect(snapshot.raw).not.toContain(secretKey);
    }
    const screenJson = JSON.stringify(snapshot.screen);
    const kind = snapshot.screen.kind;
    if (kind === 'WRITING' && snapshot.role === 'host') {
      for (const truth of allTruths) expect(snapshot.raw).not.toContain(truth);
    }
    if (kind === 'DUEL_READ' || kind === 'DUEL_GUESS' || kind === 'DUEL_ENDORSE') {
      // Author identities stay hidden until RESULT.
      for (const player of snapshot.players) expect(screenJson).not.toContain(player.id);
    }
    if (kind === 'DUEL_READ') {
      expect(snapshot.screen).not.toHaveProperty('options');
      expect(snapshot.screen).not.toHaveProperty('truth');
    }
    if (kind === 'DUEL_GUESS') {
      expect(snapshot.screen).not.toHaveProperty('truth');
      expect(snapshot.screen).not.toHaveProperty('correctOptionId');
      expect(screenJson).not.toContain('"votes"');
    }
    if (kind === 'DUEL_ENDORSE') {
      expect(snapshot.screen).toHaveProperty('truth');
      expect(screenJson).not.toContain('"votes"');
    }
  }
  // Phones only ever received their own writing truths.
  for (const [player, list] of phoneSnapshots) {
    const own = writingTruths.get(player) ?? new Set();
    for (const snapshot of list.filter((s) => s.screen.kind === 'WRITING')) {
      for (const truth of allTruths) {
        if (!own.has(truth)) expect(snapshot.raw).not.toContain(truth);
      }
    }
  }
});

test('the shipped web bundle contains no prompt pack and no dev gallery', async () => {
  const root = path.resolve('apps/web/dist/assets');
  const bundle = readdirSync(root)
    .filter((file) => file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.html'))
    .map((file) => readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
  const html = readFileSync(path.resolve('apps/web/dist/index.html'), 'utf8');
  const pack = JSON.parse(readFileSync(path.resolve('apps/server/src/content/larpbox-prompts.json'), 'utf8')) as {
    prompts: { id: string; truth: string; distractors: string[] }[];
  };
  expect(bundle.length).toBeGreaterThan(10_000);
  for (const prompt of pack.prompts) {
    expect(bundle, prompt.id).not.toContain(prompt.truth);
    expect(bundle, prompt.id).not.toContain(prompt.id);
  }
  for (const devOnly of ['LOCAL PREVIEW', 'Scenario gallery', 'larpbox-prompts']) {
    expect(bundle + html).not.toContain(devOnly);
  }
});
