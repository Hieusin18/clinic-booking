#!/usr/bin/env bash
# Tạo cụm Kubernetes trên laptop bằng k3d (k3s chạy trong Docker). Chạy lại nhiều lần không sao.
#   bash k8s/up.sh                      # cụm "clinic", web ở http://localhost:8090
#   K8S_HTTP_PORT=80 bash k8s/up.sh     # dùng cổng 80 (phải tắt bản docker compose trước)
# Cần: Docker, k3d (https://k3d.io), kubectl.
set -euo pipefail

CLUSTER="${K8S_CLUSTER:-clinic}"
HTTP_PORT="${K8S_HTTP_PORT:-8090}"

for bin in docker k3d kubectl; do
  command -v "$bin" >/dev/null || { echo "Thiếu lệnh '$bin'. Xem hướng dẫn cài trong k8s/README.md"; exit 1; }
done

if k3d cluster get "$CLUSTER" >/dev/null 2>&1; then
  echo "Cụm '$CLUSTER' đã có, bật lại nếu đang tắt"
  k3d cluster start "$CLUSTER" --wait
else
  # 1 node điều khiển (server) + 1 node chạy ứng dụng (agent).
  # API Kubernetes chỉ mở ở 127.0.0.1 (không lộ ra mạng LAN); Jenkins gọi qua mạng Docker của cụm.
  # Cổng web: HTTP_PORT của laptop → bộ cân bằng tải của k3d → Traefik (Ingress) → service web.
  k3d cluster create "$CLUSTER" \
    --agents 1 \
    --api-port 127.0.0.1:6443 \
    -p "${HTTP_PORT}:80@loadbalancer" \
    --k3s-arg "--tls-san=k3d-${CLUSTER}-serverlb@server:*" \
    --wait
fi

kubectl config use-context "k3d-$CLUSTER" >/dev/null
kubectl get nodes -o wide
echo
echo "Xong. Triển khai:  TAG=latest bash k8s/deploy.sh .env"
echo "Web: http://localhost:${HTTP_PORT}"
