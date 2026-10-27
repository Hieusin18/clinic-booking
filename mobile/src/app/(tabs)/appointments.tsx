import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Loading, Muted, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { doctorName, formatDate, formatTime } from '@/lib/format';
import type { Appointment, AppointmentStatus } from '@/lib/types';

const STATUS: Record<AppointmentStatus, { label: string; tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'warning' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'primary' },
  COMPLETED: { label: 'Đã khám', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
  NO_SHOW: { label: 'Vắng mặt', tone: 'danger' },
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
    <Screen refreshing={list.isRefetching} onRefresh={list.refetch}>
      <View style={styles.row}>
        <Chip label="Sắp tới" selected={when === 'upcoming'} onPress={() => setWhen('upcoming')} />
        <Chip label="Đã qua" selected={when === 'past'} onPress={() => setWhen('past')} />
      </View>
      <ErrorBox message={cancel.error ? errorMessage(cancel.error) : list.error ? errorMessage(list.error) : null} />
      {list.isLoading ? (
        <Loading />
      ) : list.data?.length === 0 ? (
        <Empty
          title={when === 'upcoming' ? 'Chưa có lịch hẹn sắp tới' : 'Chưa có lịch hẹn nào'}
          hint={when === 'upcoming' ? 'Vào tab Đặt lịch để chọn bác sĩ và giờ khám.' : undefined}
        />
      ) : (
        list.data?.map((a) => (
          <Card key={a.id}>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text style={{ fontSize: 22, fontWeight: '800' }}>{formatTime(a.schedule.startTime)}</Text>
              <Badge label={STATUS[a.status].label} tone={STATUS[a.status].tone} />
            </View>
            <Muted>{formatDate(a.schedule.startTime)}</Muted>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>{doctorName(a.schedule.doctor)}</Text>
            {a.schedule.doctor.specialty ? <Muted>{a.schedule.doctor.specialty.name}</Muted> : null}
            {a.reason ? <Muted>Lý do: {a.reason}</Muted> : null}
            {when === 'upcoming' ? (
              <>
                <Muted>Đến phòng khám, vào tab Lấy số và quét mã QR ở quầy để check-in.</Muted>
                <Button title="Hủy lịch" variant="danger" loading={cancel.isPending && cancel.variables === a.id} onPress={() => confirmCancel(() => cancel.mutate(a.id))} />
              </>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
