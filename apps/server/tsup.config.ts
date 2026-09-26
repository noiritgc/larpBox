import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  splitting: false,
  // Bundle the private shared package and the server-only prompt JSON into dist/index.js so the
  // production server starts without src/ or a built packages/shared present.
  noExternal: ['@larpbox/shared'],
  env: { LARPBOX_VERSION: version },
});
