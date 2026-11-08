import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { NotificationBell } from '@/components/NotificationBell';
import { Text } from '@/components/Text';
import { Badge, Empty, ErrorBox, Loading, Muted, Screen, colors } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useInbox } from '@/lib/notifications';
import { unreadResults } from '@/lib/notify';
import { dayMonth, doctorName } from '@/lib/format';
import type { VisitDetail } from '@/lib/types';

/** Lịch sử các lần khám đã hoàn tất, mới nhất trước. */
export default function History() {
  const list = useQuery({ queryKey: ['visits', 'mine'], queryFn: async () => (await api.get<VisitDetail[]>('/visits/mine')).data });
  const fresh = unreadResults(useInbox().data?.items ?? []).visits;

  return (
    <Screen title="Lịch sử khám" refreshing={list.isRefetching} onRefresh={list.refetch} action={<NotificationBell />}>
      <ErrorBox message={list.error ? errorMessage(list.error) : null} />
      {list.isLoading ? (
        <Loading />
      ) : list.data?.length === 0 ? (
        <Empty title="Chưa có lần khám nào" hint="Sau khi khám xong, bệnh án và đơn thuốc sẽ hiện ở đây." />
      ) : (
        list.data?.map((v) => {
          const { dm, year } = dayMonth(v.date);
          const rec = v.medicalRecord;
          const items = v.prescription?.items.length ?? 0;
          const waiting = v.status === 'AWAITING_RESULTS';
          const isNew = fresh.has(v.id);
          return (
            <Pressable
              key={v.id}
              accessibilityRole="button"
              accessibilityLabel={`${isNew ? 'Có kết quả mới. ' : ''}Lần khám ngày ${dm}/${year}: ${rec?.diagnosis ?? 'chưa có chẩn đoán'}`}
              onPress={() => router.push(`/visit/${v.id}`)}
              style={{ flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: colors.card, borderRadius: 16, borderWidth: isNew ? 2 : 1, borderColor: isNew ? colors.stamp : colors.border, padding: 14 }}
            >
              <View style={{ width: 62, alignItems: 'center', paddingRight: 12, borderRightWidth: 1, borderRightColor: colors.border }}>
                <Text style={{ fontFamily: 'num', fontWeight: '700', fontSize: 26, lineHeight: 30, color: colors.text }}>{dm}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{year}</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 15.5, fontWeight: '700', color: colors.text, flexShrink: 1 }}>{rec?.diagnosis ?? 'Chưa có chẩn đoán'}</Text>
                  {rec?.icdCode ? <Badge label={rec.icdCode} /> : null}
                  {isNew ? <Badge label="Mới" tone="primary" /> : null}
                </View>
                <Muted>
                  {doctorName(v.doctor)}
                  {v.doctor.specialty ? ` · ${v.doctor.specialty.name}` : ''}
                </Muted>
                {waiting ? (
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.stamp }}>Đang chờ kết quả cận lâm sàng</Text>
                ) : (
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: items ? colors.success : colors.faint }}>
                    {items ? `Đơn ${items} thuốc` : 'Không kê đơn'}
                    {v.labOrders?.length ? ` · ${v.labOrders.length} kết quả CLS` : ''}
                  </Text>
                )}
              </View>
              <Icon name="chevron" color={colors.faint} size={20} />
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
