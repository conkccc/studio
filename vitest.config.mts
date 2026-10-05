import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    maxWorkers: 4,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/__tests__/**/*.ts', 'src/**/__tests__/**/*.tsx'],
    exclude: ['src/**/__tests__/fixtures.ts', 'src/**/__tests__/setup.ts'],
    setupFiles: ['src/lib/actions/__tests__/setup.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage'
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), './src')
    }
  }
});
