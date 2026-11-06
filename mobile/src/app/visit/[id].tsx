import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, Empty, ErrorBox, Loading, Muted, Screen, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { RecordActions } from '@/components/RecordActions';
import { errorMessage } from '@/lib/errors';
import { doctorName, formatDate, formatDay } from '@/lib/format';
import { medicineName, usage } from '@/lib/prescription';
import { vitals, withIcd } from '@/lib/record';
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

function Section({ title }: { title: string }) {
  return <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primaryDark, marginTop: 6, textTransform: 'uppercase' }}>{title}</Text>;
}

/** Chi tiết một lần khám: bệnh án ngoại trú và đơn thuốc; tải bản điện tử PDF/Word để lưu, in hoặc gửi. */
export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const visit = useQuery({ queryKey: ['visit', id], queryFn: async () => (await api.get<VisitDetail>(`/visits/${id}`)).data });
  const v = visit.data;

  if (visit.isLoading) return <Screen><Loading /></Screen>;
  if (!v) return <Screen><ErrorBox message={visit.error ? errorMessage(visit.error) : 'Không tìm thấy lần khám'} /></Screen>;



  const r = v.medicalRecord;
  const p = v.prescription;
  const signs = r ? vitals(r) : [];
  return (
    <Screen refreshing={visit.isRefetching} onRefresh={visit.refetch}>
      <Stack.Screen options={{ title: `Khám ngày ${formatDay(v.date)}` }} />
      <Card>
        <Text style={styles.title}>Bệnh án ngoại trú</Text>
        <Muted>
          {doctorName(v.doctor)}
          {v.doctor.specialty ? ` · ${v.doctor.specialty.name}` : ''}
        </Muted>
        {r ? (
          <>
            <Section title="Chẩn đoán" />
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{withIcd(r.diagnosis, r.icdCode)}</Text>
            <Row label="Bệnh kèm theo" value={r.secondaryDiagnosis && withIcd(r.secondaryDiagnosis, r.secondaryIcdCodes)} />

            <Section title="Hỏi bệnh" />
            <Row label="Lý do đến khám" value={r.reason ?? v.reason} />
            <Row label="Quá trình bệnh lý" value={r.symptoms} />
            <Row label="Tiền sử bản thân" value={r.personalHistory} />
            <Row label="Tiền sử gia đình" value={r.familyHistory} />

            {(signs.length > 0 || r.generalExam || r.organExam || r.orders || r.labSummary) && <Section title="Khám bệnh" />}
            {signs.length > 0 && (
              <View style={styles.wrap}>
                {signs.map((s) => (
                  <View key={s.label} style={{ backgroundColor: colors.primarySoft, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 }}>
                    <Text style={{ fontSize: 12, color: colors.primaryDark }}>{s.label}</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{s.value}</Text>
                  </View>
                ))}
              </View>
            )}
            <Row label="Toàn thân" value={r.generalExam} />
            <Row label="Các bộ phận" value={r.organExam} />
            <Row label="Chỉ định cận lâm sàng" value={r.orders} />
            <Row label="Kết quả cận lâm sàng" value={r.labSummary} />

            {(r.treatment || r.followUpDate) && <Section title="Điều trị" />}
            <Row label="Hướng xử trí, điều trị" value={r.treatment} />
            {r.followUpDate && (
              <View style={{ backgroundColor: colors.primarySoft, borderRadius: 10, padding: 12 }}>
                <Text style={{ color: colors.primaryDark, fontWeight: '700' }}>Hẹn tái khám ngày {formatDay(r.followUpDate)}</Text>
              </View>
            )}
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
          {p.code ? <Muted>Mã đơn thuốc: {p.code}</Muted> : null}
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

      {r && (
        <Card>
          <Text style={styles.title}>Bản điện tử</Text>
          <Muted>Bệnh án và đơn thuốc theo mẫu in của phòng khám. Xem trước rồi tải về để lưu, in hoặc gửi cho bác sĩ khác.</Muted>
          <Button title="Xem trước" onPress={() => router.push({ pathname: '/preview/[id]', params: { id: v.id, date: v.date } })} />
          <RecordActions visitId={v.id} visitDate={v.date} />
        </Card>
      )}
    </Screen>
  );
}
