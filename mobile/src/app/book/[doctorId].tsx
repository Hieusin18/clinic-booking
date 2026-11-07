import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { DoctorAvatar } from '@/components/DoctorAvatar';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { Button, Card, Empty, ErrorBox, Field, Loading, Muted, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { experienceText } from '@/lib/doctor';
import { errorMessage } from '@/lib/errors';
import { dayLabel, dayParts, doctorName, formatDate, formatTime, ymd } from '@/lib/format';
import { standingNotice } from '@/lib/queue';
import type { Appointment, BookingStanding, DayAvailability, Doctor, Slot } from '@/lib/types';

const DAYS = 7;

/** Ô giờ trong bảng giờ: còn trống, đã có người đặt (gạch ngang) hoặc đang chọn (tô mực dấu). */
function SlotCell({ slot, selected, onPress }: { slot: Slot; selected: boolean; onPress: () => void }) {
  const taken = !!slot.isBooked;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatTime(slot.startTime)}${taken ? ', đã có người đặt' : ''}`}
      accessibilityState={{ selected, disabled: taken }}
      disabled={taken}
      onPress={onPress}
      style={{
        width: '25%',
        height: 54,
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.border,
        backgroundColor: selected ? colors.stamp : taken ? 'transparent' : colors.card,
      }}
    >
      <Text
        style={{
          fontFamily: 'num',
          fontWeight: taken ? '500' : '600',
          fontSize: 24,
          color: selected ? '#fff' : taken ? colors.faint : colors.text,
          textDecorationLine: taken ? 'line-through' : 'none',
        }}
      >
        {formatTime(slot.startTime)}
      </Text>
    </Pressable>
  );
}

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
  const days = useQuery({
    queryKey: ['availability', doctorId],
    queryFn: async () => (await api.get<DayAvailability[]>(`/doctors/${doctorId}/availability`)).data,
  });
  const slots = useQuery({
    queryKey: ['slots', doctorId, date],
    queryFn: async () => (await api.get<Slot[]>(`/doctors/${doctorId}/schedules`, { params: { date, all: true } })).data,
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
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      Alert.alert('Đặt lịch thành công', `${doctorName(appt.schedule.doctor)}\n${formatTime(appt.schedule.startTime)}, ${formatDate(appt.schedule.startTime)}`);
      router.replace('/(tabs)/appointments');
    },
    onError: () => {
      // Khung giờ có thể vừa bị người khác đặt: tải lại để gạch khung giờ đó
      setSlot(null);
      void slots.refetch();
    },
  });

  const d = doctor.data;
  const freeOf = (i: number) => {
    const key = ymd(i);
    return days.data?.find((x) => x.date.slice(0, 10) === key)?.free;
  };

  return (
    <Screen
      refreshing={slots.isRefetching}
      onRefresh={() => void Promise.all([slots.refetch(), days.refetch()])}
      footer={
        <Button
          title={slot ? `Đặt lịch lúc ${formatTime(slot.startTime)} ${offset === 0 ? 'hôm nay' : offset === 1 ? 'ngày mai' : dayLabel(offset)}` : 'Chọn giờ để đặt lịch'}
          onPress={() => book.mutate()}
          disabled={!slot || notice?.blocked}
          loading={book.isPending}
        />
      }
    >
      <Stack.Screen options={{ title: 'Đặt lịch' }} />
      {d ? (
        <View style={[styles.row, { gap: 12 }]}>
          <DoctorAvatar doctor={d} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text }}>{doctorName(d)}</Text>
            <Muted>{[d.specialty.name, experienceText(d)].filter(Boolean).join(' · ')}</Muted>
          </View>
        </View>
      ) : null}

      {notice ? (
        <View style={{ backgroundColor: colors.warningSoft, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{notice.text}</Text>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {Array.from({ length: DAYS }, (_, i) => {
          const p = dayParts(i);
          const free = freeOf(i);
          const on = offset === i;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`${dayLabel(i)}${free != null ? `, ${free ? `${free} chỗ trống` : 'kín lịch'}` : ''}`}
              accessibilityState={{ selected: on }}
              onPress={() => {
                setOffset(i);
                setSlot(null);
              }}
              style={{
                width: 64,
                alignItems: 'center',
                paddingTop: 8,
                paddingBottom: 6,
                borderRadius: 12,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.ink : colors.border,
                backgroundColor: free === 0 ? colors.bg : colors.card,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: on ? '700' : '400', color: on ? colors.text : colors.muted }}>{p.top}</Text>
              <Text style={{ fontFamily: 'num', fontWeight: '600', fontSize: 24, lineHeight: 28, color: free === 0 ? colors.faint : colors.text }}>{p.day}</Text>
              {free != null ? (
                <Text style={{ fontSize: 11.5, color: free ? colors.success : colors.faint }}>{free ? `${free} chỗ` : 'kín'}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>Giờ khám {offset < 2 ? dayLabel(offset).toLowerCase() : dayLabel(offset)}</Text>
      {slots.isLoading ? (
        <Loading />
      ) : slots.data?.length === 0 ? (
        <Empty title="Không có giờ khám" hint="Bác sĩ chưa mở lịch ngày này. Vui lòng chọn ngày khác." />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: colors.ink, borderLeftWidth: 1, borderLeftColor: colors.border }}>
            {slots.data?.map((s) => (
              <SlotCell key={s.id} slot={s} selected={slot?.id === s.id} onPress={() => setSlot(s)} />
            ))}
          </View>
          <Muted>Giờ gạch ngang đã có người đặt</Muted>
        </>
      )}

      {slot?.checkinOpensAt && slot.checkinClosesAt ? (
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.stampSoft, borderRadius: 12, padding: 12 }}>
          <Icon name="clock" color={colors.stamp} size={20} strokeWidth={2} />
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.text }}>
            Hẹn {formatTime(slot.startTime)}: quét mã QR ở quầy trong khoảng {formatTime(slot.checkinOpensAt)} – {formatTime(slot.checkinClosesAt)} để nhận số A và được ưu tiên.
          </Text>
        </View>
      ) : null}

      <Field label="Lý do khám (không bắt buộc)" value={reason} onChangeText={setReason} placeholder="Ví dụ: sốt, đau họng 2 ngày" multiline maxLength={500} />
      <ErrorBox message={book.error ? errorMessage(book.error) : null} />
      {d == null && doctor.isError ? <Card><ErrorBox message={errorMessage(doctor.error)} /></Card> : null}
    </Screen>
  );
}
