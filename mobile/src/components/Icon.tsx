import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Bộ biểu tượng nét mảnh, vẽ bằng SVG nên giống nhau trên iOS, Android và web. */
const PATHS = {
  calendar: (
    <>
      <Rect x={3} y={5} width={18} height={16} rx={2} />
      <Path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  list: <Path d="M5 4h14v16H5zM9 9h6M9 13h6" />,
  qr: <Path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3M20 14v6M14 18v2" />,
  clock: (
    <>
      <Path d="M12 7v5l3 2" />
      <Circle cx={12} cy={12} r={8} />
    </>
  ),
  user: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  chevron: <Path d="m9 6 6 6-6 6" />,
  search: (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Path d="m20 20-4-4" />
    </>
  ),
  phone: <Path d="M7 3h10v18H7zM11 18h2" />,
  lock: (
    <>
      <Rect x={5} y={11} width={14} height={10} rx={2} />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  eye: (
    <>
      <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <Circle cx={12} cy={12} r={3} />
    </>
  ),
  download: <Path d="M12 4v12M6 11l6 6 6-6M5 20h14" />,
  alert: <Path d="M12 3 2 20h20L12 3zM12 10v4M12 17h.01" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, color, size = 24, strokeWidth = 1.8 }: { name: IconName; color: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </Svg>
  );
}
