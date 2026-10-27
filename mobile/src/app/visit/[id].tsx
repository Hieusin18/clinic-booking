import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Card, Empty, ErrorBox, Loading, Muted, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { doctorName, formatDate, formatDay } from '@/lib/format';
import { medicineName, usage } from '@/lib/prescription';
import type { VisitDetail } from '@/lib/types';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={{ gap: 2 }}>
      <Muted>{label}</Muted>
      <Text style={{ fontSize: 16, color: colors.text }}>{value}</Text>
    </View>
  );
}

/** Chi tiết một lần khám: bệnh án và đơn thuốc trình bày để đưa nhà thuốc xem khi mua. */
export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const visit = useQuery({ queryKey: ['visit', id], queryFn: async () => (await api.get<VisitDetail>(`/visits/${id}`)).data });
  const v = visit.data;

  if (visit.isLoading) return <Screen><Loading /></Screen>;
  if (!v) return <Screen><ErrorBox message={visit.error ? errorMessage(visit.error) : 'Không tìm thấy lần khám'} /></Screen>;

  const p = v.prescription;
  return (
    <Screen refreshing={visit.isRefetching} onRefresh={visit.refetch}>
      <Stack.Screen options={{ title: `Khám ngày ${formatDay(v.date)}` }} />
      <Card>
        <Text style={styles.title}>Bệnh án</Text>
        <Muted>
          {doctorName(v.doctor)}
          {v.doctor.specialty ? ` · ${v.doctor.specialty.name}` : ''}
        </Muted>
        {v.medicalRecord ? (
          <>
            <Row label="Chẩn đoán" value={v.medicalRecord.diagnosis} />
            <Row label="Triệu chứng" value={v.medicalRecord.symptoms} />
            <Row label="Chỉ định" value={v.medicalRecord.orders} />
          </>
        ) : (
          <Muted>Chưa có bệnh án.</Muted>
        )}
      </Card>

      {p ? (
        <Card style={{ borderColor: colors.primary, borderWidth: 2 }}>
          <Text style={styles.title}>Đơn thuốc</Text>
          <Muted>
            {v.patient.fullName} · Kê ngày {p.finalizedAt ? formatDate(p.finalizedAt) : formatDay(v.date)}
          </Muted>
          {p.items.map((i, idx) => (
            <View key={i.id} style={{ paddingVertical: 10, borderTopWidth: idx ? 1 : 0, borderColor: colors.border, gap: 4 }}>
              <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 }}>
                  {idx + 1}. {medicineName(i.medicine)}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primaryDark }}>
                  {i.quantity} {i.medicine.unit}
                </Text>
              </View>
              {i.medicine.activeIngredient ? <Muted>Hoạt chất: {i.medicine.activeIngredient}</Muted> : null}
              <Text style={{ color: colors.text }}>{usage(i)}</Text>
            </View>
          ))}
          {p.advice ? (
            <View style={{ backgroundColor: colors.primarySoft, borderRadius: 10, padding: 12 }}>
              <Text style={{ color: colors.primaryDark }}>Lời dặn: {p.advice}</Text>
            </View>
          ) : null}
          <Muted>Đưa màn hình này cho nhân viên nhà thuốc để mua đúng thuốc và số lượng.</Muted>
        </Card>
      ) : (
        <Empty title="Lần khám này không kê đơn" />
      )}
    </Screen>
  );
}
