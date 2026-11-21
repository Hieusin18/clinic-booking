"""
Kiểm tra nhanh hệ thống vừa dựng, đi qua Caddy như người dùng thật:
đăng nhập, cấp số, gọi số (kèm sự kiện realtime qua WebSocket và long-polling), ghi bệnh án, tải PDF.
  pip install "python-socketio[client]" && python3 ci/smoke.py http://localhost
Cần dữ liệu mẫu (docker compose run --rm seed).
"""
import json, sys, threading, time, urllib.request, urllib.error
import socketio

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost").rstrip("/")


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            return r.status, r.headers.get("Content-Type", ""), data
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), e.read()


def ok(method, path, body=None, token=None, status=(200, 201)):
    code, ctype, data = call(method, path, body, token)
    if code not in status:
        sys.exit(f"LỖI {method} {path} → {code}: {data[:300]!r}")
    return json.loads(data) if "json" in ctype else data


def login(phone):
    return ok("POST", "/auth/login", {"phone": phone, "password": "123456"})["accessToken"]


def listen(token, transports):
    events, sio = [], socketio.Client(reconnection=False)
    sio.on("*", lambda e, *a: events.append(e))
    sio.connect(BASE, socketio_path="/api/socket.io", auth={"token": token}, transports=transports, wait_timeout=15)
    return sio, events


def wait_for(events, name, label):
    for _ in range(100):
        if name in events:
            print(f"  ✓ {label} nhận {name}")
            return
        time.sleep(0.1)
    sys.exit(f"LỖI {label} không nhận được sự kiện {name} (đã nhận: {events})")


reception, doctor_token = login("0900000002"), login("0910000001")
doctor = ok("GET", "/doctors/me", token=doctor_token)
print("✓ đăng nhập lễ tân, bác sĩ")
ws, ws_events = listen(reception, ["websocket"])
poll, poll_events = listen(reception, ["polling"])
print("✓ kết nối realtime qua /api/socket.io (WebSocket và long-polling)")

phone = "098" + str(int(time.time()))[-7:]
patient = ok("POST", "/patients", {"fullName": "Kiểm Tra Nhanh", "phone": phone, "dateOfBirth": "1990-01-01", "gender": "MALE"}, reception)
# overCapacity: bác sĩ mẫu có thể chưa mở ca hôm nay (quy định giới hạn vãng lai đang bật)
ticket = ok("POST", "/queue/tickets", {"patientId": patient["id"], "doctorId": doctor["id"], "reason": "Kiểm tra", "overCapacity": True}, reception)
print(f"✓ cấp số {ticket.get('label', ticket.get('queueNumber'))}")
wait_for(ws_events, "queue:changed", "WebSocket")
wait_for(poll_events, "queue:changed", "long-polling")

# Bỏ qua bước điều dưỡng đo sinh hiệu (quy định "đo trước khi khám" có thể đang bật)
called = ok("POST", "/queue/call-next?skipVitals=true", token=doctor_token)
wait_for(ws_events, "queue:called", "WebSocket")
ok("PUT", f"/visits/{called['id']}/record", {"symptoms": "Ho, sốt", "diagnosis": "Viêm họng cấp", "icdCode": "J02.9"}, doctor_token)
ok("POST", f"/visits/{called['id']}/complete", token=doctor_token)
pdf = ok("GET", f"/visits/{called['id']}/record.pdf", token=doctor_token)
if not pdf.startswith(b"%PDF-"):
    sys.exit("LỖI bệnh án PDF không hợp lệ")
print("✓ khám xong, tải bệnh án PDF")
code, _, _ = call("GET", "/metrics")
if code != 404:
    sys.exit(f"LỖI /api/metrics mở ra ngoài qua Caddy (trả {code})")
print("✓ /api/metrics không mở ra ngoài")
ws.disconnect()
poll.disconnect()
print("Kiểm tra nhanh: đạt")
