#!/usr/bin/env node
/**
 * Captures every /dev gallery scenario at the spec's review sizes for human or agent review:
 * host 1920x1080 and 1280x720, phone 390x844 and 360x640. It also flags horizontal overflow and
 * host post text below 24px.
 *
 * Requires the Vite dev server with the gallery enabled, for example:
 *   cd apps/web && ENABLE_DEVTOOLS=true npx vite --port 5199
 *   GALLERY_URL=http://127.0.0.1:5199 node scripts/capture-gallery.mjs
 * Options: ONLY=host-read,phone-guess (id prefixes), OUT=dir, MOTION=reduce|no-preference, ZOOM=2.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.env.GALLERY_URL ?? 'http://127.0.0.1:5199';
const out = process.env.OUT ?? 'tests/e2e/screenshots/gallery';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const zoom = Number(process.env.ZOOM ?? 1);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const index = await browser.newPage();
await index.goto(`${base}/dev`);
await index.getByRole('heading', { name: 'Scenario gallery' }).waitFor();
let ids = await index.locator('a[href^="/dev?s="]').evaluateAll((links) => links.map((link) => new URL(link.href).searchParams.get('s')));
if (only) ids = ids.filter((id) => only.some((prefix) => id.startsWith(prefix)));
await index.close();

const sizes = { host: [[1920, 1080], [1280, 720]], phone: [[390, 844], [360, 640]] };
const problems = [];
for (const id of ids) {
  const kind = id.startsWith('host') ? 'host' : 'phone';
  for (const [width, height] of sizes[kind]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      reducedMotion: process.env.MOTION === 'no-preference' ? 'no-preference' : 'reduce',
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => problems.push(`${id}@${width}x${height}: ${error.message}`));
    await page.goto(`${base}/dev?s=${id}`);
    await page.getByText('LOCAL PREVIEW — NOT A LIVE GAME').waitFor();
    if (zoom !== 1) await page.evaluate((factor) => (document.documentElement.style.fontSize = `${factor * 100}%`), zoom);
    await page.waitForTimeout(300);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
      problems.push(`${id}@${width}x${height}: horizontal overflow`);
    }
    if (kind === 'host') {
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('.post-body')].map((el) => parseFloat(getComputedStyle(el).fontSize)).filter((size) => size < 24),
      );
      if (small.length) problems.push(`${id}@${width}x${height}: post text below 24px`);
    }
    await page.screenshot({ path: `${out}/${id}-${width}x${height}.png` });
    await context.close();
  }
}
await browser.close();
console.log(`captured ${ids.length} scenarios into ${out}`);
console.log(problems.length ? problems.join('\n') : 'no page errors, no horizontal overflow, host post text >= 24px');
process.exitCode = problems.length ? 1 : 0;
