import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts', 'apps/**/*.test.tsx', 'packages/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    maxWorkers: 2,
  },
});
