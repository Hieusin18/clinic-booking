import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { DoctorAvatar } from '@/components/DoctorAvatar';
import { Text } from '@/components/Text';
import { Badge, Button, Card, ErrorBox, Loading, Muted, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { availabilitySummary, experienceText, isEmptyProfile, yearRange } from '@/lib/doctor';
import { errorMessage } from '@/lib/errors';
import { dayLabel, doctorName } from '@/lib/format';
import type { DayAvailability, Doctor, HistoryItem } from '@/lib/types';

/** Danh sách mốc năm dạng dòng thời gian: năm bên trái (phông số), chức vụ/văn bằng và nơi bên phải. */
function Timeline({ items, currentLabel }: { items: HistoryItem[]; currentLabel?: string }) {
  return (
    <View>
      {items.map((h, i) => {
        const now = h.toYear == null;
        return (
          <View key={h.id} style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ width: 96, fontFamily: 'num', fontWeight: '600', fontSize: 20, color: now ? colors.stamp : colors.text }}>{yearRange(h)}</Text>
            <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: now ? colors.stamp : colors.border, paddingLeft: 12, paddingBottom: i === items.length - 1 ? 0 : 16, gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', lineHeight: 21, color: colors.text }}>{h.title}</Text>
              <Muted>{h.place}</Muted>
              {now && currentLabel ? (
                <View style={{ marginTop: 4 }}>
                  <Badge label={currentLabel} tone="primary" />
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Hồ sơ bác sĩ: bệnh nhân xem trước khi đặt lịch. Nút đặt lịch ghim ở đáy màn hình. */
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
  const current = d.career?.find((c) => c.toYear == null);
  const book = (day?: number) => router.push({ pathname: '/book/[doctorId]', params: { doctorId: d.id, ...(day ? { day: String(day) } : {}) } });

  return (
    <Screen
      refreshing={doctor.isRefetching}
      onRefresh={() => void Promise.all([doctor.refetch(), days.refetch()])}
      footer={<Button title="Đặt lịch với bác sĩ này" onPress={() => book()} />}
    >
      <Stack.Screen options={{ title: 'Hồ sơ bác sĩ' }} />
      <Card style={{ gap: 12 }}>
        <View style={[styles.row, { gap: 14 }]}>
          <DoctorAvatar doctor={d} size={76} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 21, fontWeight: '700', lineHeight: 26, color: colors.text }}>{doctorName(d)}</Text>
            <Muted>{d.specialty.name}</Muted>
            {exp ? <Badge label={exp} tone="primary" /> : null}
          </View>
        </View>
        {current ? (
          <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.bg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.stamp, paddingTop: 1 }}>Hiện tại</Text>
            <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.text }}>
              {current.title} · {current.place}
            </Text>
          </View>
        ) : null}
      </Card>

      {isEmptyProfile(d) ? <Muted>Bác sĩ chưa cập nhật hồ sơ chi tiết.</Muted> : null}

      {d.bio ? (
        <Card>
          <Text style={styles.title}>Giới thiệu</Text>
          <Text style={{ fontSize: 15, lineHeight: 23, color: colors.text }}>{d.bio}</Text>
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
        <Card style={{ gap: 14 }}>
          <Text style={styles.title}>Quá trình công tác</Text>
          <Timeline items={d.career} currentLabel="Đang công tác" />
        </Card>
      ) : null}

      {d.education?.length ? (
        <Card style={{ gap: 14 }}>
          <Text style={styles.title}>Quá trình đào tạo</Text>
          <Timeline items={d.education} currentLabel="Đang học" />
        </Card>
      ) : null}

      <Card>
        <Text style={styles.title}>Lịch còn trống</Text>
        {days.data ? (
          <>
            <Muted>{availabilitySummary(days.data)}. Chọn ngày để xem giờ khám.</Muted>
            <View style={styles.wrap}>
              {days.data.map((day, i) => (
                <Pressable
                  key={day.date}
                  accessibilityRole="button"
                  accessibilityLabel={`${dayLabel(i)}: ${day.free ? `${day.free} chỗ trống` : 'kín lịch'}`}
                  disabled={day.free === 0}
                  onPress={() => book(i)}
                  style={{
                    borderWidth: 1,
                    borderColor: day.free ? colors.border : colors.seg,
                    backgroundColor: day.free ? colors.card : colors.bg,
                    borderRadius: 12,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    minWidth: 76,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: day.free ? colors.text : colors.faint }}>{dayLabel(i)}</Text>
                  <Text style={{ fontFamily: 'num', fontWeight: '600', fontSize: 18, color: day.free ? colors.success : colors.faint }}>
                    {day.free ? `${day.free} chỗ` : 'Kín'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : days.isLoading ? (
          <Loading />
        ) : (
          <ErrorBox message={days.error ? errorMessage(days.error) : null} />
        )}
      </Card>
    </Screen>
  );
}
