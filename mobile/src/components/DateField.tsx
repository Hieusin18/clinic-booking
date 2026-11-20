import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { Button, colors, styles } from '@/components/ui';
import { dateToVnInput, vnInputToDate } from '@/lib/format';

/** Ngày mở lịch khi ô còn trống (ngày sinh: đỡ phải lùi nhiều năm) */
const DEFAULT_OPEN = new Date(1990, 0, 1);
const MIN = new Date(1900, 0, 1);

/**
 * Ô chọn ngày (giá trị dạng "DD/MM/YYYY"): bấm để chọn trên lịch thay vì gõ tay.
 * Android dùng hộp lịch của hệ thống (bấm năm ở đầu lịch để đổi năm nhanh), iOS mở lịch ở tấm dưới màn hình,
 * bản web (xem thử) dùng ô chọn ngày của trình duyệt.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  placeholder = 'Chọn ngày',
  maximumDate = new Date(),
}: {
  label: string;
  value: string;
  onChange: (vnDate: string) => void;
  error?: string;
  placeholder?: string;
  maximumDate?: Date;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(DEFAULT_OPEN);
  const current = vnInputToDate(value);

  if (Platform.OS === 'web') {
    const iso = current ? `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}` : '';
    return (
      <View style={{ gap: 6 }}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.inputBox, error ? { borderColor: colors.danger } : null]}>
          <Icon name="calendar" color={colors.muted} size={20} />
          {createElement('input', {
            type: 'date',
            'aria-label': label,
            value: iso,
            min: '1900-01-01',
            max: `${maximumDate.getFullYear()}-${String(maximumDate.getMonth() + 1).padStart(2, '0')}-${String(maximumDate.getDate()).padStart(2, '0')}`,
            onChange: (e: { target: { value: string } }) => {
              const [y, m, d] = e.target.value.split('-');
              onChange(y ? `${d}/${m}/${y}` : '');
            },
            style: { flex: 1, border: 'none', outline: 'none', padding: '13px 0', fontSize: 16, color: colors.text, background: 'transparent', fontFamily: 'inherit' },
          })}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  const open = () => {
    const start = current ?? DEFAULT_OPEN;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        minimumDate: MIN,
        maximumDate,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(dateToVnInput(date));
        },
      });
      return;
    }
    setDraft(start);
    setIosOpen(true);
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'chưa chọn'}`}
        accessibilityHint="Mở lịch để chọn ngày"
        onPress={open}
        style={[styles.inputBox, { paddingVertical: 13 }, error ? { borderColor: colors.danger } : null]}
      >
        <Icon name="calendar" color={colors.muted} size={20} />
        <Text style={{ flex: 1, fontSize: 16, color: value ? colors.text : colors.faint }}>{value || placeholder}</Text>
        <Icon name="chevron" color={colors.faint} size={18} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(30,38,56,0.35)' }} onPress={() => setIosOpen(false)} accessibilityLabel="Đóng lịch" />
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, gap: 8 }}>
            <Text style={styles.title}>{label}</Text>
            <DateTimePicker
              value={draft}
              mode="date"
              display="inline"
              locale="vi-VN"
              minimumDate={MIN}
              maximumDate={maximumDate}
              themeVariant="light"
              accentColor={colors.stamp}
              onChange={(_, d) => d && setDraft(d)}
            />
            <Button
              title={`Chọn ${dateToVnInput(draft)}`}
              onPress={() => {
                onChange(dateToVnInput(draft));
                setIosOpen(false);
              }}
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
