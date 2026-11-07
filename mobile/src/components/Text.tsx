import { Text as RNText, StyleSheet, type TextProps, type TextStyle } from 'react-native';

/**
 * Chữ của app: Be Vietnam Pro cho chữ, Barlow Condensed cho con số (số thứ tự, giờ, ngày).
 * Phông tự tải đặt tên theo từng độ đậm, nên ở đây đổi `fontWeight` sang đúng tên phông
 * (Android không tự chọn độ đậm cho phông tự tải). Viết `fontFamily: 'num'` để dùng phông số.
 */
const SANS: Record<string, string> = {
  '400': 'BeVietnamPro_400Regular',
  '500': 'BeVietnamPro_500Medium',
  '600': 'BeVietnamPro_600SemiBold',
  '700': 'BeVietnamPro_700Bold',
  '800': 'BeVietnamPro_800ExtraBold',
};
const NUM: Record<string, string> = {
  '400': 'BarlowCondensed_500Medium',
  '500': 'BarlowCondensed_500Medium',
  '600': 'BarlowCondensed_600SemiBold',
  '700': 'BarlowCondensed_700Bold',
  '800': 'BarlowCondensed_700Bold',
};

/** Tên phông theo độ đậm; `num` = phông số. Dùng cho TextInput và tiêu đề điều hướng. */
export function fontFor(weight: TextStyle['fontWeight'] = '400', num = false) {
  const w = weight === 'bold' ? '700' : weight === 'normal' || weight == null ? '400' : String(weight);
  return (num ? NUM : SANS)[w] ?? (num ? NUM['600'] : SANS['400']);
}

export function Text({ style, ...props }: TextProps) {
  const s: TextStyle = StyleSheet.flatten(style) ?? {};
  const fontFamily = fontFor(s.fontWeight, s.fontFamily === 'num');
  return <RNText {...props} style={[s, { fontFamily, fontWeight: undefined }]} />;
}
