# Chạy hệ thống trên Kubernetes (k3d)

Cách chạy song song với docker compose: cùng image `clinic-backend`, `clinic-web`, cùng file `.env`.
Hướng dẫn chi tiết và giải thích từng khái niệm: xem tài liệu "Hướng dẫn Kubernetes" của nhóm.

## Cài công cụ (một lần)

- Docker Desktop (hoặc Docker Engine trên Linux)
- kubectl: https://kubernetes.io/docs/tasks/tools/
- k3d: https://k3d.io (Windows: `choco install k3d` hoặc `winget install k3d`; macOS: `brew install k3d`)

Windows: chạy các lệnh dưới đây trong Git Bash hoặc WSL.

## Chạy

```bash
bash k8s/up.sh                                   # tạo cụm "clinic" (1 server + 1 agent), web ở cổng 8090
docker build -t clinic-backend:latest backend
docker build -f web/Dockerfile -t clinic-web:latest .
TAG=latest bash k8s/deploy.sh .env               # nạp image, tạo secret từ .env, áp dụng, chờ sẵn sàng
kubectl -n clinic exec deploy/backend -- java -jar app.jar seed   # dữ liệu mẫu (lần đầu)
```

Mở http://localhost:8090 (máy khác trong mạng LAN: http://<IP laptop>:8090).

Giá trị trong `.env` không để trong dấu nháy (`JWT_SECRET=abc`, không phải `JWT_SECRET="abc"`): Kubernetes giữ nguyên dấu nháy.

## Lệnh hay dùng

```bash
kubectl -n clinic get pods                      # các pod và trạng thái
kubectl -n clinic logs deploy/backend -f        # log backend
kubectl -n clinic scale deploy/web --replicas=3 # thêm bản web (backend giữ 1 bản, xem base/backend.yaml)
kubectl -n clinic rollout undo deploy/backend   # quay lại phiên bản trước
k3d cluster stop clinic                         # tắt cụm (giữ dữ liệu); bật lại: bash k8s/up.sh
k3d cluster delete clinic                       # xóa cụm và toàn bộ dữ liệu trong cụm
```

## Jenkins

Đặt biến toàn cục `DEPLOY_K8S=true`, dùng lại credential `clinic-env`. Bước **Deploy Kubernetes** gọi
`k8s/deploy.sh` với tag của lần build; Jenkins tự nối vào mạng Docker của cụm nên không cần kubeconfig riêng.
Cần build lại image Jenkins (`docker compose -f ci/docker-compose.yml up -d --build`) để có kubectl và k3d.

## Thư mục

| File | Nội dung |
|---|---|
| `base/namespace.yaml` | namespace `clinic` |
| `base/db.yaml` | PostgreSQL: StatefulSet + PVC 2Gi + Service `db` |
| `base/backend.yaml` | Backend: Deployment 1 bản (Recreate), probe `/api/health`, Service `backend:3000` |
| `base/web.yaml` | Web (Caddy + React): Deployment 2 bản (RollingUpdate), Service `web:80` |
| `base/ingress.yaml` | Ingress (Traefik có sẵn trong k3d) → `web` |
| `up.sh` | Tạo / bật cụm k3d |
| `deploy.sh` | Nạp image, sinh secret từ `.env`, đổi tag, `kubectl apply -k`, chờ rollout, kiểm tra health |
