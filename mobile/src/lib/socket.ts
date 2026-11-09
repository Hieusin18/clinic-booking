/**
 * Địa chỉ Socket.IO đi cùng API (backend/src/realtime/realtime.ts mở ở "<API>/socket.io").
 * - "http://192.168.1.5:3000/api" → url "http://192.168.1.5:3000", path "/api/socket.io"
 * - "/api" (bản web khi dev, qua proxy của Metro) → cùng địa chỉ trang, path "/api/socket.io"
 */
export function socketTarget(apiUrl: string, origin?: string) {
  const u = new URL(apiUrl, origin ?? 'http://localhost');
  return { url: u.origin, path: `${u.pathname.replace(/\/$/, '')}/socket.io` };
}

/**
 * Máy chủ ngắt kết nối khi token đang dùng hết hiệu lực (đổi mật khẩu, đăng xuất mọi máy, bị khóa). Socket.IO không tự
 * nối lại trong trường hợp này; nếu máy này vừa nhận token mới (vd. chính nó vừa đổi mật khẩu) thì nối lại bằng token đó.
 */
export function reconnectWithNewToken(
  socket: { on(event: 'disconnect', fn: (reason: string) => void): unknown; connect(): unknown; auth: unknown },
  used: string,
  current: () => string | null,
) {
  let last = used;
  socket.on('disconnect', (reason) => {
    if (reason !== 'io server disconnect') return;
    const token = current();
    if (!token || token === last) return;
    last = token;
    socket.auth = { token };
    socket.connect();
  });
}

/** Dữ liệu của bệnh nhân mà sự kiện "phiếu đổi trạng thái" làm cũ: gọi lại API để lấy bản mới. */
export const PATIENT_LIVE_KEYS = [['queue', 'mine'], ['position'], ['visits', 'mine'], ['visit'], ['appointments']] as const;

/** Sự kiện gửi riêng cho bệnh nhân (phòng user:<id>) */
export interface VisitCalledEvent {
  visitId: string;
  label: string;
  room: string | null;
  recall: boolean;
}
