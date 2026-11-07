import { C } from '../lib/theme';

/** Ô vuông mực với dấu cộng, dùng chung ở menu và trang đăng nhập. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <div aria-hidden style={{ width: size, height: size, borderRadius: size * 0.28, background: C.ink, display: 'grid', placeItems: 'center', flex: 'none' }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 16 16">
        <path d="M8 2v12M2 8h12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}
