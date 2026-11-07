import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { Text, fontFor } from './Text';

/**
 * Bảng màu "Phiếu số": giấy phiếu, mực chữ và mực dấu (chỉ dùng cho số thứ tự, giờ đã chọn, con dấu).
 * Cảnh báo chỉ dùng hổ phách, không dùng đỏ để không gây hoảng trong phòng khám.
 */
export const colors = {
  ink: '#1E2638',
  stamp: '#3A3FB0',
  stampSoft: '#E6E7F7',
  primary: '#3A3FB0',
  primaryDark: '#2E3290',
  primarySoft: '#E6E7F7',
  bg: '#F4F6F7',
  card: '#FFFFFF',
  text: '#1E2638',
  muted: '#5E6878',
  faint: '#A7AFBA',
  border: '#D5DBE1',
  seg: '#E4E8EC',
  danger: '#B4690E',
  dangerSoft: '#FBEFDD',
  warning: '#B4690E',
  warningSoft: '#FBEFDD',
  success: '#2E7A57',
  successSoft: '#E3F1EA',
};

/** Khung màn hình: vùng an toàn + cuộn + kéo để tải lại (nếu truyền onRefresh). */
export function Screen({
  children,
  refreshing = false,
  onRefresh,
  scroll = true,
  footer,
  title,
  subtitle,
}: {
  children: ReactNode;
  /** Tiêu đề lớn đầu màn (màn tab không có thanh tiêu đề) */
  title?: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  /** Phần ghim ở đáy màn hình (vd. nút đặt lịch), luôn hiện khi cuộn */
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={title ? ['top', 'left', 'right'] : ['left', 'right', 'bottom']}>
      {title ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, gap: 2 }}>
          <Text style={styles.heading}>{title}</Text>
          {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screen, { flex: 1 }]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

/** Nhãn mục nhỏ màu mực dấu, vd. "CHẨN ĐOÁN". */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 13, fontWeight: '700', color: colors.stamp, letterSpacing: 0.3, marginTop: 4 }}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  icon,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'accent';
  icon?: IconName;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, v.box, (disabled || loading) && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}
    >
      {loading ? (
        <ActivityIndicator color={v.text.color} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} color={v.text.color} size={20} strokeWidth={2} /> : null}
          <Text style={[styles.buttonText, v.text]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { box: { backgroundColor: colors.ink }, text: { color: '#fff' } },
  accent: { box: { backgroundColor: colors.stamp }, text: { color: '#fff' } },
  secondary: { box: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, text: { color: colors.text } },
  danger: { box: { backgroundColor: colors.dangerSoft }, text: { color: colors.danger } },
};

export function Field({ label, error, icon, ...input }: TextInputProps & { label: string; error?: string; icon?: IconName }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputBox, error ? { borderColor: colors.danger } : null]}>
        {icon ? <Icon name={icon} color={colors.muted} size={20} /> : null}
        <TextInput placeholderTextColor={colors.faint} style={styles.input} {...input} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Nút chọn dạng viên thuốc (ngày, chuyên khoa, giờ…). */
export function Chip({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, selected && styles.chipSelected, disabled && { opacity: 0.4 }]}
    >
      <Text style={[styles.chipText, selected && { color: '#fff', fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary' }) {
  const t = {
    neutral: [colors.seg, colors.muted],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    primary: [colors.stampSoft, colors.stamp],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t[0] }]}>
      <Text style={[styles.badgeText, { color: t[1] }]}>{label}</Text>
    </View>
  );
}

/** Con dấu nghiêng kiểu mộc phòng khám, vd. "ĐÃ XÁC NHẬN". */
export function Stamp({ label }: { label: string }) {
  return (
    <View style={{ borderWidth: 2, borderColor: colors.stamp, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, transform: [{ rotate: '-8deg' }] }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.stamp, letterSpacing: 0.6 }}>{label}</Text>
    </View>
  );
}

/** Đường xé của phiếu: nét đứt ngang và hai khía tròn ở mép (màu nền). */
export function Perforation({ inset = 18 }: { inset?: number }) {
  return (
    <View style={{ height: 22, justifyContent: 'center', marginHorizontal: -1 }}>
      <View style={{ position: 'absolute', left: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bg }} />
      <View style={{ marginHorizontal: inset, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.border }} />
      <View style={{ position: 'absolute', right: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bg }} />
    </View>
  );
}

export function ErrorBox({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox}>
      <Icon name="alert" color={colors.danger} size={18} strokeWidth={2} />
      <Text style={{ color: colors.danger, flex: 1, fontSize: 14, lineHeight: 20 }}>{message}</Text>
    </View>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 6 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{title}</Text>
      {hint ? <Text style={[styles.muted, { textAlign: 'center' }]}>{hint}</Text> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 32 }}>
      <ActivityIndicator color={colors.stamp} />
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: 20, gap: 12 },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, backgroundColor: colors.bg },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 8 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  heading: { fontSize: 26, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 16, color: colors.text, fontFamily: fontFor('400') },
  error: { color: colors.danger, fontSize: 13 },
  button: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.text, fontSize: 15 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  errorBox: { flexDirection: 'row', gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  num: { fontFamily: 'num' },
});
