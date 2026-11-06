#!/usr/bin/env bash
# Dựng máy CI, cấu hình SonarQube + Jenkins tự động, chạy Jenkinsfile của nhánh hiện tại và chờ kết quả.
# Dùng trong GitHub Actions: REPO_URL=... BRANCH=... bash ci/test/run-pipeline.sh
set -euo pipefail
cd "$(dirname "$0")/.."            # thư mục ci/

note() { echo "::group::$*"; }
fail() { echo "::error title=$1::$(printf '%s' "$2" | sed ':a;N;$!ba;s/%/%25/g;s/\r/%0D/g;s/\n/%0A/g')"; exit 1; }
wait_for() { for i in $(seq 1 "$2"); do eval "$1" && return 0; sleep 5; done; return 1; }

note "SonarQube: dựng và lấy token"
docker compose -f docker-compose.yml up -d sonar-db sonarqube
wait_for 'curl -s http://localhost:9000/api/system/status | grep -q "\"status\":\"UP\""' 60 || fail sonarqube "SonarQube không lên"
curl -sf -u admin:admin -X POST "http://localhost:9000/api/users/change_password" \
  --data-urlencode "login=admin" --data-urlencode "previousPassword=admin" --data-urlencode "password=Ci-Test-Admin-123!" >/dev/null
SONAR_TOKEN=$(curl -sf -u "admin:Ci-Test-Admin-123!" -X POST "http://localhost:9000/api/user_tokens/generate" \
  --data-urlencode "name=jenkins" --data-urlencode "type=GLOBAL_ANALYSIS_TOKEN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$SONAR_TOKEN" ] || fail sonarqube "Không tạo được token"
curl -sf -u "admin:Ci-Test-Admin-123!" -X POST "http://localhost:9000/api/webhooks/create" \
  --data-urlencode "name=jenkins" --data-urlencode "url=http://jenkins:8080/sonarqube-webhook/" >/dev/null
export SONAR_TOKEN
echo "::endgroup::"

note "Jenkins: dựng với cấu hình JCasC"
SCANNER_VERSION=$(curl -s https://updates.jenkins.io/updates/hudson.plugins.sonar.SonarRunnerInstaller.json \
  | sed 's/^[^{]*//; s/);*$//' | python3 -c 'import json,sys; print(json.load(sys.stdin)["list"][0]["id"])')
export SCANNER_VERSION
echo "sonar-scanner $SCANNER_VERSION"
cp ../.env.example test/app.env
docker compose -f docker-compose.yml -f test/docker-compose.test.yml up -d --build jenkins
wait_for 'curl -sf -o /dev/null http://localhost:8080/api/json' 60 || fail jenkins "$(docker compose -f docker-compose.yml logs --tail 40 jenkins)"
echo "::endgroup::"

note "Jenkins: tạo job và chạy"
J=http://localhost:8080
JAR=$(mktemp)
CRUMB=$(curl -sf -c "$JAR" "$J/crumbIssuer/api/json" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["crumbRequestField"]+":"+d["crumb"])')
sed -e "s#__REPO_URL__#$REPO_URL#" -e "s#__BRANCH__#$BRANCH#" test/job.xml > /tmp/job.xml
curl -sf -b "$JAR" -H "$CRUMB" -H 'Content-Type: application/xml' --data-binary @/tmp/job.xml "$J/createItem?name=clinic-booking"
curl -sf -b "$JAR" -H "$CRUMB" -X POST "$J/job/clinic-booking/build"
wait_for 'curl -sf "$J/job/clinic-booking/1/api/json" >/dev/null' 30 || fail jenkins "Build không bắt đầu"
echo "::endgroup::"

note "Chờ pipeline chạy xong"
for i in $(seq 1 240); do
  info=$(curl -sf "$J/job/clinic-booking/1/api/json?tree=building,result")
  echo "$info" | grep -q '"building":false' && break
  sleep 10
done
RESULT=$(curl -sf "$J/job/clinic-booking/1/api/json?tree=result" | sed -n 's/.*"result":"\([A-Z]*\)".*/\1/p')
curl -sf "$J/job/clinic-booking/1/consoleText" > console.txt || true
grep -E '^\[Pipeline\] (stage|\{ \()' console.txt | sed 's/\[Pipeline\] //' | head -40 || true
echo "::endgroup::"
echo "Kết quả pipeline: $RESULT"

if [ "$RESULT" != "SUCCESS" ]; then
  fail "pipeline $RESULT" "$(grep -vE '^\[Pipeline\]' console.txt | grep -v '^\s*$' | tail -n 60)"
fi
QG=$(curl -s -u "admin:Ci-Test-Admin-123!" "http://localhost:9000/api/qualitygates/project_status?projectKey=clinic-booking")
echo "Quality Gate: $QG"
curl -sf http://localhost/api/health && echo " ← hệ thống vừa deploy đang chạy"
