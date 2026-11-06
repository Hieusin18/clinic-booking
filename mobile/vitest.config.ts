import { defineConfig } from 'vitest/config';

// Test logic thuần (không render React Native): định dạng, xử lý lỗi, tính toán.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Độ phủ test cho SonarQube (chạy: npx vitest run --coverage)
    coverage: { provider: 'v8', reporter: ['text-summary', 'lcov'], include: ['src/lib/**/*.ts'], exclude: ['src/**/*.test.ts'] },
  },
});
