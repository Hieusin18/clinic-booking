/** Banner trên tab Đặt lịch (logic thuần để test được). */

export interface Banner {
  id: string;
  kind: 'NOTICE' | 'PROMO';
  title: string;
  body: string | null;
  /** "/doctor/<id>", "/book/<id>" (mở trong app) hoặc "https://…" */
  link: string | null;
  imageVersion: number | null;
}

export function bannerImageUri(apiUrl: string, b: Pick<Banner, 'id' | 'imageVersion'>) {
  return b.imageVersion == null ? null : `${apiUrl}/banners/${b.id}/image?v=${b.imageVersion}`;
}

/** Bấm banner mở đâu: màn trong app, trang web (chỉ https), hoặc không có gì */
export function bannerTarget(link: string | null): { app: string } | { web: string } | null {
  if (!link) return null;
  if (/^\/(doctor|book)\/[A-Za-z0-9-]+$/.test(link)) return { app: link };
  if (/^https:\/\/\S+$/.test(link)) return { web: link };
  return null;
}

/** Thông báo chưa bị ẩn và banner ảnh (đã có ảnh), giữ thứ tự máy chủ trả */
export function splitBanners(list: Banner[], dismissed: string[]) {
  return {
    notices: list.filter((b) => b.kind === 'NOTICE' && !dismissed.includes(b.id)),
    promos: list.filter((b) => b.kind === 'PROMO' && b.imageVersion != null),
  };
}

/** Giữ tối đa 50 id đã ẩn gần nhất */
export function addDismissed(prev: string[], id: string): string[] {
  return [...prev.filter((x) => x !== id), id].slice(-50);
}
