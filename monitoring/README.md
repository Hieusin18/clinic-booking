# Giám sát hệ thống (Prometheus + Grafana)

```
backend /api/metrics ──┐
node-exporter (máy) ───┤
cAdvisor (container) ──┼──► Prometheus :9090 (thu 15 giây/lần, giữ 7 ngày, 6 luật cảnh báo) ──► Grafana :3001
postgres-exporter (CSDL)┘
```

Chạy **sau khi** hệ thống chính đã chạy (bản chạy tay `docker compose up -d` hoặc bản Jenkins deploy), ở thư mục gốc repo:

```bash
docker compose -f monitoring/docker-compose.yml --env-file .env up -d
bash monitoring/check.sh        # tuỳ chọn: tự kiểm tra mọi thứ đã có số liệu
```

| Địa chỉ | Dùng để |
|---|---|
| http://localhost:3001 | Grafana, đăng nhập `admin` / `GRAFANA_ADMIN_PASSWORD` trong `.env`; dashboard **Hệ thống đặt lịch khám** mở sẵn |
| http://localhost:9090/targets | Prometheus: các nguồn số liệu phải đều **UP** |
| http://localhost:9090/alerts | Luật cảnh báo (backend/CSDL ngừng, lỗi 5xx > 5%, p95 > 1s, RAM > 90%, ổ đĩa < 10%) |

`/api/metrics` chỉ đọc được trong mạng Docker (`backend:3000`); qua Caddy (cổng 80/443) trả 404.

Tắt: `docker compose -f monitoring/docker-compose.yml down` (thêm `-v` để xoá cả số liệu đã thu).
