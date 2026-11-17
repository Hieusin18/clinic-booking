"""
So sánh API của backend cũ (NestJS) và backend mới (Spring Boot): chạy cùng một kịch bản trên cả hai
(dữ liệu mẫu giống nhau), so mã trạng thái, câu báo lỗi, cấu trúc JSON (tên trường, kiểu) và sự kiện Socket.IO.
  python3 compare_api.py http://127.0.0.1:3100 http://127.0.0.1:3200
"""
import io, json, sys, time, uuid, urllib.request, urllib.error, datetime, threading, zlib, struct
import socketio

PNG = None
def png(w=8, h=8):
    raw = b"".join(b"\x00" + b"\x80" * w for _ in range(h))
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

VN = datetime.timezone(datetime.timedelta(hours=7))

class Client:
    def __init__(self, base, label):
        self.base = base.rstrip("/") + "/api"
        self.root = base.rstrip("/")
        self.label = label
        self.results = {}     # tên bước -> (status, headers, body)
        self.tokens = {}
        self.events = {}      # role -> [(event, payload)]
        self.sockets = []

    def call(self, name, method, path, body=None, who=None, raw=None, ctype=None, headers=None):
        url = self.base + path
        data = None
        h = {"Accept": "application/json"}
        if who:
            h["Authorization"] = "Bearer " + self.tokens[who]
        if body is not None:
            data = json.dumps(body).encode()
            h["Content-Type"] = "application/json"
        if raw is not None:
            data = raw
            h["Content-Type"] = ctype
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, data=data, method=method.upper(), headers=h)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                status, hdrs, content = r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            status, hdrs, content = e.code, dict(e.headers), e.read()
        ct = hdrs.get("Content-Type", "") or ""
        if "json" in ct:
            try:
                parsed = json.loads(content.decode() or "null")
            except Exception:
                parsed = {"__invalid_json__": content[:200].decode(errors="replace")}
        else:
            parsed = {"__binary__": ct.split(";")[0].strip(), "__disposition__": "attachment" if "attachment" in (hdrs.get("Content-Disposition") or "") else ("inline" if "inline" in (hdrs.get("Content-Disposition") or "") else None)}
        if name:
            self.results[name] = (status, hdrs, parsed)
        return parsed

    def multipart(self, name, path, field, filename, content, ctype, who):
        boundary = "----cmp" + uuid.uuid4().hex
        body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\nContent-Type: {ctype}\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
        return self.call(name, "POST", path, raw=body, ctype="multipart/form-data; boundary=" + boundary, who=who)

    def login(self, who, phone, password="123456"):
        r = self.call("auth.login." + who, "POST", "/auth/login", {"phone": phone, "password": password})
        self.tokens[who] = r["accessToken"]

    def connect(self, who):
        sio = socketio.Client(reconnection=False)
        got = []
        def on_any(event, *args):
            got.append((event, args[0] if args else None))
        sio.on("*", on_any)
        sio.connect(self.root, socketio_path="/api/socket.io", auth={"token": self.tokens[who]}, transports=["websocket"], wait_timeout=10)
        self.events[who] = got
        self.sockets.append(sio)

    def close(self):
        for s in self.sockets:
            try:
                s.disconnect()
            except Exception:
                pass


def scenario(c: Client):
    now = datetime.datetime.now(VN)
    today = now.date().isoformat()
    tomorrow = (now + datetime.timedelta(days=1)).date().isoformat()
    c.call("health", "GET", "/health")
    for who, phone in [("admin", "0900000001"), ("reception", "0900000002"), ("patient", "0900000003"), ("doctor", "0910000001")]:
        c.login(who, phone)
        c.call("auth.me." + who, "GET", "/auth/me", who=who)
    c.call("auth.login.sai", "POST", "/auth/login", {"phone": "0900000001", "password": "sai-mat-khau"})
    c.call("auth.login.thieu", "POST", "/auth/login", {"phone": "123"})
    c.call("auth.me.khong-token", "GET", "/auth/me")
    reg = c.call("auth.register", "POST", "/auth/register", {"fullName": "Bệnh Nhân Mới", "phone": "0987650001", "password": "xuanhoa2026", "dateOfBirth": "1992-03-04", "gender": "FEMALE", "email": "moi@example.com"})
    c.tokens["newpatient"] = reg.get("accessToken", "")
    c.call("auth.register.trung", "POST", "/auth/register", {"fullName": "Bệnh Nhân Mới", "phone": "0987650001", "password": "xuanhoa2026", "dateOfBirth": "1992-03-04", "gender": "FEMALE"})
    c.call("auth.register.yeu", "POST", "/auth/register", {"fullName": "Yếu", "phone": "0987650002", "password": "123", "dateOfBirth": "1992-03-04", "gender": "MALE"})

    for who in ["reception", "patient", "doctor"]:
        c.connect(who)

    # Danh mục
    c.call("specialties.list", "GET", "/specialties")
    sp = c.call("specialties.create", "POST", "/specialties", {"name": "Khoa So Sánh", "description": "mô tả"}, who="admin")
    c.call("specialties.create.trung", "POST", "/specialties", {"name": "Khoa So Sánh"}, who="admin")
    c.call("specialties.patch", "PATCH", f"/specialties/{sp['id']}", {"description": "mới"}, who="admin")
    c.call("specialties.create.cam", "POST", "/specialties", {"name": "Khoa Cấm"}, who="doctor")
    meds = c.call("medicines.list", "GET", "/medicines", who="doctor")
    med = c.call("medicines.create", "POST", "/medicines", {"name": "Thuốc So Sánh", "activeIngredient": "Paracetamol", "strength": "500mg", "unit": "viên"}, who="admin")
    c.call("medicines.patch", "PATCH", f"/medicines/{med['id']}", {"strength": "650mg"}, who="admin")
    c.call("medicines.search", "GET", "/medicines?q=para", who="doctor")
    docs = c.call("doctors.list", "GET", "/doctors")
    c.call("doctors.list.specialty", "GET", f"/doctors?specialtyId={docs['items'][0]['specialtyId']}&page=1&pageSize=5")
    c.call("doctors.all", "GET", "/doctors/all", who="admin")
    me = c.call("doctors.me", "GET", "/doctors/me", who="doctor")
    did = me["id"]
    c.call("doctors.one", "GET", f"/doctors/{did}")
    c.call("doctors.full", "GET", f"/doctors/{did}/full", who="admin")
    c.call("doctors.availability", "GET", f"/doctors/{did}/availability")
    c.call("doctors.patch.me", "PATCH", "/doctors/me", {"bio": "Giới thiệu", "practiceSince": 2012, "expertise": ["Tim mạch"], "career": [{"fromYear": 2012, "title": "Bác sĩ", "place": "Bệnh viện A"}], "education": [{"fromYear": 2006, "toYear": 2012, "title": "Bác sĩ đa khoa", "place": "Đại học Y"}]}, who="doctor")
    c.call("doctors.patch.admin", "PATCH", f"/doctors/{did}", {"room": "Phòng 3", "title": "ThS.BS"}, who="admin")
    c.call("doctors.patch.sai", "PATCH", f"/doctors/{did}", {"practiceSince": 2999}, who="admin")
    nd = c.call("doctors.create", "POST", "/doctors", {"fullName": "Bác Sĩ Mới", "phone": "0987650003", "password": "batdau2026", "specialtyId": sp["id"], "email": "bsmoi@example.com"}, who="admin")
    c.multipart("doctors.avatar.me", "/doctors/me/avatar", "file", "a.png", png(), "image/png", "doctor")
    c.call("doctors.avatar.get", "GET", f"/doctors/{did}/avatar")
    c.multipart("doctors.avatar.admin", f"/doctors/{nd.get('id', 'x')}/avatar", "file", "a.png", png(), "image/png", "admin")
    c.multipart("doctors.avatar.sai", "/doctors/me/avatar", "file", "a.png", b"<svg/>", "image/png", "doctor")
    c.call("doctors.avatar.delete", "DELETE", f"/doctors/{nd.get('id', 'x')}/avatar", who="admin")
    c.call("doctors.avatar.delete.me", "DELETE", "/doctors/me/avatar", who="doctor")
    c.call("staff.list", "GET", "/staff/receptionists", who="admin")
    rc = c.call("staff.create", "POST", "/staff/receptionists", {"fullName": "Lễ Tân Mới", "phone": "0987650004", "password": "tieptan2026"}, who="admin")
    c.call("staff.patch", "PATCH", f"/staff/receptionists/{rc.get('id', 'x')}", {"fullName": "Lễ Tân Đổi Tên"}, who="admin")
    c.call("users.reset", "POST", f"/users/{rc.get('id', 'x')}/reset-password", who="admin")
    c.call("icd10", "GET", "/icd10?q=viem%20hong", who="doctor")

    # Lịch khám
    start = (now + datetime.timedelta(minutes=20)).replace(second=0, microsecond=0)
    start = start.replace(minute=(start.minute // 5) * 5)
    end = start + datetime.timedelta(minutes=30)
    same_day = start.date() == end.date() == now.date()
    slots_today = c.call("schedules.bulk.today", "POST", "/schedules/bulk", {"date": today, "start": start.strftime("%H:%M"), "end": end.strftime("%H:%M"), "slotMinutes": 15}, who="doctor") if same_day else {}
    c.call("schedules.bulk.tomorrow", "POST", "/schedules/bulk", {"date": tomorrow, "start": "08:00", "end": "09:00", "slotMinutes": 15}, who="doctor")
    c.call("schedules.bulk.sai", "POST", "/schedules/bulk", {"date": tomorrow, "start": "9h", "end": "10:00", "slotMinutes": 15}, who="doctor")
    mine = c.call("schedules.mine", "GET", f"/schedules/mine?from={today}&to={tomorrow}", who="doctor")
    c.call("schedules.doctor.day", "GET", f"/doctors/{did}/schedules?date={tomorrow}")
    c.call("schedules.doctor.all", "GET", f"/doctors/{did}/schedules?date={tomorrow}&all=true", who="doctor")
    tomorrow_slots = [s for s in mine if s["date"].startswith(tomorrow)]
    c.call("schedules.delete", "DELETE", f"/schedules/{tomorrow_slots[-1]['id']}", who="doctor")

    # Đặt lịch
    c.call("appointments.standing", "GET", "/appointments/standing", who="patient")
    ap = c.call("appointments.book", "POST", "/appointments", {"scheduleId": tomorrow_slots[0]["id"], "reason": "Khám tổng quát"}, who="patient")
    c.call("appointments.book.trung", "POST", "/appointments", {"scheduleId": tomorrow_slots[0]["id"]}, who="patient")
    c.call("appointments.mine", "GET", "/appointments/mine", who="patient")
    c.call("appointments.mine.past", "GET", "/appointments/mine?when=past", who="patient")
    c.call("appointments.cancel", "PATCH", f"/appointments/{ap['id']}/cancel", who="patient")
    c.call("appointments.cancel.lai", "PATCH", f"/appointments/{ap['id']}/cancel", who="patient")
    today_ap = None
    if same_day:
        today_slots = [s for s in mine if s["date"].startswith(today)]
        today_ap = c.call("appointments.book.today", "POST", "/appointments", {"scheduleId": today_slots[0]["id"], "reason": "Đau đầu"}, who="patient")
    c.call("appointments.byday", "GET", f"/appointments?date={tomorrow}", who="reception")
    c.call("appointments.byday.today", "GET", f"/appointments?date={today}", who="reception")

    # Hồ sơ bệnh nhân
    c.call("patients.search", "GET", "/patients?q=0900", who="reception")
    p = c.call("patients.create", "POST", "/patients", {"fullName": "Vãng Lai Một", "phone": "0987650005", "dateOfBirth": "1970-01-02", "gender": "MALE", "nationalId": "001070000111", "address": "Hà Nội", "allergies": "Không"}, who="reception")
    c.call("patients.create.trung", "POST", "/patients", {"fullName": "Vãng Lai Một", "phone": "0987650005", "dateOfBirth": "1970-01-02", "gender": "MALE"}, who="reception")
    c.call("patients.create.sai", "POST", "/patients", {"fullName": "X", "phone": "12", "dateOfBirth": "1970-13-02", "gender": "KHAC"}, who="reception")
    c.call("patients.one", "GET", f"/patients/{p['id']}", who="reception")
    c.call("patients.patch", "PATCH", f"/patients/{p['id']}", {"occupation": "Kỹ sư", "insuranceExpiry": "2027-01-01"}, who="reception")
    c.call("patients.me", "GET", "/patients/me", who="patient")
    c.call("patients.me.patch", "PATCH", "/patients/me", {"address": "Cầu Giấy"}, who="patient")
    c.call("patients.me.link", "GET", "/patients/me/link", who="patient")
    c.call("patients.me.verify.sai", "POST", "/patients/me/verify", {"code": "ZZZZZZ"}, who="patient")
    c.call("patients.account", "GET", f"/patients/{p['id']}/account", who="reception")
    c.call("patients.uuid.sai", "GET", "/patients/khong-phai-uuid", who="reception")

    # QR, cấp số, check-in
    qr = c.call("qr.current", "GET", "/qr/current", who="reception")
    c.call("queue.scan", "POST", "/queue/scan", {"token": qr.get("token", ""), "doctorId": did, "reason": "Ho"}, who="newpatient")
    c.call("queue.scan.sai", "POST", "/queue/scan", {"token": "sai", "doctorId": did}, who="newpatient")
    t1 = c.call("queue.ticket", "POST", "/queue/tickets", {"patientId": p["id"], "doctorId": did, "reason": "Sốt"}, who="reception")
    c.call("queue.ticket.trung", "POST", "/queue/tickets", {"patientId": p["id"], "doctorId": did}, who="reception")
    if today_ap:
        c.call("queue.checkin", "POST", "/queue/checkin", {"appointmentId": today_ap["id"]}, who="reception")
    c.call("queue.today", "GET", "/queue/today", who="reception")
    c.call("queue.today.doctor", "GET", f"/queue/today?doctorId={did}", who="reception")
    mineq = c.call("queue.mine", "GET", "/queue/mine", who="patient")
    c.call("queue.mine.new", "GET", "/queue/mine", who="newpatient")
    if isinstance(mineq, list) and mineq:
        c.call("queue.position", "GET", f"/queue/{mineq[0]['id']}/position", who="patient")
    c.call("queue.doctor", "GET", "/queue/doctor", who="doctor")
    v1 = c.call("queue.callnext", "POST", "/queue/call-next", who="doctor")
    c.call("queue.recall", "POST", f"/queue/{v1['id']}/recall", who="doctor")
    c.call("queue.recall.cam", "POST", f"/queue/{v1['id']}/recall", who="reception")
    vid = v1["id"]

    # Khám: bệnh án, cận lâm sàng, đơn thuốc
    c.call("visits.one.empty", "GET", f"/visits/{vid}", who="doctor")
    c.call("visits.record.pdf.chua", "GET", f"/visits/{vid}/record.pdf", who="doctor")
    rec = {"reason": "Sốt", "symptoms": "Sốt cao 2 ngày", "pulse": 90, "temperature": 38.5, "bpSystolic": 120, "bpDiastolic": 80, "respiratoryRate": 18, "spo2": 98, "weight": 60, "height": 165, "diagnosis": "Viêm họng cấp", "icdCode": "j02.9", "secondaryIcdCodes": "J30.4", "treatment": "Hạ sốt", "followUpDate": tomorrow}
    c.call("visits.record", "PUT", f"/visits/{vid}/record", rec, who="doctor")
    c.call("visits.record.sai", "PUT", f"/visits/{vid}/record", {**rec, "bpDiastolic": None}, who="doctor")
    c.call("visits.record.sai2", "PUT", f"/visits/{vid}/record", {**rec, "icdCode": "abc", "temperature": 50}, who="doctor")
    lo = c.call("lab.order", "POST", f"/visits/{vid}/lab-orders", {"name": "X-quang ngực", "note": "Thẳng"}, who="doctor")
    lo2 = c.call("lab.order2", "POST", f"/visits/{vid}/lab-orders", {"name": "Công thức máu"}, who="doctor")
    c.call("lab.order.delete", "DELETE", f"/lab-orders/{lo2['id']}", who="doctor")
    c.call("lab.send", "POST", f"/visits/{vid}/send-for-tests", {"mode": "RETURN"}, who="doctor")
    c.call("lab.awaiting", "GET", "/lab/awaiting-visits", who="doctor")
    c.call("lab.ready.chua", "POST", f"/visits/{vid}/results-ready", who="doctor")
    up = c.multipart("lab.file", f"/lab-orders/{lo['id']}/files", "file", "phim.png", png(20, 10), "image/png", "doctor")
    up2 = c.multipart("lab.file.pdf", f"/lab-orders/{lo['id']}/files", "file", "ket-qua.pdf", b"%PDF-1.4\n%%EOF\n", "application/pdf", "doctor")
    c.multipart("lab.file.sai", f"/lab-orders/{lo['id']}/files", "file", "x.exe", b"MZ", "application/octet-stream", "doctor")
    c.call("lab.result", "PATCH", f"/lab-orders/{lo['id']}", {"resultText": "Bình thường", "done": True}, who="doctor")
    files = (up2 or {}).get("files") or []
    if files:
        c.call("lab.file.get", "GET", files[-1]["url"])
        c.call("lab.file.delete", "DELETE", f"/lab-files/{files[-1]['id']}", who="doctor")
    c.call("lab.ready", "POST", f"/visits/{vid}/results-ready", who="doctor")
    c.call("queue.call.back", "POST", f"/queue/{vid}/call", who="doctor")
    rx = c.call("rx.create", "POST", f"/visits/{vid}/prescriptions", {"advice": "Uống nhiều nước", "items": [{"medicineId": med["id"], "quantity": 10, "dosePerTime": "1 viên", "timesPerDay": 2, "days": 5, "note": "sau ăn"}]}, who="doctor")
    c.call("rx.create.trung", "POST", f"/visits/{vid}/prescriptions", {"items": [{"medicineId": med["id"], "quantity": 1, "dosePerTime": "1", "timesPerDay": 1, "days": 1}]}, who="doctor")
    c.call("rx.patch", "PATCH", f"/prescriptions/{rx['id']}", {"advice": "Nghỉ ngơi", "items": [{"medicineId": med["id"], "quantity": 12, "dosePerTime": "1 viên", "timesPerDay": 2, "days": 6}]}, who="doctor")
    c.call("rx.finalize", "POST", f"/prescriptions/{rx['id']}/finalize", who="doctor")
    c.call("rx.patch.da-xong", "PATCH", f"/prescriptions/{rx['id']}", {"items": [{"medicineId": med["id"], "quantity": 1, "dosePerTime": "1", "timesPerDay": 1, "days": 1}]}, who="doctor")
    rx2 = c.call("rx.replace", "POST", f"/visits/{vid}/prescriptions", {"items": [{"medicineId": meds[0]["id"] if isinstance(meds, list) and meds else med["id"], "quantity": 4, "dosePerTime": "1 gói", "timesPerDay": 2, "days": 2}]}, who="doctor")
    c.call("rx.delete", "DELETE", f"/prescriptions/{rx2['id']}", who="doctor")
    c.call("visits.one", "GET", f"/visits/{vid}", who="doctor")
    c.call("visits.complete", "POST", f"/visits/{vid}/complete", who="doctor")
    c.call("visits.one.reception", "GET", f"/visits/{vid}", who="reception")
    c.call("visits.history", "GET", f"/visits/history?patientId={p['id']}", who="doctor")
    c.call("visits.examined", "GET", "/visits/examined?page=1&pageSize=5", who="doctor")
    c.call("visits.examined.q", "GET", "/visits/examined?q=viem", who="doctor")
    c.call("visits.record.pdf", "GET", f"/visits/{vid}/record.pdf", who="doctor")
    c.call("visits.record.docx", "GET", f"/visits/{vid}/record.docx", who="doctor")
    c.call("visits.record.html", "GET", f"/visits/{vid}/record.html", who="doctor")
    # Người tiếp theo: bỏ về
    v2 = c.call("queue.callnext2", "POST", "/queue/call-next", who="doctor")
    if isinstance(v2, dict) and v2.get("id"):
        c.call("queue.left", "PATCH", f"/queue/{v2['id']}/left", who="doctor")
    c.call("queue.callnext.het", "POST", "/queue/call-next", who="doctor")

    # Bệnh nhân xem lại
    c.call("visits.mine", "GET", "/visits/mine", who="patient")
    c.call("visits.mine.new", "GET", "/visits/mine", who="newpatient")

    # Thông báo
    c.call("notif.push", "POST", "/notifications/push-token", {"token": "ExponentPushToken[cmp]", "platform": "ios"}, who="patient")
    c.call("notif.push.sai", "POST", "/notifications/push-token", {"token": "abc", "platform": "ios"}, who="patient")
    c.call("notif.mine", "GET", "/notifications/mine", who="patient")
    c.call("notif.mine.limit", "GET", "/notifications/mine?limit=2", who="patient")
    c.call("notif.read.sai", "POST", "/notifications/read", {}, who="patient")
    c.call("notif.read.all", "POST", "/notifications/read", {"all": True}, who="patient")
    c.call("notif.remove", "POST", "/notifications/push-token/remove", {"token": "ExponentPushToken[cmp]"}, who="patient")
    c.call("notif.staff", "GET", "/notifications/mine", who="doctor")

    # Liên kết tài khoản (lễ tân)
    c.call("patients.account.verify", "POST", f"/patients/{p['id']}/account/verify", who="reception")
    c.call("patients.account.detach", "POST", f"/patients/{p['id']}/account/detach", who="reception")

    # Thống kê, SMS
    c.call("stats", "GET", f"/stats/overview?from={today}&to={tomorrow}", who="admin")
    c.call("stats.sai", "GET", f"/stats/overview?from={tomorrow}&to={today}", who="admin")
    c.call("sms.config", "GET", "/sms/config", who="admin")
    pv = c.call("verify.start", "POST", "/auth/phone-verifications", {"phone": "0987650009", "purpose": "REGISTER"})
    c.call("verify.status", "GET", f"/auth/phone-verifications/{pv.get('id')}?ticket={pv.get('ticket')}")
    c.call("sms.inbound", "POST", "/sms/inbound", {"from": "0987650009", "body": "PKXM " + str(pv.get("code"))}, headers={"X-Gateway-Token": "cmp-gateway-token"})
    c.call("sms.inbound.sai", "POST", "/sms/inbound", {"from": "0987650009", "body": "x"})
    c.call("sms.list", "GET", "/sms/inbound", who="admin")
    c.call("verify.start.reset.khong-co", "POST", "/auth/phone-verifications", {"phone": "0999999998", "purpose": "RESET_PASSWORD"})

    # Tài khoản
    c.call("auth.change.sai", "POST", "/auth/change-password", {"currentPassword": "sai", "newPassword": "doimatkhau2026"}, who="newpatient")
    ch = c.call("auth.change", "POST", "/auth/change-password", {"currentPassword": "xuanhoa2026", "newPassword": "doimatkhau2026"}, who="newpatient")
    c.tokens["newpatient"] = ch.get("accessToken", "")
    c.call("auth.logoutall", "POST", "/auth/logout-all", who="newpatient")
    c.call("auth.me.sau-logout", "GET", "/auth/me", who="newpatient")
    c.call("unknown", "GET", "/khong-co-api")
    c.call("metrics.text", "GET", "/metrics")
    time.sleep(2)


def shape(v):
    if isinstance(v, dict):
        return {k: shape(x) for k, x in v.items()}
    if isinstance(v, list):
        merged = None
        for x in v:
            merged = merge(merged, shape(x))
        return ["list", merged]
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, (int, float)):
        return "num"
    if v is None:
        return "null"
    return "str"

def merge(a, b):
    if a is None or a == "null":
        return b
    if b is None or b == "null":
        return a
    if isinstance(a, dict) and isinstance(b, dict):
        return {k: merge(a.get(k), b.get(k)) for k in set(a) | set(b)}
    if isinstance(a, list) and isinstance(b, list):
        return ["list", merge(a[1], b[1])]
    return a

def diff(a, b, path, out):
    if a is None or b is None or a == "null" or b == "null":
        return
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) - set(b)):
            out.append(f"{path}.{k}: Java THIẾU trường")
        for k in sorted(set(b) - set(a)):
            out.append(f"{path}.{k}: Java THỪA trường")
        for k in sorted(set(a) & set(b)):
            diff(a[k], b[k], f"{path}.{k}", out)
        return
    if isinstance(a, list) and isinstance(b, list):
        diff(a[1], b[1], path + "[]", out)
        return
    if type(a) != type(b) or (isinstance(a, str) and a != b):
        out.append(f"{path}: kiểu khác (Nest {json.dumps(a, ensure_ascii=False)[:60]} / Java {json.dumps(b, ensure_ascii=False)[:60]})")


def main():
    ts, jv = Client(sys.argv[1], "nest"), Client(sys.argv[2], "java")
    for c in (ts, jv):
        try:
            scenario(c)
        except Exception as e:
            import traceback
            print(f"!! Kịch bản dừng ở backend {c.label}: {e!r}")
            traceback.print_exc()
        finally:
            c.close()
    problems = 0
    names = list(dict.fromkeys(list(ts.results) + list(jv.results)))
    print(f"So sánh {len(names)} bước")
    for n in names:
        a, b = ts.results.get(n), jv.results.get(n)
        if not a or not b:
            print(f"[{n}] chỉ chạy được trên {'Nest' if a else 'Java'}")
            problems += 1
            continue
        out = []
        if a[0] != b[0]:
            out.append(f"mã trạng thái Nest {a[0]} / Java {b[0]}")
        if a[0] >= 400 and isinstance(a[2], dict) and isinstance(b[2], dict) and a[2].get("message") != b[2].get("message"):
            out.append(f"câu báo lỗi Nest {json.dumps(a[2].get('message'), ensure_ascii=False)} / Java {json.dumps(b[2].get('message'), ensure_ascii=False)}")
        if n == "metrics.text":
            pass
        else:
            diff(shape(a[2]), shape(b[2]), "$", out)
            if isinstance(a[2], list) and isinstance(b[2], list) and len(a[2]) != len(b[2]):
                out.append(f"số phần tử Nest {len(a[2])} / Java {len(b[2])}")
        if out:
            problems += 1
            print(f"[{n}] {a[0]}")
            for o in out[:40]:
                print("   -", o)
    # Sự kiện realtime
    for who in ts.events:
        ea, eb = ts.events.get(who, []), jv.events.get(who, [])
        na, nb = [e for e, _ in ea], [e for e, _ in eb]
        if sorted(set(na)) != sorted(set(nb)) or len(na) != len(nb):
            problems += 1
            print(f"[socket {who}] sự kiện Nest {na} / Java {nb}")
        for ev in sorted(set(na) & set(nb)):
            sa = None; sb = None
            for e, d in ea:
                if e == ev: sa = merge(sa, shape(d))
            for e, d in eb:
                if e == ev: sb = merge(sb, shape(d))
            out = []
            diff(sa, sb, "$", out)
            if out:
                problems += 1
                print(f"[socket {who} {ev}]")
                for o in out:
                    print("   -", o)
    print(f"Tổng: {problems} bước có khác biệt")
    with open("compare-result.json", "w") as f:
        json.dump({"nest": {k: [v[0], v[2]] for k, v in ts.results.items()}, "java": {k: [v[0], v[2]] for k, v in jv.results.items()},
                   "events": {"nest": ts.events, "java": jv.events}}, f, ensure_ascii=False, indent=1, default=str)

if __name__ == "__main__":
    main()
