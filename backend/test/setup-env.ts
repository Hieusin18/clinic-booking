// Biến môi trường mặc định cho test. CI ghi đè DATABASE_URL bằng PostgreSQL của runner.
process.env.DATABASE_URL ??= 'postgresql://clinic:clinic@localhost:5432/clinic_test';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.QR_SECRET ??= 'test-qr-secret';
process.env.QR_TTL_SECONDS ??= '60';
process.env.CLINIC_ID ??= 'phong-kham-test';
process.env.QUEUE_SWEEP_SECONDS ??= '0';
process.env.REMINDER_SWEEP_SECONDS ??= '0';
// Test cũ đăng ký không qua bước nhắn tin xác minh; test/phone-verify.test.ts bật lại khi cần
process.env.REQUIRE_PHONE_VERIFICATION ??= 'false';
