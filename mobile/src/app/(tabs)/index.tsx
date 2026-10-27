import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card, Chip, Empty, ErrorBox, Loading, Muted, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { doctorName } from '@/lib/format';
import type { Doctor, Page, Specialty } from '@/lib/types';

/** Tab Đặt lịch: chọn chuyên khoa → chọn bác sĩ. */
export default function BookHome() {
  const [specialtyId, setSpecialtyId] = useState<string | null>(null);
  const specialties = useQuery({
    queryKey: ['specialties'],
    queryFn: async () => (await api.get<Page<Specialty>>('/specialties', { params: { pageSize: 100 } })).data.items,
  });
  const doctors = useQuery({
    queryKey: ['doctors', specialtyId],
    queryFn: async () =>
      (await api.get<Page<Doctor>>('/doctors', { params: { pageSize: 100, ...(specialtyId ? { specialtyId } : {}) } })).data.items,
  });

  return (
    <Screen refreshing={doctors.isRefetching} onRefresh={() => void Promise.all([specialties.refetch(), doctors.refetch()])}>
      <Text style={styles.title}>Bạn muốn khám chuyên khoa nào?</Text>
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
        <Empty title="Chưa có bác sĩ" hint="Chuyên khoa này chưa có bác sĩ nhận lịch." />
      ) : (
        doctors.data?.map((d) => (
          <Pressable key={d.id} accessibilityRole="button" onPress={() => router.push(`/book/${d.id}`)}>
            {({ pressed }) => (
              <Card style={pressed ? { borderColor: colors.primary } : undefined}>
                <View style={styles.row}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.primaryDark, fontWeight: '700', fontSize: 18 }}>{d.user.fullName.split(' ').pop()?.[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{doctorName(d)}</Text>
                    <Muted>{d.specialty.name}</Muted>
                  </View>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>Chọn ›</Text>
                </View>
                {d.bio ? <Muted>{d.bio}</Muted> : null}
              </Card>
            )}
          </Pressable>
        ))
      )}
    </Screen>
  );
}
