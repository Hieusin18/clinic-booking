#!/bin/sh
# Dọn image cũ trên máy chạy Jenkins (laptop): mỗi lần build tạo thêm 3 image gắn số build
# (<prefix>-backend:<số>, <prefix>-backend-tools:<số>, <prefix>-web:<số>), không dọn thì ổ đĩa đầy dần.
# Giữ KEEP lần build gần nhất để còn quay lại bản trước; image đang chạy thì Docker từ chối xóa nên tự được giữ.
#
#   sh ci/clean-images.sh <IMAGE_PREFIX> [KEEP=3]
set -u
PREFIX="$1"
KEEP="${2:-3}"

for img in backend backend-tools web; do
  docker image ls "$PREFIX-$img" --format '{{.Tag}}' \
    | grep -E '^[0-9]+$' \
    | sort -n \
    | awk -v keep="$KEEP" '{ tags[NR] = $0 } END { for (i = 1; i <= NR - keep; i++) print tags[i] }' \
    | while read -r tag; do
        if docker rmi "$PREFIX-$img:$tag" >/dev/null 2>&1; then
          echo "Đã xóa $PREFIX-$img:$tag"
        else
          echo "Giữ $PREFIX-$img:$tag (đang được dùng)"
        fi
      done
done

# Lớp trung gian không còn tên sau mỗi lần build lại, và bộ nhớ đệm build cũ hơn 7 ngày
docker image prune -f >/dev/null
docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
docker system df
