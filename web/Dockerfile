# Image web = Caddy + Caddyfile + trang React đã build. Build từ thư mục gốc repo:
#   docker build -f web/Dockerfile -t clinic-web .
# Không cần mount thư mục nào khi chạy, nên dùng được cho Jenkins và VPS.
FROM node:22-alpine AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/web/dist /srv/web
