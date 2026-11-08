/**
 * Mở màn soạn tin nhắn có sẵn người nhận và nội dung. iOS dùng "&body=", Android dùng "?body=".
 * Hệ điều hành không cho ứng dụng tự gửi: người dùng vẫn phải bấm Gửi.
 */
export function smsUrl(to: string, body: string, os: string) {
  return `sms:${to}${os === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

/** "PKXM 482913" → hiển thị mã "482 913" cho dễ đọc */
export const spacedCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** Số giây còn lại tới hạn (không âm) */
export const secondsLeft = (expiresAt: string, now = Date.now()) => Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));

/** "9:05" */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
