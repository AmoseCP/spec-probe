import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // 关掉 modulepreload polyfill：本项目没有 preload 链接，它永不触发，
    // 但它是产物里唯一的 fetch() 调用点。零外发是本项目的卖点，产物里干脆不留。
    modulePreload: { polyfill: false },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
