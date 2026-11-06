import { BadRequestException } from '@nestjs/common';

/** Một mốc trong quá trình đào tạo hoặc công tác. `toYear` null = đến nay. */
export interface HistoryEntry {
  fromYear: number;
  toYear?: number | null;
  title: string;
  place: string;
}

/** Năm hiện tại theo giờ Việt Nam. */
export const currentYearVN = (now = new Date()) => Number(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 4));

/** Thế mạnh lưu mỗi dòng một mục; API trả và nhận dạng mảng. */
export const splitExpertise = (s: string | null) => (s ?? '').split('\n').filter(Boolean);
export const joinExpertise = (items: string[]) => {
  const clean = [...new Set(items.map((i) => i.trim()).filter(Boolean))];
  return clean.length ? clean.join('\n') : null;
};

/** Số năm kinh nghiệm tính từ năm bắt đầu hành nghề. */
export const experienceYears = (practiceSince: number | null, now = new Date()) =>
  practiceSince == null ? null : Math.max(0, currentYearVN(now) - practiceSince);

/** Kiểm tra năm hợp lệ: không ở tương lai, năm kết thúc không trước năm bắt đầu. */
export function checkYears(practiceSince: number | null | undefined, entries: HistoryEntry[], now = new Date()) {
  const year = currentYearVN(now);
  if (practiceSince != null && practiceSince > year) throw new BadRequestException('Năm bắt đầu hành nghề không được sau năm hiện tại');
  for (const e of entries) {
    if (e.fromYear > year) throw new BadRequestException(`"${e.title}": năm bắt đầu không được sau năm hiện tại`);
    if (e.toYear != null && e.toYear < e.fromYear) throw new BadRequestException(`"${e.title}": năm kết thúc phải từ năm bắt đầu trở đi`);
    if (e.toYear != null && e.toYear > year) throw new BadRequestException(`"${e.title}": năm kết thúc không được sau năm hiện tại, việc đang làm thì để trống`);
  }
}

/** Mốc gần nhất trước: việc đang làm ("đến nay") đứng đầu, rồi theo năm kết thúc và năm bắt đầu giảm dần. */
export function newestFirst<T extends { fromYear: number; toYear: number | null }>(entries: T[]): T[] {
  const end = (e: T) => e.toYear ?? Number.POSITIVE_INFINITY;
  return [...entries].sort((a, b) => end(b) - end(a) || b.fromYear - a.fromYear);
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Nhận diện ảnh theo vài byte đầu (không tin phần mở rộng hay Content-Type người gửi khai). */
export function detectImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
