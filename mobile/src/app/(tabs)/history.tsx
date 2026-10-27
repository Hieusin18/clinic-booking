import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Badge, Card, Empty, ErrorBox, Loading, Muted, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { doctorName, formatDay } from '@/lib/format';
import type { VisitDetail } from '@/lib/types';

/** Lịch sử các lần khám đã hoàn tất, mới nhất trước. */
export default function History() {
  const list = useQuery({ queryKey: ['visits', 'mine'], queryFn: async () => (await api.get<VisitDetail[]>('/visits/mine')).data });

  return (
    <Screen refreshing={list.isRefetching} onRefresh={list.refetch}>
      <ErrorBox message={list.error ? errorMessage(list.error) : null} />
      {list.isLoading ? (
        <Loading />
      ) : list.data?.length === 0 ? (
        <Empty title="Chưa có lần khám nào" hint="Sau khi khám xong, bệnh án và đơn thuốc sẽ hiện ở đây." />
      ) : (
        list.data?.map((v) => (
          <Pressable key={v.id} accessibilityRole="button" onPress={() => router.push(`/visit/${v.id}`)}>
            <Card>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{formatDay(v.date)}</Text>
                {v.prescription ? <Badge label={`Đơn ${v.prescription.items.length} thuốc`} tone="primary" /> : <Badge label="Không kê đơn" />}
              </View>
              <Text style={{ fontSize: 15, color: colors.text }}>{v.medicalRecord?.diagnosis ?? 'Chưa có chẩn đoán'}</Text>
              <Muted>
                {doctorName(v.doctor)}
                {v.doctor.specialty ? ` · ${v.doctor.specialty.name}` : ''}
              </Muted>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Xem bệnh án và đơn thuốc ›</Text>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
