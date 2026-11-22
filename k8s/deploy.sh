#!/usr/bin/env bash
# Triển khai (hoặc cập nhật) hệ thống lên cụm k3d. Dùng cho cả máy cá nhân và Jenkins.
#   TAG=latest bash k8s/deploy.sh .env
# Biến: TAG (tag image, mặc định latest), IMAGE_PREFIX (mặc định clinic), K8S_CLUSTER (mặc định clinic).
# Image $IMAGE_PREFIX-backend:$TAG và $IMAGE_PREFIX-web:$TAG phải build sẵn trên máy (docker build).
set -euo pipefail

ENV_FILE="${1:-${APP_ENV:-.env}}"
TAG="${TAG:-latest}"
IMAGE_PREFIX="${IMAGE_PREFIX:-clinic}"
CLUSTER="${K8S_CLUSTER:-clinic}"
NS=clinic
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$HERE/.deploy"

[ -f "$ENV_FILE" ] || { echo "Không thấy file môi trường '$ENV_FILE'"; exit 1; }
k3d cluster get "$CLUSTER" >/dev/null 2>&1 || { echo "Chưa có cụm '$CLUSTER': chạy bash k8s/up.sh trước"; exit 1; }

mkdir -p "$WORK"
# Bản sao .env chỉ tồn tại trong lúc triển khai (thư mục .deploy nằm trong .gitignore)
trap 'rm -f "$WORK/app.env" "$WORK/kubeconfig"' EXIT

# Chạy trong container (Jenkins): nối container vào mạng Docker của cụm rồi gọi API qua tên bộ cân bằng tải.
# Chạy trên máy: dùng địa chỉ 127.0.0.1 mà k3d mở sẵn.
export KUBECONFIG="$WORK/kubeconfig"
if [ -f /.dockerenv ]; then
  docker network connect "k3d-$CLUSTER" "$(hostname)" 2>/dev/null || true
  k3d kubeconfig get "$CLUSTER" | sed -E "s#server: https://[^ ]+#server: https://k3d-$CLUSTER-serverlb:6443#" > "$KUBECONFIG"
else
  k3d kubeconfig get "$CLUSTER" > "$KUBECONFIG"
fi
chmod 600 "$KUBECONFIG"

echo "== Nạp image vào cụm (không cần registry)"
k3d image import "$IMAGE_PREFIX-backend:$TAG" "$IMAGE_PREFIX-web:$TAG" -c "$CLUSTER"

echo "== Áp dụng cấu hình (tag $TAG)"
cp "$ENV_FILE" "$WORK/app.env"
# Lớp phủ sinh tự động: lấy bộ cấu hình gốc trong k8s/base, thêm secret từ .env và đổi tag image.
# secretGenerator gắn mã băm nội dung vào tên secret: sửa .env thì pod tự khởi động lại với cấu hình mới.
cat > "$WORK/kustomization.yaml" <<YAML
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: $NS
resources:
  - ../base
secretGenerator:
  - name: clinic-env
    envs:
      - app.env
images:
  - name: clinic-backend
    newName: $IMAGE_PREFIX-backend
    newTag: "$TAG"
  - name: clinic-web
    newName: $IMAGE_PREFIX-web
    newTag: "$TAG"
YAML
kubectl apply -k "$WORK"

echo "== Chờ các thành phần sẵn sàng"
kubectl -n "$NS" rollout status statefulset/db --timeout=180s
kubectl -n "$NS" rollout status deployment/backend --timeout=300s
kubectl -n "$NS" rollout status deployment/web --timeout=180s

echo "== Kiểm tra backend qua web (Caddy → backend)"
for i in $(seq 1 30); do
  if kubectl -n "$NS" exec deploy/web -- wget -qO- http://127.0.0.1/api/health; then
    echo; kubectl -n "$NS" get pods -o wide; exit 0
  fi
  sleep 3
done
echo "Health check thất bại"
kubectl -n "$NS" get pods
kubectl -n "$NS" logs deploy/backend --tail 50
exit 1
