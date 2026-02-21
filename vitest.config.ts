// File: vitest.config.ts
// Description: Vitest runtime configuration for this repository.
// Why: Keeps test execution stable under constrained memory environments.
// Related: package.json, tests/unit, .pi/tests

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '.pi': path.resolve(__dirname, '.pi'),
      '@lib': path.resolve(__dirname, '.pi/lib'),
      '@ext': path.resolve(__dirname, '.pi/extensions'),
    },
    extensions: ['.ts', '.js', '.mjs'],
  },
  esbuild: {
    target: 'node18',
    format: 'esm',
  },
  test: {
    include: ['tests/**/*.test.ts', '.pi/tests/**/*.test.ts'],
    setupFiles: ['tests/setup-vitest.ts'],
    globals: true,
    // Low-memory profile:
    // - Run files serially.
    // - Use a single thread worker to avoid multi-process Node forks.
    fileParallelism: false,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    maxConcurrency: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
