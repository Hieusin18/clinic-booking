import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Empty, Loading, Muted, Screen, colors } from '@/components/ui';
import { api } from '@/lib/api';
import { doctorName, formatTime } from '@/lib/format';
import { VISIT_STATUS, waitHint } from '@/lib/queue';
import type { Visit } from '@/lib/types';

interface Position {
  visit: Visit;
  peopleAhead: number;
  currentNumber: number | null;
}

/** Phiếu số đang chờ: tự cập nhật mỗi 15 giây. */
function TicketCard({ visitId }: { visitId: string }) {
  const pos = useQuery({
    queryKey: ['position', visitId],
    queryFn: async () => (await api.get<Position>(`/queue/${visitId}/position`)).data,
    refetchInterval: 15_000,
  });
  if (!pos.data) return <Loading />;
  const { visit, peopleAhead, currentNumber } = pos.data;
  const st = VISIT_STATUS[visit.status];
  const active = visit.status === 'WAITING' || visit.status === 'IN_PROGRESS';

  return (
    <Card style={active ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Muted>{doctorName(visit.doctor)}</Muted>
        <Badge label={st.label} tone={st.tone} />
      </View>
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Muted>Số thứ tự của bạn</Muted>
        <Text style={{ fontSize: 88, fontWeight: '800', color: active ? colors.primary : colors.muted, lineHeight: 96 }}>{visit.queueNumber}</Text>
        {active ? (
          <Text style={{ fontSize: 16, color: colors.text }}>
            Đang khám: <Text style={{ fontWeight: '800' }}>{currentNumber ?? '—'}</Text>
          </Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 16, fontWeight: '600', textAlign: 'center', color: colors.text }}>{waitHint(visit.status, peopleAhead)}</Text>
      <Muted>
        {visit.doctor.specialty?.name ? `${visit.doctor.specialty.name} · ` : ''}Lấy số lúc {formatTime(visit.createdAt)}
      </Muted>
    </Card>
  );
}

export default function Ticket() {
  const mine = useQuery({
    queryKey: ['queue', 'mine'],
    queryFn: async () => (await api.get<Visit[]>('/queue/mine')).data,
    refetchInterval: 30_000,
  });
  const visits = mine.data ?? [];
  const hasActive = visits.some((v) => v.status === 'WAITING' || v.status === 'IN_PROGRESS');

  return (
    <Screen refreshing={mine.isRefetching} onRefresh={mine.refetch}>
      {mine.isLoading ? (
        <Loading />
      ) : visits.length === 0 ? (
        <Empty title="Hôm nay bạn chưa có số" hint="Khi đến phòng khám, bấm nút bên dưới và quét mã QR trên màn hình ở quầy." />
      ) : (
        visits.map((v) => <TicketCard key={v.id} visitId={v.id} />)
      )}
      {!hasActive ? <Button title="Quét mã QR tại quầy" onPress={() => router.push('/scan')} /> : null}
      <Muted>Đã đặt lịch trước? Quét mã là bạn được check-in luôn, không cần xếp hàng ở quầy.</Muted>
    </Screen>
  );
}
