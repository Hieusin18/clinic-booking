import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
  server: {
    // Khi dev, chuyển /api (cả WebSocket /api/socket.io) sang backend Spring Boot ở cổng 3000
    proxy: { '/api': { target: 'http://localhost:3000', ws: true } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    css: false,
    // Ant Design trong jsdom khá nặng. Máy Jenkins (có biến JENKINS_URL) vừa chạy test backend, web, mobile
    // song song vừa chạy SonarQube nên chậm gấp vài lần: cho mỗi test tối đa 90 giây ở đó, 30 giây ở nơi khác
    testTimeout: process.env.JENKINS_URL ? 90_000 : 30_000,
    // Độ phủ test cho SonarQube (chạy: npx vitest run --coverage)
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
    },
  },
});
