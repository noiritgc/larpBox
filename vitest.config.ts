import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests import @larpbox/shared from source so they never depend on a stale packages/shared/dist.
const sharedSource = fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url));
const alias = { '@larpbox/shared': sharedSource };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'shared',
          environment: 'node',
          include: ['packages/shared/src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'server',
          environment: 'node',
          include: ['apps/server/src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
      {
        resolve: { alias },
        esbuild: { jsx: 'automatic' },
        define: { __LARPBOX_DEVTOOLS__: 'false' },
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
          setupFiles: ['apps/web/src/test/setup.ts'],
        },
      },
    ],
  },
});
