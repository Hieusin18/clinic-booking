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
├── web/                     React + Vite + Ant Design (admin, bác sĩ, lễ tân)
├── mobile/                  Expo + Expo Router (bệnh nhân)
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

# 4. Tạo dữ liệu mẫu (chạy lại nhiều lần không bị trùng)
npx prisma db seed

# 5. Chạy
npm run start:dev
```

Mở http://localhost:3000/api/docs để xem Swagger. Bấm **Authorize** và dán `accessToken` lấy từ `POST /api/auth/login` để thử các API cần đăng nhập.

Tài khoản mẫu (mật khẩu đều là `123456`):

| Vai trò | SĐT |
| --- | --- |
| Admin | 0900000001 |
| Lễ tân | 0900000002 |
| Bệnh nhân | 0900000003 |
| Bác sĩ | 0910000001 → 0910000006 |

Phân quyền: mọi API mặc định cần đăng nhập; API công khai gắn `@Public()`, API giới hạn vai trò gắn `@Roles('ADMIN', …)` (xem `src/auth/decorators.ts`).

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

## Chạy web (trang quản lý cho admin, bác sĩ, lễ tân)

```bash
cd web
npm install
npm run dev        # http://localhost:5173, tự chuyển /api sang backend cổng 3000
npm test           # test giao diện (Vitest + Testing Library)
npm run build      # build ra web/dist để Caddy phục vụ
```

Mã nguồn chia theo chức năng trong `web/src/features/<chức-năng>/`; phần dùng chung ở `web/src/lib` (gọi API, đăng nhập, định dạng) và `web/src/layout` (khung trang, phân quyền trang).

## Chạy app mobile (bệnh nhân)

```bash
cd mobile
npm install
npx expo start     # quét QR bằng app Expo Go trên điện thoại
npm run typecheck
npm test
```

- Sửa `expo.extra.apiUrl` trong `mobile/app.json` thành IP LAN của máy chạy backend, ví dụ `http://192.168.1.10:3000/api` (điện thoại và máy tính cùng mạng Wi-Fi). Không dùng `localhost`.
- Thử nhanh trên máy tính (không cần điện thoại): `npx expo start --web --port 8081` rồi mở http://localhost:8081. Bản web gọi `/api` cùng địa chỉ trang, Metro tự chuyển sang backend `http://localhost:3000` (đổi bằng biến `API_PROXY_TARGET`), nên **không** đặt `EXPO_PUBLIC_API_URL` khi chạy bản web.
- Cài thêm thư viện Expo bằng `npx expo install <tên>` (không dùng `npm install`) để đúng phiên bản với SDK.
- Màn hình nằm trong `mobile/src/app/` (Expo Router: mỗi file là một màn hình).
- Build APK để nộp và demo: `eas build -p android --profile preview`, đặt `EXPO_PUBLIC_API_URL=https://<tên-miền>/api`.

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
