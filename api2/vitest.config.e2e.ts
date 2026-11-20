import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Testcontainers가 PostgreSQL 이미지를 받고 띄우는 시간을 기다린다.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
