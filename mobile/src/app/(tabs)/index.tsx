import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { DoctorAvatar } from '@/components/DoctorAvatar';
import { Icon } from '@/components/Icon';
import { NotificationBell } from '@/components/NotificationBell';
import { Text } from '@/components/Text';
import { Chip, Empty, ErrorBox, Loading, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { experienceText } from '@/lib/doctor';
import { errorMessage } from '@/lib/errors';
import { doctorName } from '@/lib/format';
import type { Doctor, Page, Specialty } from '@/lib/types';

/** Dòng chỗ trống hôm nay dưới tên bác sĩ. */
function freeText(n: number | undefined) {
  if (n == null) return null;
  return n > 0 ? { text: `Hôm nay còn ${n} chỗ`, color: colors.success } : { text: 'Hôm nay đã kín · xem ngày khác', color: colors.muted };
}

/** Tab Đặt lịch: tìm, lọc chuyên khoa → xem hồ sơ bác sĩ → đặt lịch. */
export default function BookHome() {
  const [specialtyId, setSpecialtyId] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const q = term.trim();
  const specialties = useQuery({
    queryKey: ['specialties'],
    queryFn: async () => (await api.get<Page<Specialty>>('/specialties', { params: { pageSize: 100 } })).data.items,
  });
  const doctors = useQuery({
    queryKey: ['doctors', specialtyId, q],
    queryFn: async () =>
      (await api.get<Page<Doctor>>('/doctors', { params: { pageSize: 100, ...(specialtyId ? { specialtyId } : {}), ...(q ? { q } : {}) } })).data.items,
  });

  return (
    <Screen
      title="Đặt lịch khám"
      action={<NotificationBell />}
      subtitle="Chọn chuyên khoa, xem hồ sơ rồi chọn giờ"
      refreshing={doctors.isRefetching}
      onRefresh={() => void Promise.all([specialties.refetch(), doctors.refetch()])}
    >
      <View style={styles.inputBox}>
        <Icon name="search" color={colors.muted} size={20} />
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="Tìm bác sĩ theo tên"
          placeholderTextColor={colors.faint}
          style={[styles.input, { paddingVertical: 11 }]}
          accessibilityLabel="Tìm bác sĩ theo tên"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        <Chip label="Tất cả" selected={specialtyId === null} onPress={() => setSpecialtyId(null)} />
        {specialties.data?.map((s) => (
          <Chip key={s.id} label={s.name} selected={specialtyId === s.id} onPress={() => setSpecialtyId(s.id)} />
        ))}
      </ScrollView>

      <ErrorBox message={doctors.error ? errorMessage(doctors.error) : null} />
      {doctors.isLoading ? (
        <Loading />
      ) : doctors.data?.length === 0 ? (
        <Empty title="Không tìm thấy bác sĩ" hint={q ? 'Thử tìm tên khác hoặc chọn "Tất cả".' : 'Chuyên khoa này chưa có bác sĩ nhận lịch.'} />
      ) : (
        doctors.data?.map((d) => {
          const free = freeText(d.freeToday);
          const exp = experienceText(d);
          return (
            <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={`Xem hồ sơ ${doctorName(d)}`} onPress={() => router.push(`/doctor/${d.id}`)}>
              {({ pressed }) => (
                <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 12 }, pressed && { opacity: 0.85 }]}>
                  <DoctorAvatar doctor={d} size={52} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{doctorName(d)}</Text>
                    <Text style={{ fontSize: 14, color: colors.muted }}>{[d.specialty.name, exp].filter(Boolean).join(' · ')}</Text>
                    {d.expertise.length ? (
                      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }} numberOfLines={2}>
                        {d.expertise.join(', ')}
                      </Text>
                    ) : d.bio ? (
                      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }} numberOfLines={2}>
                        {d.bio}
                      </Text>
                    ) : null}
                    {free ? <Text style={{ fontSize: 13, fontWeight: '600', color: free.color }}>{free.text}</Text> : null}
                  </View>
                  <Icon name="chevron" color={colors.faint} size={20} strokeWidth={2} />
                </View>
              )}
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
