import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { Badge, Card, Empty, ErrorBox, Loading, Muted, Screen, Stamp, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { dayLabel, doctorName, formatDate, formatTime, ymd } from '@/lib/format';
import type { Appointment, AppointmentStatus } from '@/lib/types';

const STATUS: Record<AppointmentStatus, { label: string; tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'warning' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'primary' },
  COMPLETED: { label: 'Đã khám', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
  NO_SHOW: { label: 'Không đến', tone: 'warning' },
};

/** Xác nhận trước khi hủy; bản web dùng window.confirm vì Alert nhiều nút không có trên web. */
function confirmCancel(onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm('Hủy lịch hẹn này?')) onYes();
    return;
  }
  Alert.alert('Hủy lịch hẹn?', 'Khung giờ sẽ được mở lại cho người khác đặt.', [
    { text: 'Không', style: 'cancel' },
    { text: 'Hủy lịch', style: 'destructive', onPress: onYes },
  ]);
}

/** "Hôm nay", "Ngày mai" hoặc "T4 05/11" cho ngày của lịch hẹn. */
function whenLabel(iso: string) {
  const key = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  for (let i = 0; i < 2; i++) if (ymd(i) === key) return dayLabel(i);
  return formatDate(iso);
}

/** Hai nút gạt Sắp tới / Đã qua. */
function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.seg, borderRadius: 12, padding: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9, backgroundColor: on ? colors.card : 'transparent' }}
          >
            <Text style={{ fontSize: 14.5, fontWeight: on ? '700' : '500', color: on ? colors.text : colors.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Cuống phiếu hẹn: giờ lớn bên trái, đường xé dọc, thông tin bác sĩ và khung check-in bên phải. */
function UpcomingStub({ a, cancelling, onCancel }: { a: Appointment; cancelling: boolean; onCancel: () => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
      <View style={{ width: 104, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRightWidth: 2, borderStyle: 'dashed', borderRightColor: colors.border }}>
        <Text style={{ fontFamily: 'num', fontWeight: '700', fontSize: 40, lineHeight: 44, color: colors.text }}>{formatTime(a.schedule.startTime)}</Text>
        <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', paddingHorizontal: 6 }}>{whenLabel(a.schedule.startTime)}</Text>
      </View>
      <View style={{ position: 'absolute', left: 93, top: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bg }} />
      <View style={{ position: 'absolute', left: 93, bottom: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bg }} />
      <View style={{ flex: 1, padding: 14, gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{doctorName(a.schedule.doctor)}</Text>
        {a.schedule.doctor.specialty ? <Muted>{a.schedule.doctor.specialty.name}</Muted> : null}
        {a.reason ? <Muted>Lý do: {a.reason}</Muted> : null}
        {a.checkinOpensAt && a.checkinClosesAt ? (
          <View style={[styles.row, { gap: 6, marginTop: 4 }]}>
            <Icon name="clock" color={colors.stamp} size={16} strokeWidth={2} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.stamp }}>
              Check-in {formatTime(a.checkinOpensAt)} – {formatTime(a.checkinClosesAt)}
            </Text>
          </View>
        ) : null}
        <View style={[styles.row, { justifyContent: 'space-between', marginTop: 2 }]}>
          <Pressable accessibilityRole="button" disabled={cancelling} onPress={onCancel} style={{ paddingVertical: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.danger, opacity: cancelling ? 0.5 : 1 }}>{cancelling ? 'Đang hủy…' : 'Hủy lịch'}</Text>
          </Pressable>
          {a.status === 'CONFIRMED' ? <Stamp label="ĐÃ XÁC NHẬN" /> : <Badge label={STATUS[a.status].label} tone={STATUS[a.status].tone} />}
        </View>
      </View>
    </View>
  );
}

/** Lịch đã qua: một dòng gọn với huy hiệu trạng thái. */
function PastRow({ a }: { a: Appointment }) {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <Text style={{ fontFamily: 'num', fontWeight: '600', fontSize: 24, color: colors.muted, width: 58 }}>{formatTime(a.schedule.startTime)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{doctorName(a.schedule.doctor)}</Text>
        <Muted>{formatDate(a.schedule.startTime)}</Muted>
      </View>
      <Badge label={STATUS[a.status].label} tone={STATUS[a.status].tone} />
    </Card>
  );
}

export default function Appointments() {
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['appointments', when],
    queryFn: async () => (await api.get<Appointment[]>('/appointments/mine', { params: { when } })).data,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.patch(`/appointments/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  return (
    <Screen title="Lịch hẹn" refreshing={list.isRefetching} onRefresh={list.refetch}>
      <Segmented
        value={when}
        onChange={setWhen}
        options={[
          { value: 'upcoming', label: 'Sắp tới' },
          { value: 'past', label: 'Đã qua' },
        ]}
      />
      {when === 'upcoming' && list.data?.length ? (
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.stampSoft, borderRadius: 12, padding: 12 }}>
          <Icon name="qr" color={colors.stamp} size={20} strokeWidth={2} />
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.text }}>
            Đến phòng khám trong khung check-in, mở tab Lấy số và quét mã QR ở quầy. Đến trễ hơn thì lịch hẹn hết hiệu lực.
          </Text>
        </View>
      ) : null}
      <ErrorBox message={cancel.error ? errorMessage(cancel.error) : list.error ? errorMessage(list.error) : null} />
      {list.isLoading ? (
        <Loading />
      ) : list.data?.length === 0 ? (
        <Empty
          title={when === 'upcoming' ? 'Chưa có lịch hẹn sắp tới' : 'Chưa có lịch hẹn nào'}
          hint={when === 'upcoming' ? 'Vào tab Đặt lịch để chọn bác sĩ và giờ khám.' : undefined}
        />
      ) : when === 'upcoming' ? (
        list.data?.map((a) => (
          <UpcomingStub key={a.id} a={a} cancelling={cancel.isPending && cancel.variables === a.id} onCancel={() => confirmCancel(() => cancel.mutate(a.id))} />
        ))
      ) : (
        list.data?.map((a) => <PastRow key={a.id} a={a} />)
      )}
    </Screen>
  );
}
