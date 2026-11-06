import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
  server: {
    // Khi dev, chuyển /api sang backend NestJS chạy ở cổng 3000
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    css: false,
    // Ant Design trong jsdom khá nặng; khi Jenkins chạy song song 3 bộ test thì 5 giây mặc định không đủ
    testTimeout: 15000,
    // Độ phủ test cho SonarQube (chạy: npx vitest run --coverage)
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
    },
  },
});
