// Biến môi trường mặc định cho test. CI ghi đè DATABASE_URL bằng PostgreSQL của runner.
process.env.DATABASE_URL ??= 'postgresql://clinic:clinic@localhost:5432/clinic_test';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.QR_SECRET ??= 'test-qr-secret';
process.env.QR_TTL_SECONDS ??= '60';
process.env.CLINIC_ID ??= 'phong-kham-test';
