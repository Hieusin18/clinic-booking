# Clinic Booking: hệ thống đặt lịch khám

Đồ án nhóm 5 người, dùng chung cho 3 môn: Phát triển ứng dụng di động, Lập trình web, Triển khai phần mềm.

Công nghệ đã chốt: **NestJS + Prisma + PostgreSQL** (backend), **React + Vite + Ant Design** (web), **React Native / Expo** (mobile), **Docker + Caddy + GitHub Actions** (triển khai). Toàn bộ dùng TypeScript.

## Cấu trúc thư mục

```
clinic-booking/
├── backend/                 NestJS API (đã dựng sẵn)
│   ├── prisma/schema.prisma Toàn bộ CSDL: 4 vai trò, lịch hẹn, hàng đợi, bệnh án, đơn thuốc
│   ├── prisma.config.ts     Cấu hình Prisma 7 (đọc DATABASE_URL)
│   └── src/
│       ├── main.ts          Prefix /api, Swagger ở /api/docs
│       ├── prisma/          PrismaService dùng chung
│       ├── health/          GET /api/health
│       ├── qr/              Ký và kiểm tra token QR động (HMAC, hết hạn sau 60 giây)
│       └── queue/           Cấp số thứ tự an toàn khi nhiều người lấy cùng lúc, quét QR
├── web/                     (chưa có: khởi tạo theo hướng dẫn bên dưới)
├── mobile/                  (chưa có: khởi tạo theo hướng dẫn bên dưới)
├── docker-compose.yml       db + backend + caddy
├── Caddyfile                HTTPS tự động, /api → backend, còn lại → web
└── .github/workflows/       CI kiểm tra mỗi pull request, tự deploy khi vào main
```

## Chạy backend trên máy

Cần Node 22 và Docker.

```bash
# 1. Bật PostgreSQL
docker run -d --name clinic-db -p 5432:5432 \
  -e POSTGRES_USER=clinic -e POSTGRES_PASSWORD=clinic -e POSTGRES_DB=clinic \
  postgres:16-alpine

# 2. Cài đặt và cấu hình
cd backend
npm install
cp .env.example .env

# 3. Tạo bảng và sinh Prisma Client
npx prisma migrate deploy
npx prisma generate

# 4. Chạy
npm run start:dev
```

Mở http://localhost:3000/api/docs để xem Swagger.

Lưu ý Prisma 7: `migrate dev` **không** tự chạy `generate`. Khi sửa `schema.prisma`, chạy `npx prisma migrate dev --name <mo-ta>` rồi `npx prisma generate`, và commit thư mục migration mới.

## Chạy test

Test chạy với PostgreSQL thật (CSDL riêng `clinic_test`, bị xóa dữ liệu mỗi lần chạy):

```bash
docker exec clinic-db psql -U clinic -c "CREATE DATABASE clinic_test"
cd backend
DATABASE_URL=postgresql://clinic:clinic@localhost:5432/clinic_test npx prisma migrate deploy
npm test            # chạy toàn bộ test
npm run typecheck   # kiểm tra kiểu cả src lẫn test
```

CI chạy đúng các bước này trên mỗi pull request, kèm kiểm tra migration khớp với `schema.prisma`.

## Khởi tạo web (người 3 và 4)

```bash
npm create vite@latest web -- --template react-ts
cd web
npm install antd @tanstack/react-query axios qrcode.react
```

Trong dev, cấu hình proxy `/api` của Vite sang `http://localhost:3000`. Khi deploy, Caddy phục vụ thư mục `web/dist`.

## Khởi tạo mobile (người 5)

```bash
npx create-expo-app@latest mobile
cd mobile
npx expo install expo-camera expo-notifications expo-secure-store
```

Khi chạy trên điện thoại thật, trỏ API về IP máy tính trong mạng LAN (không dùng `localhost`). Build APK để nộp và demo bằng EAS Build (`eas build -p android --profile preview`).

## Deploy lên VPS (người 2)

1. Trên VPS: cài Docker, `git clone` repo vào `~/clinic-booking`, tạo `.env` từ `.env.example` với mật khẩu và khóa thật, đặt `DOMAIN` là tên miền đã trỏ về IP của VPS.
2. Chạy `docker compose up -d --build`. Caddy tự xin chứng chỉ HTTPS.
3. Trên GitHub, vào Settings → Secrets and variables → Actions, thêm `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Từ đó mỗi lần merge vào `main`, workflow tự kiểm tra rồi deploy.

Khóa `QR_SECRET`, `JWT_SECRET` và mật khẩu CSDL chỉ nằm trong `.env` trên server và GitHub Secrets, không bao giờ commit lên Git.

## Quy ước làm việc

- Nhánh `main` luôn chạy được. Mỗi việc một nhánh `feat/<tên-việc>`, merge qua pull request có ít nhất 1 người review.
- Đổi CSDL: sửa `schema.prisma`, chạy `migrate dev --name <mô-tả>`, commit cả thư mục migration.
- Đổi API: cập nhật decorator Swagger để web và mobile thấy ngay.

## Việc tiếp theo cho backend (tuần 1)

- [ ] Module `auth`: đăng ký, đăng nhập, JWT, guard theo vai trò; lấy `patientId` từ token thay cho body trong `POST /api/queue/scan`
- [ ] Module `specialties`, `doctors`, `schedules` (CRUD)
- [ ] Module `appointments`: đặt lịch chống trùng bằng `updateMany({ where: { id, isBooked: false } })` trong transaction
- [ ] Module `patients`: lễ tân tìm theo SĐT/CCCD, tạo hồ sơ, liên kết tài khoản khi đăng ký cùng SĐT
- [ ] Module `medical-records`, `prescriptions`, `medicines`
- [ ] Seed dữ liệu mẫu (chuyên khoa, bác sĩ, thuốc) để demo
