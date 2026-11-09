video họp tuần 1: https://drive.google.com/file/d/1-mBF2ICs8vLiGIk_gCy9YN9aDRFsE-QM/view?usp=drive_link
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
│       ├── main.ts          Prefix /api, Swagger ở /api/docs (chỉ khi dev)
│       ├── prisma/          PrismaService dùng chung
│       ├── health/          GET /api/health
│       ├── qr/              Ký và kiểm tra token QR động (HMAC, hết hạn sau 60 giây)
│       └── queue/           Cấp số (dãy A đặt lịch, B vãng lai), thứ tự gọi số, khung check-in, tự đóng lịch không đến
├── web/                     React + Vite + Ant Design (admin, bác sĩ, lễ tân)
├── mobile/                  Expo + Expo Router (bệnh nhân)
├── docker-compose.yml       db + backend + caddy
├── Caddyfile                HTTPS tự động, /api → backend, còn lại → web
└── .github/workflows/       CI kiểm tra mỗi pull request, tự deploy khi vào main
```

## Hàng đợi ngày khám

- **Hai dãy số:** check-in lịch hẹn nhận số **A** (A01, A02…), người đến trực tiếp nhận số **B**.
- **Khung check-in:** từ giờ hẹn − 30 phút đến giờ hẹn + 15 phút. Đến sớm hơn thì app báo giờ mở check-in; đến trễ hơn thì lịch hẹn thành *không đến* và bệnh nhân lấy số B. Lễ tân check-in ngoài khung giờ được khi cần.
- **Thứ tự gọi số** (`backend/src/queue/queue-order.ts`), xét lần lượt:
  1. đã có 3 lượt liên tiếp gọi người đặt lịch mà còn người vãng lai chờ → gọi người vãng lai đến sớm nhất;
  2. người đặt lịch đã đến giờ hẹn (từ giờ hẹn − 10 phút) → gọi người có giờ hẹn sớm nhất;
  3. còn lại → theo thứ tự đến quầy.

  Bác sĩ có thể gọi đích danh một người (nút **Gọi** cạnh từng người chờ). Số "trước bạn còn mấy người" trên app tính bằng chính quy tắc này.
- **Tự dọn mỗi 5 phút:** lịch quá giờ hẹn + 15 phút chưa check-in → *không đến*; sau 21:00 số còn chờ → *bỏ về*.
- **Khóa đặt lịch:** không đến 3 lần trong 30 ngày thì 14 ngày không đặt lịch online được (vẫn lấy số trực tiếp được).

Các mốc trên đổi được trong `.env` (xem `.env.example`).

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

Mở http://localhost:3000/api/docs để xem Swagger (chỉ có khi chạy dev; bản Docker tắt mặc định, bật bằng `API_DOCS=true` trong `.env`). Bấm **Authorize** và dán `accessToken` lấy từ `POST /api/auth/login` để thử các API cần đăng nhập.

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

## Chạy demo trên một laptop (không cần VPS, tên miền)

Cần Docker Desktop, Node 22 và Git. Các máy khác và điện thoại vào cùng mạng Wi-Fi với laptop.

```bash
cp .env.example .env                      # giữ DOMAIN=:80, đổi các mật khẩu/khoá bí mật
cd web && npm ci && npm run build && cd ..
docker compose up -d --build              # db + backend (tự migrate) + caddy ở cổng 80
docker compose run --rm seed              # tài khoản và dữ liệu mẫu
```

- Web: `http://<IP-laptop>` (xem IP bằng `ipconfig`). Trên chính laptop: `http://localhost`.
- App bệnh nhân (Expo Go): `set EXPO_PUBLIC_API_URL=http://<IP-laptop>/api` rồi `npx expo start`.
- Windows chặn cổng 80 từ máy khác thì mở bằng CMD quyền Administrator:
  `netsh advfirewall firewall add rule name="Clinic demo" dir=in action=allow protocol=TCP localport=80`

## Tài khoản và bảo mật đăng nhập

- **Mật khẩu**: tối thiểu 8 ký tự, có cả chữ và số, không phải mật khẩu phổ biến, không chứa số điện thoại (tài khoản demo vẫn dùng `123456` vì được tạo bằng seed).
- **Chống dò mật khẩu**: sai 5 lần liên tiếp thì tài khoản tạm khóa 15 phút; một địa chỉ IP sai quá 30 lần trong 15 phút thì bị chặn.
- **Khóa tài khoản, đổi / đặt lại mật khẩu** có hiệu lực ngay: mọi phiên đăng nhập cũ (cả WebSocket) bị từ chối, không chờ token hết hạn.
- **Nhân viên quên mật khẩu**: admin vào Bác sĩ / Lễ tân → **Đặt lại mật khẩu** → hệ thống tạo mật khẩu tạm (hiện một lần) để đưa tận tay; lần đăng nhập đầu bắt đổi. Tài khoản admin tạo mới cũng phải đổi mật khẩu ở lần đăng nhập đầu.
- **Admin quên mật khẩu**: chạy trên máy chủ
  ```bash
  docker compose exec backend npm run reset-password -- 0900000001
  ```
  lệnh in ra mật khẩu tạm.
- Mọi người dùng đổi mật khẩu và **đăng xuất khỏi mọi thiết bị** được: web (bấm tên ở góc phải → Đổi mật khẩu), app (Hồ sơ → Đổi mật khẩu).

### Liên kết tài khoản app với hồ sơ có sẵn

Bệnh nhân từng khám vãng lai (lễ tân tạo hồ sơ) rồi mới đăng ký app bằng cùng số điện thoại: tài khoản dùng được ngay nhưng **lịch sử khám cũ bị ẩn và thông tin cá nhân bị che** cho tới khi chứng minh là chính chủ, để người biết số điện thoại không đọc được bệnh án người khác. Cách xác minh:

- nhập **mã liên kết** (6 ký tự) in trên phiếu số lễ tân in và trên bệnh án bác sĩ in, ở tab Lịch sử khám của app; sai 5 lần thì khóa nhập mã 60 phút;
- hoặc ra quầy: lễ tân chọn bệnh nhân, đối chiếu CCCD rồi bấm **Xác minh chính chủ**. Nếu người khác đã đăng ký trước bằng số của bệnh nhân, bấm **Không phải chính chủ** để gỡ tài khoản đó; chính chủ đăng ký lại được.

### Xác minh số điện thoại bằng tin nhắn (đăng ký, quên mật khẩu)

Giống Zalo: **người dùng nhắn tin tới phòng khám** chứ phòng khám không nhắn OTP đi. Phòng khám không tốn tiền SMS (kẻ xấu bấm "gửi mã" liên tục cũng không làm ai mất tiền), và tin phải gửi **từ chính SIM** của số khai báo nên không ai xác minh được số của người khác.

1. App tạo phiên → hiện "Nhắn **PKXM 482913** tới **09xx…**" và mở sẵn màn soạn tin.
2. Máy cổng của phòng khám nhận tin, chuyển về `POST /api/sms/inbound`.
3. Mã đúng **và** số người gửi trùng số khai báo → xác minh xong; app tự chuyển sang tạo tài khoản / đặt mật khẩu mới. Hồ sơ có sẵn của số đó thấy ngay lịch sử khám (đã chứng minh giữ số).

Nguồn nhận tin (trang admin **Tin nhắn xác minh** cho biết đã cấu hình chưa và liệt kê mọi tin nhận được kèm kết quả):

- **iPhone Phím tắt** (iOS 17+): đặt `SMS_GATEWAY_TOKEN` (chuỗi ngẫu nhiên dài) trong `.env`, `SMS_VERIFY_NUMBER` là số của iPhone. Trên iPhone: Phím tắt → Tự động hóa → Tin nhắn → *Tin nhắn chứa* `PKXM` → *Chạy ngay lập tức* → hành động **Lấy nội dung URL**: `http://<IP công khai>:8088/api/sms/inbound`, phương thức POST, header `X-Gateway-Token: <mã bí mật>`, thân JSON `from` = *Người gửi*, `body` = *Nội dung*. Nếu người gửi đã lưu danh bạ mà ra tên thay vì số, thêm bước lấy số điện thoại của danh bạ. HTTP thường không mã hóa: chỉ dùng để demo, đổi mã bí mật sau đó.
- **Android SMS Gateway** ([capcom6/android-sms-gateway](https://github.com/capcom6/android-sms-gateway)): đăng ký webhook `sms:received` tới địa chỉ **HTTPS** `…/api/sms/inbound`; đặt khóa ký (Settings → Webhooks → Signing Key) vào `SMS_GATEWAY_SIGNING_KEY`. Máy chủ kiểm tra chữ ký HMAC-SHA256.

Tắt bước xác minh khi đăng ký (vd. máy cổng hỏng tạm thời): `REQUIRE_PHONE_VERIFICATION=false`.

## Thống kê (admin)

Trang **Thống kê** (`/admin/stats`, trang đầu tiên của admin) tính trực tiếp từ dữ liệu khám: lượt khám, bệnh nhân mới, tỷ lệ đặt online, thời gian chờ và thời gian khám (trung vị), tỷ lệ lịch hẹn không đến, lượt theo ngày và theo giờ, chẩn đoán và thuốc thường gặp, số liệu theo bác sĩ; so với kỳ trước cùng độ dài; tải CSV để đưa vào báo cáo. Cách tính từng chỉ số ghi ở đầu `backend/src/stats/stats.ts` (và trong nút ⓘ trên trang).

Máy demo mới cài chưa có lịch sử khám nên trang gần như trống. Muốn có số liệu để trình diễn, tạo **dữ liệu lịch sử mẫu** (bệnh nhân hư cấu, số điện thoại 0989xxxxxx, 60 ngày gần nhất):

```bash
docker compose run --rm seed npx tsx prisma/seed-history.ts            # tạo
docker compose run --rm seed npx tsx prisma/seed-history.ts --reset    # xóa
# chạy trực tiếp: cd backend && npm run seed:history -- --days 90
```

Số liệu này là **mẫu sinh ngẫu nhiên**: khi đưa lên slide cần ghi rõ "dữ liệu mô phỏng", hoặc xóa đi và dùng số liệu của các buổi chạy thử thật.

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

### Thông báo và nhắc lịch

Server gửi thông báo khi bác sĩ gọi số (hoặc gọi lại), khi có kết quả cận lâm sàng cần quay lại, khi khám xong (kết quả, đơn thuốc đã có trên app), và nhắc lịch hẹn trước một ngày, trước một giờ (`REMINDER_SWEEP_SECONDS`, mặc định 60 giây quét một lần; `0` = tắt). Mọi thông báo đều vào hộp thư trong app (chuông ở góc màn hình); việc hiện lên màn hình điện thoại tùy máy:

| Máy | Cách nhận |
|---|---|
| iPhone + Expo Go, APK / development build | Tin đẩy từ server (Expo Push), nhận cả khi đã tắt app. Cần gắn app với dự án EAS một lần: `cd mobile && npx eas init` (ghi `extra.eas.projectId` vào `app.json`). APK Android cần thêm cấu hình Firebase (FCM) trên EAS. |
| Android + Expo Go | Expo Go không còn hỗ trợ tin đẩy từ SDK 53: app tự hiện thông báo khi đang mở (nhận qua WebSocket) và tự đặt lịch nhắc hẹn trên máy. |
| Bản web | Chỉ có hộp thư trong app. |

Tab Hồ sơ ghi máy đang nhận theo cách nào. `EXPO_ACCESS_TOKEN` (tùy chọn) chỉ cần khi bật "Enhanced Security for Push Notifications" trên tài khoản Expo.

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
