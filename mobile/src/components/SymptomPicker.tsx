import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { Chip, colors, styles } from '@/components/ui';
import { allSymptoms, suggestSpecialties } from '@/lib/symptoms';
import type { Specialty } from '@/lib/types';

/**
 * "Chưa biết khám khoa nào?": bệnh nhân chọn triệu chứng, app gợi ý khoa phù hợp.
 * Bấm một khoa gợi ý để xem bác sĩ của khoa đó ({@link onPick}).
 */
export function SymptomPicker({ specialties, onPick, pickedSpecialtyId }: { specialties: Specialty[]; onPick: (specialtyId: string) => void; pickedSpecialtyId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const symptoms = allSymptoms(specialties);
  if (symptoms.length === 0) return null;
  const suggestions = suggestSpecialties(specialties, picked);
  const toggle = (x: string) => setPicked((p) => (p.includes(x) ? p.filter((y) => y !== x) : [...p, x]));

  return (
    <View style={[styles.card, { gap: 10 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Chưa biết khám khoa nào?</Text>
          <Text style={{ fontSize: 14, color: colors.muted }}>{open ? 'Chọn các triệu chứng bạn đang gặp' : 'Chọn triệu chứng để được gợi ý khoa phù hợp'}</Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name="chevron" color={colors.muted} size={20} strokeWidth={2} />
        </View>
      </Pressable>
      {open ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {symptoms.map((x) => (
              <Chip key={x} label={x} selected={picked.includes(x)} onPress={() => toggle(x)} />
            ))}
          </View>
          {picked.length > 0 && suggestions.length === 0 ? (
            <Text style={{ fontSize: 14, color: colors.muted }}>Chưa tìm được khoa phù hợp. Bạn có thể chọn Nội tổng quát hoặc hỏi lễ tân.</Text>
          ) : null}
          {suggestions.map((s, i) => {
            const active = pickedSpecialtyId === s.specialty.id;
            return (
              <Pressable
                key={s.specialty.id}
                accessibilityRole="button"
                accessibilityLabel={`Xem bác sĩ khoa ${s.specialty.name}`}
                onPress={() => onPick(s.specialty.id)}
                style={{ borderWidth: 1, borderColor: active || i === 0 ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : 'transparent', borderRadius: 12, padding: 12, gap: 2 }}
              >
                <Text style={{ fontSize: 15.5, fontWeight: '700', color: colors.text }}>
                  {i === 0 ? 'Nên khám: ' : ''}
                  {s.specialty.name}
                </Text>
                <Text style={{ fontSize: 13.5, color: colors.muted }}>Phù hợp: {s.matched.join(', ')}</Text>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.primary }}>{active ? 'Đang xem bác sĩ khoa này' : 'Xem bác sĩ khoa này ›'}</Text>
              </Pressable>
            );
          })}
          {suggestions.length > 0 ? (
            <Text style={{ fontSize: 12.5, color: colors.faint }}>Gợi ý chỉ để tham khảo. Nếu triệu chứng nặng (khó thở, đau ngực dữ dội…), hãy báo ngay nhân viên hoặc gọi 115.</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
