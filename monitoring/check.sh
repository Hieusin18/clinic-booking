#!/usr/bin/env bash
# Kiểm tra bộ giám sát chạy đúng (CI dùng; ai cũng chạy được trên laptop sau khi đã "up" hệ thống chính):
#   bash monitoring/check.sh
# Dựng Prometheus + Grafana, tạo ít request, rồi kiểm tra: mọi nguồn số liệu đều "up",
# mọi biểu đồ trên dashboard đều có dữ liệu, Grafana đã nạp sẵn nguồn dữ liệu và dashboard.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=${ENV_FILE:-.env}
C="docker compose -f monitoring/docker-compose.yml --env-file $ENV_FILE"
PROM=http://localhost:9090
GRAFANA=http://localhost:3001
GPASS=$(sed -n 's/^GRAFANA_ADMIN_PASSWORD=//p' "$ENV_FILE"); GPASS=${GPASS:-admin}

fail() {
  echo "::error title=$1::$(printf '%s' "$2" | sed ':a;N;$!ba;s/%/%25/g;s/\r/%0D/g;s/\n/%0A/g')"
  $C ps -a || true
  exit 1
}

echo "== /api/metrics không được mở ra ngoài qua Caddy"
code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/api/metrics || true)
[ "$code" = 404 ] || fail caddy "http://localhost/api/metrics trả $code, phải là 404"

echo "== Dựng Prometheus, Grafana, node-exporter, cAdvisor, postgres-exporter"
$C up -d --wait --wait-timeout 180 || fail compose "$($C logs --no-color --tail 30 2>&1)"

echo "== Tạo request mẫu"
for i in $(seq 1 20); do
  curl -s -o /dev/null http://localhost/api/health || true
  curl -s -o /dev/null http://localhost/api/doctors || true
  curl -s -o /dev/null http://localhost/api/khong-co || true
done
curl -s -o /dev/null -X POST http://localhost/api/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"0900000001","password":"123456"}' || true

echo "== Mọi nguồn số liệu (target) đều up"
for i in $(seq 1 30); do
  down=$(python3 - "$PROM" <<'PY'
import json, sys, urllib.request
try:
    t = json.load(urllib.request.urlopen(f"{sys.argv[1]}/api/v1/targets?state=active"))["data"]["activeTargets"]
except Exception as e:
    print(f"Prometheus chưa sẵn sàng: {e}"); sys.exit()
bad = [f'{x["labels"]["job"]}: {x["health"]} {x.get("lastError", "")}' for x in t if x["health"] != "up"]
if len(t) < 5: bad.append(f"chỉ thấy {len(t)}/5 target")
print("\n".join(bad), end="")
PY
  )
  [ -z "$down" ] && break
  sleep 5
done
[ -z "$down" ] || fail targets "$down"
curl -s "$PROM/api/v1/targets?state=active" | python3 -c 'import json,sys; [print(" ", x["labels"]["job"], x["health"]) for x in json.load(sys.stdin)["data"]["activeTargets"]]'

echo "== Mọi biểu đồ trên dashboard đều có dữ liệu"
# rate()/increase() cần ít nhất 2 lần thu số liệu (15 giây/lần) nên thử lại tối đa ~2 phút
for i in $(seq 1 24); do
  empty=$(python3 - "$PROM" <<'PY'
import json, sys, urllib.parse, urllib.request
prom = sys.argv[1]
d = json.load(open("monitoring/grafana/dashboards/clinic-overview.json"))
bad = []
for p in d["panels"]:
    for t in p.get("targets", []):
        q = urllib.parse.urlencode({"query": t["expr"]})
        r = json.load(urllib.request.urlopen(f"{prom}/api/v1/query?{q}"))
        if r["status"] != "success" or not r["data"]["result"]:
            bad.append(f'{p["title"]}: {t["expr"]}')
print("\n".join(bad), end="")
PY
  )
  [ -z "$empty" ] && break
  sleep 5
done
[ -z "$empty" ] || fail dashboard "Biểu đồ không có dữ liệu:
$empty"
echo "  đủ dữ liệu"

echo "== Luật cảnh báo đã nạp"
rules=$(curl -s "$PROM/api/v1/rules" | python3 -c 'import json,sys; print(sum(len(g["rules"]) for g in json.load(sys.stdin)["data"]["groups"]))')
[ "$rules" -ge 6 ] || fail alerts "Chỉ có $rules luật cảnh báo"
firing=$(curl -s "$PROM/api/v1/alerts" | python3 -c 'import json,sys; print(" ".join(a["labels"]["alertname"] for a in json.load(sys.stdin)["data"]["alerts"] if a["labels"].get("severity")=="critical"))')
[ -z "$firing" ] || fail alerts "Đang có cảnh báo nghiêm trọng: $firing"
echo "  $rules luật"

echo "== Grafana: nguồn dữ liệu Prometheus và dashboard nạp sẵn"
for i in $(seq 1 30); do curl -sf "$GRAFANA/api/health" >/dev/null && break; sleep 2; done
ds=$(curl -s -u "admin:$GPASS" "$GRAFANA/api/datasources/uid/prometheus/health" || true)
printf '%s' "$ds" | grep -q '"status":"OK"' || fail grafana "Grafana không kết nối được Prometheus: $ds"
dash=$(curl -s -u "admin:$GPASS" "$GRAFANA/api/dashboards/uid/clinic-overview" || true)
printf '%s' "$dash" | python3 -c 'import json,sys; sys.exit(json.load(sys.stdin)["dashboard"]["uid"] != "clinic-overview")' 2>/dev/null || fail grafana "Không thấy dashboard: $(printf '%s' "$dash" | head -c 300)"
echo "  OK — mở $GRAFANA (admin / mật khẩu GRAFANA_ADMIN_PASSWORD trong $ENV_FILE)"
