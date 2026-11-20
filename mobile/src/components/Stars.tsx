import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import { colors } from '@/components/ui';

const GOLD = '#D99A0B';

/** Hàng sao hiển thị (làm tròn tới nửa sao thì tô cả sao). */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <Text accessibilityLabel={`${value} trên 5 sao`} style={{ fontSize: size, letterSpacing: 1, color: GOLD }}>
      {'★'.repeat(full)}
      <Text style={{ color: colors.border }}>{'★'.repeat(5 - full)}</Text>
    </Text>
  );
}

/** Chọn số sao: bấm sao thứ n để chấm n sao. */
export function StarInput({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <View accessibilityRole="adjustable" style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`${n} sao`}
          accessibilityState={{ selected: n <= value }}
          disabled={disabled}
          hitSlop={6}
          onPress={() => onChange(n)}
        >
          <Text style={{ fontSize: 36, lineHeight: 42, color: n <= value ? GOLD : colors.border }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}
