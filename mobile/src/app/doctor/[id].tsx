import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { DoctorAvatar } from '@/components/DoctorAvatar';
import { Badge, Button, Card, Chip, ErrorBox, Loading, Muted, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { availabilitySummary, currentPosition, experienceText, isEmptyProfile, yearRange } from '@/lib/doctor';
import { errorMessage } from '@/lib/errors';
import { dayLabel, doctorName } from '@/lib/format';
import type { DayAvailability, Doctor, HistoryItem } from '@/lib/types';

/** Danh sách mốc năm dạng dòng thời gian: năm bên trái, chức vụ/văn bằng và nơi bên phải. */
function Timeline({ items, currentLabel }: { items: HistoryItem[]; currentLabel?: string }) {
  return (
    <View style={{ gap: 0 }}>
      {items.map((h, i) => (
        <View key={h.id} style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={{ width: 92, fontWeight: '700', color: h.toYear == null ? colors.primaryDark : colors.text, paddingTop: 2 }}>{yearRange(h)}</Text>
          <View
            style={{
              flex: 1,
              borderLeftWidth: 2,
              borderLeftColor: h.toYear == null ? colors.primary : colors.border,
              paddingLeft: 12,
              paddingBottom: i === items.length - 1 ? 0 : 14,
              gap: 2,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{h.title}</Text>
            <Muted>{h.place}</Muted>
            {h.toYear == null && currentLabel ? (
              <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                <Badge label={currentLabel} tone="primary" />
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Hồ sơ bác sĩ: bệnh nhân xem trước khi đặt lịch. */
export default function DoctorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const doctor = useQuery({ queryKey: ['doctor', id, 'profile'], queryFn: async () => (await api.get<Doctor>(`/doctors/${id}`)).data });
  const days = useQuery({
    queryKey: ['availability', id],
    queryFn: async () => (await api.get<DayAvailability[]>(`/doctors/${id}/availability`)).data,
  });
  const d = doctor.data;

  if (doctor.isLoading) return <Screen><Loading /></Screen>;
  if (!d) return <Screen><ErrorBox message={doctor.error ? errorMessage(doctor.error) : 'Không tìm thấy bác sĩ'} /></Screen>;

  const exp = experienceText(d);
  const position = currentPosition(d);
  const book = (day?: number) => router.push({ pathname: '/book/[doctorId]', params: { doctorId: d.id, ...(day ? { day: String(day) } : {}) } });

  return (
    <Screen refreshing={doctor.isRefetching} onRefresh={() => void Promise.all([doctor.refetch(), days.refetch()])}>
      <Stack.Screen options={{ title: doctorName(d) }} />
      <Card>
        <View style={[styles.row, { alignItems: 'flex-start' }]}>
          <DoctorAvatar doctor={d} size={72} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{doctorName(d)}</Text>
            <Muted>{d.specialty.name}</Muted>
            {exp ? (
              <View style={{ alignSelf: 'flex-start' }}>
                <Badge label={exp} tone="primary" />
              </View>
            ) : null}
          </View>
        </View>
        {position ? <Text style={{ color: colors.text }}>Hiện tại: {position}</Text> : null}
      </Card>

      {isEmptyProfile(d) ? <Muted>Bác sĩ chưa cập nhật hồ sơ chi tiết.</Muted> : null}

      {d.bio ? (
        <Card>
          <Text style={styles.title}>Giới thiệu</Text>
          <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{d.bio}</Text>
        </Card>
      ) : null}

      {d.expertise.length ? (
        <Card>
          <Text style={styles.title}>Thế mạnh chuyên môn</Text>
          <View style={styles.wrap}>
            {d.expertise.map((e) => (
              <Badge key={e} label={e} tone="neutral" />
            ))}
          </View>
        </Card>
      ) : null}

      {d.career?.length ? (
        <Card>
          <Text style={styles.title}>Quá trình công tác</Text>
          <Timeline items={d.career} currentLabel="Đang công tác" />
        </Card>
      ) : null}

      {d.education?.length ? (
        <Card>
          <Text style={styles.title}>Quá trình đào tạo</Text>
          <Timeline items={d.education} currentLabel="Đang học" />
        </Card>
      ) : null}

      <Card>
        <Text style={styles.title}>Lịch còn trống</Text>
        {days.data ? (
          <>
            <Muted>{availabilitySummary(days.data)}. Chọn ngày để xem giờ khám.</Muted>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.data.map((day, i) => (
                <Chip key={day.date} label={`${dayLabel(i)} · ${day.free} chỗ`} disabled={day.free === 0} onPress={() => book(i)} />
              ))}
            </ScrollView>
          </>
        ) : days.isLoading ? (
          <Loading />
        ) : (
          <ErrorBox message={days.error ? errorMessage(days.error) : null} />
        )}
      </Card>

      <Button title="Đặt lịch với bác sĩ này" onPress={() => book()} />
    </Screen>
  );
}
