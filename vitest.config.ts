import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // tests/e2e는 Playwright 전용 스위트(playwright.config.ts)이므로 vitest 대상에서 제외한다.
    exclude: ['node_modules/**', 'tests/e2e/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
