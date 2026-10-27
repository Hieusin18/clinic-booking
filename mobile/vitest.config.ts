import { defineConfig } from 'vitest/config';

// Test logic thuần (không render React Native): định dạng, xử lý lỗi, tính toán.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
