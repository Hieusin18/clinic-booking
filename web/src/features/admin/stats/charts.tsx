import { Flex } from 'antd';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { C, NUM } from '../../../lib/theme';
import { fmt, labelEvery, niceTicks } from './stats';

/** Bề rộng thật của khung chứa (để chữ trong SVG không bị kéo giãn). jsdom không có ResizeObserver: dùng mặc định. */
function useWidth(fallback = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export interface Series {
  name: string;
  color: string;
  values: number[];
}

/** Chú giải: ô màu + tên (luôn có khi từ hai chuỗi trở lên) */
export function Legend({ series }: { series: readonly { name: string; color: string }[] }) {
  return (
    <Flex gap={16} wrap style={{ fontSize: 13, color: C.muted }}>
      {series.map((s) => (
        <Flex key={s.name} align="center" gap={6}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
          {s.name}
        </Flex>
      ))}
    </Flex>
  );
}

/** Đường viền cột có hai góc trên bo tròn (đầu dữ liệu), chân cột vuông trên trục */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/**
 * Cột chồng (vd. lượt tiếp nhận theo ngày, chia đặt online / vãng lai). Rê chuột vào một cột để xem số liệu.
 * Một trục tung duy nhất, lưới mờ, nhãn trục hoành thưa dần khi nhiều cột.
 */
export function StackedBars({
  categories,
  series,
  tooltipTitle,
  height = 240,
  ariaLabel,
}: {
  categories: string[];
  series: Series[];
  tooltipTitle: (i: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const m = { left: 40, right: 8, top: 10, bottom: 26 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const n = categories.length;
  const totals = categories.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const ticks = niceTicks(Math.max(0, ...totals));
  const top = ticks[ticks.length - 1] || 1;
  const y = (v: number) => m.top + innerH - (v / top) * innerH;
  const band = innerW / Math.max(1, n);
  const barW = Math.max(2, Math.min(36, band * 0.64));
  const every = labelEvery(n, Math.floor(innerW / 54));

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ display: 'block', fontFamily: 'inherit' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.line : '#EDF0F3'} strokeWidth={1} />
            <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11.5} fill={C.muted}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {categories.map((c, i) => {
          const cx = m.left + band * i + band / 2;
          const x = cx - barW / 2;
          let acc = 0;
          const lastNonZero = series.reduce((last, s, k) => ((s.values[i] ?? 0) > 0 ? k : last), -1);
          return (
            <g key={c} opacity={hover === null || hover === i ? 1 : 0.4}>
              {series.map((s, k) => {
                const v = s.values[i] ?? 0;
                if (v <= 0) return null;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const h = Math.max(0, y0 - y1);
                // Khe 2px giữa phần này và phần bên dưới
                const gap = y0 < y(0) ? 2 : 0;
                return k === lastNonZero ? (
                  <path key={s.name} d={topRounded(x, y1, barW, Math.max(0, h - gap), 4)} fill={s.color} />
                ) : (
                  <rect key={s.name} x={x} y={y1} width={barW} height={Math.max(0, h - gap)} fill={s.color} />
                );
              })}
              {i % every === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize={11.5} fill={C.muted}>
                  {c}
                </text>
              )}
              {/* Vùng rê chuột rộng hơn cột */}
              <rect x={m.left + band * i} y={m.top} width={band} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 0,
            left: Math.min(Math.max(0, m.left + band * hover + band / 2 - 90), width - 180),
            width: 180,
            pointerEvents: 'none',
            background: '#fff',
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            boxShadow: '0 6px 20px rgba(30,38,56,.12)',
            padding: '8px 12px',
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltipTitle(hover)}</div>
          {series.map((s) => (
            <Flex key={s.name} justify="space-between" align="center" gap={8}>
              <Flex align="center" gap={6} style={{ color: C.muted }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                {s.name}
              </Flex>
              <span style={{ fontFamily: NUM, fontSize: 15, fontWeight: 600 }}>{fmt(s.values[hover] ?? 0)}</span>
            </Flex>
          ))}
          <Flex justify="space-between" style={{ borderTop: `1px solid ${C.line}`, marginTop: 4, paddingTop: 4 }}>
            <span style={{ color: C.muted }}>Tổng</span>
            <span style={{ fontFamily: NUM, fontSize: 15, fontWeight: 600 }}>{fmt(totals[hover])}</span>
          </Flex>
        </div>
      )}
    </div>
  );
}

/**
 * Danh sách thanh ngang một màu (vd. chẩn đoán thường gặp): tên, thanh, số. Đọc được như một bảng,
 * nên không cần trục.
 */
export function BarList({
  rows,
  color = C.stamp,
  empty = 'Chưa có số liệu',
}: {
  rows: { key: string; label: ReactNode; value: number; display?: ReactNode; color?: string }[];
  color?: string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <div style={{ color: C.muted, padding: '12px 0' }}>{empty}</div>;
  return (
    <Flex vertical gap={10} role="list">
      {rows.map((r) => (
        <div key={r.key} role="listitem">
          <Flex justify="space-between" align="baseline" gap={12} style={{ fontSize: 13.5, marginBottom: 4 }}>
            <span style={{ minWidth: 0 }}>{r.label}</span>
            <span style={{ fontFamily: NUM, fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.display ?? fmt(r.value)}</span>
          </Flex>
          <div style={{ height: 8, background: '#EEF1F4', borderRadius: 4 }}>
            <div style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value > 0 ? 4 : 0, height: 8, background: r.color ?? color, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </Flex>
  );
}
