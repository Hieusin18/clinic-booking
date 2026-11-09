/** Tệp kết quả cận lâm sàng: nhận diện loại tệp, tên tệp và đường dẫn có chữ ký. */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const LAB_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const LAB_FILES_PER_ORDER = 10;
const LINK_TTL_MS = 60 * 60_000;

/** Nhận diện tệp theo nội dung, không tin phần mở rộng hay Content-Type trình duyệt gửi lên. */
export function detectLabFile(buf: Buffer): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** Tên tệp multer đọc theo latin1; đổi về UTF-8 để giữ dấu tiếng Việt, bỏ đường dẫn và ký tự điều khiển. */
export function cleanFileName(raw: string | undefined, mimeType: string) {
  const utf8 = Buffer.from(raw ?? '', 'latin1').toString('utf8');
  const base = utf8
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f"]/g, '')
    .trim()
    .slice(0, 120);
  return base || `ket-qua.${mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg'}`;
}

const sign = (secret: string, id: string, exp: number) => createHmac('sha256', secret).update(`lab-file:${id}:${exp}`).digest('base64url');

/** Đường dẫn (tương đối với /api) mở một tệp kết quả, hết hạn sau 1 giờ. */
export function signedFilePath(secret: string, id: string, now = Date.now()) {
  const exp = now + LINK_TTL_MS;
  return `/lab-files/${id}?exp=${exp}&sig=${sign(secret, id, exp)}`;
}

export function verifyFileLink(secret: string, id: string, exp: string, sig: string, now = Date.now()) {
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < now) return false;
  const want = Buffer.from(sign(secret, id, expMs));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Chỉ định kèm kết quả và tệp (chỉ thông tin tệp, không kèm dữ liệu). */
export const labOrderView = {
  id: true,
  name: true,
  note: true,
  resultText: true,
  doneAt: true,
  createdAt: true,
  files: { select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
} as const;

export type LabOrderRow = {
  id: string;
  name: string;
  note: string | null;
  resultText: string | null;
  doneAt: Date | null;
  createdAt: Date;
  files: { id: string; fileName: string; mimeType: string; size: number; createdAt: Date }[];
};

/**
 * Thêm đường dẫn có chữ ký cho từng tệp. `hideResults` = bệnh nhân xem khi bác sĩ chưa hoàn tất lượt khám:
 * chỉ thấy tên chỉ định, chưa thấy kết quả.
 */
export function presentLabOrders(secret: string, orders: LabOrderRow[], hideResults = false) {
  return orders.map((o) => ({
    ...o,
    resultText: hideResults ? null : o.resultText,
    doneAt: hideResults ? null : o.doneAt,
    files: hideResults ? [] : o.files.map((f) => ({ ...f, url: signedFilePath(secret, f.id) })),
  }));
}
