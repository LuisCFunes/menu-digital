import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 120000,
    hookTimeout: 180000,
    pool: 'forks',
    fileParallelism: false
  }
});
