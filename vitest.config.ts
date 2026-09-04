import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Two environments, chosen by file location:
//   src/**/*.test.ts   — pure modules (selectors, adapters, fixtures): node
//   src/**/*.test.tsx  — components and screens: jsdom + Testing Library
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom'],
      ['src/**/*.test.ts', 'node'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 20000,
  },
});
