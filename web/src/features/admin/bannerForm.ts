import type { Dayjs } from 'dayjs';

export interface AdminBanner {
  id: string;
  kind: 'NOTICE' | 'PROMO';
  title: string;
  body: string | null;
  link: string | null;
  imageVersion: number | null;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  active: boolean;
  state: 'SHOWING' | 'SCHEDULED' | 'EXPIRED' | 'OFF';
  updatedAt: string;
}

export type LinkType = 'none' | 'doctor' | 'book' | 'web';
export type BannerForm = {
  kind: AdminBanner['kind'];
  title: string;
  body?: string;
  linkType: LinkType;
  doctorId?: string;
  url?: string;
  range?: [Dayjs | null, Dayjs | null] | null;
  sortOrder?: number;
  active: boolean;
};

/** Đọc link đã lưu thành lựa chọn trên form */
export function parseLink(link: string | null): Pick<BannerForm, 'linkType' | 'doctorId' | 'url'> {
  if (!link) return { linkType: 'none' };
  const m = /^\/(doctor|book)\/(.+)$/.exec(link);
  if (m) return { linkType: m[1] as 'doctor' | 'book', doctorId: m[2] };
  return { linkType: 'web', url: link };
}

/** Form → dữ liệu gửi API */
export function toPayload(f: BannerForm) {
  const link = f.linkType === 'doctor' || f.linkType === 'book' ? (f.doctorId ? `/${f.linkType}/${f.doctorId}` : null) : f.linkType === 'web' ? f.url?.trim() || null : null;
  return {
    kind: f.kind,
    title: f.title.trim(),
    body: f.body?.trim() || null,
    link,
    startsAt: f.range?.[0] ? f.range[0].toISOString() : null,
    endsAt: f.range?.[1] ? f.range[1].toISOString() : null,
    sortOrder: f.sortOrder ?? 0,
    active: f.active,
  };
}

