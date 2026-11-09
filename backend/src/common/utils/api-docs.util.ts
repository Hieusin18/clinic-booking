/**
 * Trang tài liệu API (Swagger, /api/docs) liệt kê mọi đường dẫn và tham số, chỉ cần khi phát triển.
 * Mặc định: bật khi chạy dev (npm run start:dev), tắt trong image Docker (NODE_ENV=production) để người ngoài
 * truy cập qua IP công khai không xem được. Muốn bật lại khi chạy thật thì đặt API_DOCS=true trong .env.
 */
export function apiDocsEnabled(env: NodeJS.ProcessEnv = process.env) {
  const flag = env.API_DOCS?.trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return env.NODE_ENV !== 'production';
}
