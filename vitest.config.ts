import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts', 'apps/**/*.test.tsx', 'packages/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    maxWorkers: 2,
    // Coverage is measured only for product source, never for tests, seeds or build output.
    coverage: {
      provider: 'v8',
      include: ['apps/api/src/**', 'apps/web/src/**', 'apps/simulators/src/**', 'packages/contracts/src/**', 'packages/db/src/**'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/dist/**'],
      reporter: ['text-summary', 'json-summary', 'text'],
      reportsDirectory: 'tmp/coverage',
    },
  },
});
