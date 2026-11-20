/** Logic thuần của đánh giá sau khi khám (không phụ thuộc React Native để test được). */

export const MAX_COMMENT = 500;

/** Nhãn cho số sao đang chọn */
export const RATING_LABEL: Record<number, string> = {
  1: 'Rất không hài lòng',
  2: 'Không hài lòng',
  3: 'Bình thường',
  4: 'Hài lòng',
  5: 'Rất hài lòng',
};

/** "4,6" (một chữ số thập phân, dấu phẩy) hoặc null khi chưa có đánh giá */
export function formatAverage(avg: number | null | undefined): string | null {
  if (avg == null) return null;
  return avg.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** "4,6 ★ · 23 đánh giá" / "Chưa có đánh giá" */
export function ratingText(r: { average: number | null; count: number } | undefined): string {
  if (!r || !r.count || r.average == null) return 'Chưa có đánh giá';
  return `${formatAverage(r.average)} ★ · ${r.count} đánh giá`;
}

/** Tỉ lệ (0–1) của từng mức sao để vẽ thanh phân bố, 5 sao trước */
export function distributionBars(dist: Record<string, number>, count: number): { stars: number; n: number; ratio: number }[] {
  return [5, 4, 3, 2, 1].map((stars) => {
    const n = dist[String(stars)] ?? 0;
    return { stars, n, ratio: count ? n / count : 0 };
  });
}
