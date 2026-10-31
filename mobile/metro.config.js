// Cấu hình Metro cho app bệnh nhân.
// Thêm proxy /api → backend khi chạy bản web (npx expo start --web): trình duyệt gọi cùng
// địa chỉ với trang (localhost:8081/api) nên không bị chặn khác cổng (CORS / trình duyệt nhúng).
// Điện thoại thật vẫn gọi thẳng IP LAN trong app.json → extra.apiUrl.
const http = require('node:http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const target = new URL(process.env.API_PROXY_TARGET ?? 'http://localhost:3000');
const previousEnhance = config.server?.enhanceMiddleware;

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const base = previousEnhance ? previousEnhance(middleware, server) : middleware;
    return (req, res, next) => {
      if (!req.url || !req.url.startsWith('/api/')) return base(req, res, next);
      const upstream = http.request(
        { hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host } },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: `Không kết nối được backend tại ${target.origin}` }));
      });
      req.pipe(upstream);
    };
  },
};

module.exports = config;
