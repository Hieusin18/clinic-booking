import { useQuery } from '@tanstack/react-query';
import { router, useIsFocused } from 'expo-router';
import { View } from 'react-native';
import { NotificationBell } from '@/components/NotificationBell';
import { Text } from '@/components/Text';
import { Badge, Button, Empty, Loading, Muted, Perforation, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { doctorName, formatTime } from '@/lib/format';
import { VISIT_STATUS, waitHint } from '@/lib/queue';
import { useMarkVisitRead } from '@/lib/notifications';
import { useRealtime } from '@/lib/realtime';
import type { QueuePosition, Visit } from '@/lib/types';

/** Một cột số nhỏ ở cuống phiếu. */
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 12.5, color: colors.muted }}>{label}</Text>
      <Text style={{ fontFamily: 'num', fontWeight: '700', fontSize: 30, lineHeight: 34, color: accent ? colors.stamp : colors.text }}>{value}</Text>
    </View>
  );
}

/** Phiếu số đang chờ: cập nhật ngay qua WebSocket; mất kết nối thì tự hỏi lại mỗi 15 giây. */
function TicketCard({ visitId }: { visitId: string }) {
  const { connected, lastCall } = useRealtime();
  const pos = useQuery({
    queryKey: ['position', visitId],
    queryFn: async () => (await api.get<QueuePosition>(`/queue/${visitId}/position`)).data,
    refetchInterval: connected ? 120_000 : 15_000,
  });
  // Đang xem phiếu số thì coi như đã đọc tin gọi số / mời quay lại của phiếu này
  const focused = useIsFocused();
  useMarkVisitRead(visitId, ['CALLED', 'RESULTS_READY'], focused);
  if (!pos.data) return <Loading />;
  const { visit, label, currentLabel, peopleAhead, estimatedCallAt, due } = pos.data;
  const hint = waitHint(pos.data);
  const st = VISIT_STATUS[visit.status];
  const active = visit.status === 'WAITING' || visit.status === 'IN_PROGRESS' || visit.status === 'AWAITING_RESULTS';
  const testing = visit.status === 'AWAITING_RESULTS';
  const online = visit.source === 'ONLINE';
  const room = visit.doctor.room?.trim();
  const recalled = lastCall?.visitId === visitId && lastCall.recall && visit.status === 'IN_PROGRESS';

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: active ? 2 : 1, borderColor: active ? colors.ink : colors.border }}>
      <View style={{ padding: 16, gap: 2 }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.text }}>{doctorName(visit.doctor)}</Text>
          {active ? <Badge label={online ? 'Đặt lịch' : 'Vãng lai'} tone={online ? 'primary' : 'neutral'} /> : <Badge label={st.label} tone={st.tone} />}
        </View>
        <Muted>
          {room ? `${room} · ` : ''}
          {visit.doctor.specialty?.name ? `${visit.doctor.specialty.name} · ` : ''}
          {visit.appointmentAt ? `Hẹn ${formatTime(visit.appointmentAt)} · ` : ''}Lấy số {formatTime(visit.createdAt)}
        </Muted>
      </View>
      <Perforation />
      <View style={{ alignItems: 'center', paddingVertical: 4, gap: 4 }}>
        <Text style={{ fontSize: 14, color: colors.muted, letterSpacing: 0.4 }}>Số của bạn</Text>
        <Text
          accessibilityLabel={`Số của bạn ${label}`}
          style={{ fontFamily: 'num', fontWeight: '700', fontSize: 132, lineHeight: 136, color: active ? colors.stamp : colors.faint, letterSpacing: 2 }}
        >
          {label}
        </Text>
        <View style={{ alignSelf: 'center' }}>
          {visit.status === 'IN_PROGRESS' ? (
            <Badge label={`${recalled ? 'Bác sĩ đang gọi lại · ' : ''}Mời vào ${room || 'phòng khám'}`} tone="success" />
          ) : testing ? (
            <Badge label={visit.resultMode === 'ONLINE' ? 'Đi làm cận lâm sàng · nhận kết quả online' : 'Đi làm cận lâm sàng'} tone="primary" />
          ) : visit.status === 'WAITING' && visit.resultsReadyAt ? (
            <Badge label="Có kết quả · được gọi trước" tone="success" />
          ) : active && due ? (
            <Badge label="Đến giờ hẹn · đang được ưu tiên" tone="primary" />
          ) : null}
        </View>
      </View>
      {testing && visit.labOrders?.length ? (
        <>
          <Perforation />
          <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.stamp, letterSpacing: 0.3 }}>CHỈ ĐỊNH CẦN LÀM</Text>
            {visit.labOrders.map((o) => (
              <View key={o.id} style={[styles.row, { justifyContent: 'space-between', gap: 8 }]}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>{o.name}</Text>
                <Badge label={o.doneAt ? 'Đã có kết quả' : 'Chờ kết quả'} tone={o.doneAt ? 'success' : 'neutral'} />
              </View>
            ))}
          </View>
        </>
      ) : active && !testing ? (
        <>
          <Perforation />
          <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 14 }}>
            <Stat label="Đang khám" value={currentLabel ?? '—'} />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <Stat label="Trước bạn" value={visit.status === 'IN_PROGRESS' ? '0' : String(peopleAhead)} />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <Stat label="Dự kiến" value={estimatedCallAt && visit.status === 'WAITING' ? formatTime(estimatedCallAt) : '—'} accent />
          </View>
        </>
      ) : null}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', textAlign: 'center', color: colors.text }}>{hint.text}</Text>
        {active && hint.note ? <Text style={[styles.muted, { textAlign: 'center' }]}>{hint.note}</Text> : null}
      </View>
    </View>
  );
}

export default function Ticket() {
  const { connected } = useRealtime();
  const mine = useQuery({
    queryKey: ['queue', 'mine'],
    queryFn: async () => (await api.get<Visit[]>('/queue/mine')).data,
    refetchInterval: connected ? 120_000 : 30_000,
  });
  const visits = mine.data ?? [];
  const hasActive = visits.some((v) => v.status === 'WAITING' || v.status === 'IN_PROGRESS' || v.status === 'AWAITING_RESULTS');

  return (
    <Screen
      title="Số thứ tự của bạn"
      action={<NotificationBell />}
      refreshing={mine.isRefetching}
      onRefresh={mine.refetch}
      footer={!hasActive ? <Button title="Quét mã QR tại quầy" icon="qr" onPress={() => router.push('/scan')} /> : undefined}
    >
      {mine.isLoading ? (
        <Loading />
      ) : visits.length === 0 ? (
        <Empty title="Hôm nay bạn chưa có số" hint="Khi đến phòng khám, bấm nút bên dưới và quét mã QR trên màn hình ở quầy." />
      ) : (
        visits.map((v) => <TicketCard key={v.id} visitId={v.id} />)
      )}
      <Muted>
        Đã đặt lịch trước? Quét mã trong khung giờ check-in ghi ở tab Lịch hẹn là bạn được check-in luôn và nhận số A, được ưu tiên
        khi đến giờ hẹn. Đến trễ hơn thì lịch hẹn hết hiệu lực và bạn lấy số thường (số B).
      </Muted>
    </Screen>
  );
}
