import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ command, mode }) => {
  // Read the root .env (the same file the dev server uses). Only ENABLE_DEVTOOLS is consumed here.
  const env = loadEnv(mode, repoRoot, '');
  // The /dev scenario gallery exists only in the development server with an explicit opt-in.
  // Production builds compile it out entirely, including its fixture data.
  const devtools = command === 'serve' && mode === 'development' && env['ENABLE_DEVTOOLS'] === 'true';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __LARPBOX_DEVTOOLS__: JSON.stringify(devtools),
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: 'http://127.0.0.1:3001' },
        '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      target: 'es2022',
    },
  };
});
