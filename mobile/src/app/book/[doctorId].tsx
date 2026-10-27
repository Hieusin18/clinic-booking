import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Button, Card, Chip, Empty, ErrorBox, Field, Loading, Muted, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { dayLabel, doctorName, formatDate, formatTime, ymd } from '@/lib/format';
import type { Appointment, Doctor, Slot } from '@/lib/types';

const DAYS = 7;

/** Chọn ngày, chọn giờ trống rồi đặt lịch với một bác sĩ. */
export default function BookDoctor() {
  const { doctorId } = useLocalSearchParams<{ doctorId: string }>();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const date = ymd(offset);

  const doctor = useQuery({ queryKey: ['doctor', doctorId], queryFn: async () => (await api.get<Doctor>(`/doctors/${doctorId}`)).data });
  const slots = useQuery({
    queryKey: ['slots', doctorId, date],
    queryFn: async () => (await api.get<Slot[]>(`/doctors/${doctorId}/schedules`, { params: { date } })).data,
  });

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
        disabled={!slot}
        loading={book.isPending}
      />
    </Screen>
  );
}
