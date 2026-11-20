import { describe, expect, it } from 'vitest';
import { addDismissed, bannerImageUri, bannerTarget, splitBanners, type Banner } from './banner';

const b = (id: string, kind: Banner['kind'], imageVersion: number | null = null): Banner => ({ id, kind, title: id, body: null, link: null, imageVersion });

describe('banner', () => {
  it('link: trong app, web https, còn lại bỏ qua', () => {
    expect(bannerTarget('/doctor/abc-1')).toEqual({ app: '/doctor/abc-1' });
    expect(bannerTarget('https://phongkham.vn/goi-kham')).toEqual({ web: 'https://phongkham.vn/goi-kham' });
    expect(bannerTarget('http://x.vn')).toBeNull();
    expect(bannerTarget('javascript:alert(1)')).toBeNull();
    expect(bannerTarget(null)).toBeNull();
  });
  it('tách thông báo (bỏ cái đã ẩn) và banner ảnh (cần có ảnh)', () => {
    const r = splitBanners([b('n1', 'NOTICE'), b('n2', 'NOTICE'), b('p1', 'PROMO', 5), b('p2', 'PROMO')], ['n2']);
    expect(r.notices.map((x) => x.id)).toEqual(['n1']);
    expect(r.promos.map((x) => x.id)).toEqual(['p1']);
  });
  it('ảnh kèm phiên bản, danh sách đã ẩn giới hạn 50', () => {
    expect(bannerImageUri('http://api', b('p1', 'PROMO', 7))).toBe('http://api/banners/p1/image?v=7');
    expect(bannerImageUri('http://api', b('p2', 'PROMO'))).toBeNull();
    let list: string[] = [];
    for (let i = 0; i < 60; i++) list = addDismissed(list, `x${i}`);
    expect(list).toHaveLength(50);
    expect(addDismissed(['a', 'b'], 'a')).toEqual(['b', 'a']);
  });
});
