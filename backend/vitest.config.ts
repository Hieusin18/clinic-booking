import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC giữ decorator metadata mà NestJS cần để tiêm phụ thuộc (esbuild mặc định không làm được).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup-env.ts'],
    // Các file test dùng chung một CSDL nên chạy tuần tự để không xóa dữ liệu của nhau
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    // Độ phủ test cho SonarQube (chạy: npx vitest run --coverage)
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/main.ts'],
    },
  },
});
