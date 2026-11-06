import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Button, Card, Chip, Empty, ErrorBox, Field, Loading, Muted, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { dayLabel, doctorName, formatDate, formatTime, ymd } from '@/lib/format';
import { standingNotice } from '@/lib/queue';
import type { Appointment, BookingStanding, Doctor, Slot } from '@/lib/types';

const DAYS = 7;

/** Chọn ngày, chọn giờ trống rồi đặt lịch với một bác sĩ. */
export default function BookDoctor() {
  const { doctorId, day } = useLocalSearchParams<{ doctorId: string; day?: string }>();
  const queryClient = useQueryClient();
  // Mở từ hồ sơ bác sĩ với một ngày đã chọn (số ngày tính từ hôm nay)
  const [offset, setOffset] = useState(() => Math.min(Math.max(Number(day) || 0, 0), DAYS - 1));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const date = ymd(offset);

  const doctor = useQuery({ queryKey: ['doctor', doctorId], queryFn: async () => (await api.get<Doctor>(`/doctors/${doctorId}`)).data });
  const slots = useQuery({
    queryKey: ['slots', doctorId, date],
    queryFn: async () => (await api.get<Slot[]>(`/doctors/${doctorId}/schedules`, { params: { date } })).data,
  });

  const standing = useQuery({
    queryKey: ['appointments', 'standing'],
    queryFn: async () => (await api.get<BookingStanding>('/appointments/standing')).data,
  });
  const notice = standingNotice(standing.data);

  const book = useMutation({
    mutationFn: async () => (await api.post<Appointment>('/appointments', { scheduleId: slot!.id, reason: reason.trim() || undefined })).data,
    onSuccess: (appt) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      Alert.alert('Đặt lịch thành công', `${doctorName(appt.schedule.doctor)}\n${formatTime(appt.schedule.startTime)}, ${formatDate(appt.schedule.startTime)}`);
      router.replace('/(tabs)/appointments');
    },
    onError: () => {
      // Khung giờ có thể vừa bị người khác đặt: tải lại danh sách để bỏ khung giờ đó
      setSlot(null);
      void slots.refetch();
    },
  });

  return (
    <Screen refreshing={slots.isRefetching} onRefresh={slots.refetch}>
      <Stack.Screen options={{ title: doctor.data ? doctorName(doctor.data) : 'Đặt lịch' }} />
      {doctor.data ? (
        <Card>
          <Text style={styles.title}>{doctorName(doctor.data)}</Text>
          <Muted>{doctor.data.specialty.name}</Muted>
        </Card>
      ) : null}

      {notice ? (
        <Card style={{ borderColor: colors.warning, borderWidth: 1 }}>
          <Text style={{ color: colors.text }}>{notice.text}</Text>
        </Card>
      ) : null}

      <Text style={styles.label}>Chọn ngày</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {Array.from({ length: DAYS }, (_, i) => (
          <Chip
            key={i}
            label={dayLabel(i)}
            selected={offset === i}
            onPress={() => {
              setOffset(i);
              setSlot(null);
            }}
          />
        ))}
      </ScrollView>

      <Text style={styles.label}>Chọn giờ</Text>
      {slots.isLoading ? (
        <Loading />
      ) : slots.data?.length === 0 ? (
        <Empty title="Hết khung giờ trống" hint="Vui lòng chọn ngày khác." />
      ) : (
        <View style={styles.wrap}>
          {slots.data?.map((s) => (
            <Chip key={s.id} label={formatTime(s.startTime)} selected={slot?.id === s.id} onPress={() => setSlot(s)} />
          ))}
        </View>
      )}

      <Field label="Lý do khám (không bắt buộc)" value={reason} onChangeText={setReason} placeholder="Ví dụ: sốt, đau họng 2 ngày" multiline maxLength={500} />
      <ErrorBox message={book.error ? errorMessage(book.error) : null} />
      <Button
        title={slot ? `Đặt lịch lúc ${formatTime(slot.startTime)}` : 'Chọn giờ để đặt lịch'}
        onPress={() => book.mutate()}
        disabled={!slot || notice?.blocked}
        loading={book.isPending}
      />
    </Screen>
  );
}
