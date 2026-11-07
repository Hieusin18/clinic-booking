import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { LabResults } from '@/components/LabResults';
import { RecordActions } from '@/components/RecordActions';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';
import { Badge, Button, Card, Empty, ErrorBox, Loading, Muted, Perforation, Screen, SectionLabel, colors, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useMarkVisitRead } from '@/lib/notifications';
import { doctorName, formatDate, formatDay } from '@/lib/format';
import { medicineName, usage } from '@/lib/prescription';
import { vitals, withIcd } from '@/lib/record';
import type { VisitDetail } from '@/lib/types';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={{ gap: 2 }}>
      <Muted>{label}</Muted>
      <Text style={{ fontSize: 15.5, lineHeight: 22, color: colors.text }}>{value}</Text>
    </View>
  );
}

/** "120/80 mmHg" → số "120/80" (chữ số hẹp) và đơn vị "mmHg". */
function splitUnit(value: string) {
  const i = value.indexOf(' ');
  return i < 0 ? { n: value, unit: '' } : { n: value.slice(0, i), unit: value.slice(i + 1) };
}

/** Chi tiết một lần khám: bệnh án ngoại trú và đơn thuốc; tải bản điện tử PDF/Word để lưu, in hoặc gửi. */
export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const visit = useQuery({ queryKey: ['visit', id], queryFn: async () => (await api.get<VisitDetail>(`/visits/${id}`)).data });
  const v = visit.data;
  // Mở chi tiết lần khám đã xong: tin "có kết quả / đã lưu bệnh án" của lần này thành đã đọc
  useMarkVisitRead(id, ['VISIT_DONE'], v?.status === 'DONE');

  if (visit.isLoading) return <Screen><Loading /></Screen>;
  if (!v) return <Screen><ErrorBox message={visit.error ? errorMessage(visit.error) : 'Không tìm thấy lần khám'} /></Screen>;

  const r = v.medicalRecord;
  const p = v.prescription;
  const signs = r ? vitals(r) : [];
  return (
    <Screen refreshing={visit.isRefetching} onRefresh={visit.refetch}>
      <Stack.Screen options={{ title: `Khám ngày ${formatDay(v.date)}` }} />
      {v.status === 'AWAITING_RESULTS' ? (
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.stampSoft, borderRadius: 12, padding: 12 }}>
          <Icon name="clock" color={colors.stamp} size={20} strokeWidth={2} />
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.text }}>
            {v.resultMode === 'ONLINE'
              ? 'Bác sĩ đang chờ kết quả cận lâm sàng. Khi bác sĩ đọc kết quả và kết luận, chẩn đoán cuối cùng và đơn thuốc sẽ hiện ở đây.'
              : 'Bạn đang đi làm cận lâm sàng. Làm xong hãy quay lại khu chờ; có kết quả bạn được gọi vào trước.'}
          </Text>
        </View>
      ) : null}
      <Card>
        <Muted>
          {doctorName(v.doctor)}
          {v.doctor.specialty ? ` · ${v.doctor.specialty.name}` : ''}
        </Muted>
        {r ? (
          <>
            <SectionLabel>CHẨN ĐOÁN</SectionLabel>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, flexShrink: 1 }}>{r.diagnosis}</Text>
              {r.icdCode ? <Badge label={r.icdCode} tone="primary" /> : null}
            </View>
            <Row label="Bệnh kèm theo" value={r.secondaryDiagnosis && withIcd(r.secondaryDiagnosis, r.secondaryIcdCodes)} />

            <SectionLabel>HỎI BỆNH</SectionLabel>
            <Row label="Lý do đến khám" value={r.reason ?? v.reason} />
            <Row label="Quá trình bệnh lý" value={r.symptoms} />
            <Row label="Tiền sử bản thân" value={r.personalHistory} />
            <Row label="Tiền sử gia đình" value={r.familyHistory} />

            {(signs.length > 0 || r.generalExam || r.organExam || r.orders || r.labSummary) && <SectionLabel>KHÁM BỆNH</SectionLabel>}
            {signs.length > 0 && (
              <View style={styles.wrap}>
                {signs.map((s) => {
                  const { n, unit } = splitUnit(s.value);
                  return (
                    <View key={s.label} style={{ backgroundColor: colors.bg, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, minWidth: 92 }}>
                      <Text style={{ fontSize: 12, color: colors.muted }}>{s.label}</Text>
                      <Text style={{ color: colors.text }}>
                        <Text style={{ fontFamily: 'num', fontWeight: '600', fontSize: 22 }}>{n}</Text>
                        {unit ? <Text style={{ fontSize: 12, color: colors.muted }}> {unit}</Text> : null}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            <Row label="Toàn thân" value={r.generalExam} />
            <Row label="Các bộ phận" value={r.organExam} />
            <Row label="Chỉ định cận lâm sàng" value={r.orders} />
            <Row label="Kết quả cận lâm sàng" value={r.labSummary} />

            {(r.treatment || r.followUpDate) && <SectionLabel>ĐIỀU TRỊ</SectionLabel>}
            <Row label="Hướng xử trí, điều trị" value={r.treatment} />
            {r.followUpDate && (
              <View style={{ backgroundColor: colors.stampSoft, borderRadius: 10, padding: 12 }}>
                <Text style={{ color: colors.stamp, fontWeight: '700' }}>Hẹn tái khám ngày {formatDay(r.followUpDate)}</Text>
              </View>
            )}
          </>
        ) : (
          <Muted>Chưa có bệnh án.</Muted>
        )}
      </Card>

      <LabResults orders={v.labOrders ?? []} pending={v.status !== 'DONE'} />

      {p ? (
        <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 2, borderColor: colors.ink }}>
          <View style={{ padding: 16, gap: 2 }}>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Đơn thuốc</Text>
              {p.code ? <Text style={{ fontFamily: 'num', fontWeight: '600', fontSize: 20, color: colors.text, letterSpacing: 0.5 }}>{p.code}</Text> : null}
            </View>
            <Muted>
              {v.patient.fullName} · Kê ngày {p.finalizedAt ? formatDate(p.finalizedAt) : formatDay(v.date)}
            </Muted>
          </View>
          <Perforation />
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {p.items.map((i, idx) => (
              <View key={i.id} style={{ paddingVertical: 10, borderTopWidth: idx ? 1 : 0, borderColor: colors.border, gap: 3 }}>
                <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
                  <Text style={{ fontSize: 15.5, fontWeight: '700', color: colors.text, flex: 1 }}>
                    {idx + 1}. {medicineName(i.medicine)}
                  </Text>
                  <Text style={{ color: colors.stamp }}>
                    <Text style={{ fontFamily: 'num', fontWeight: '700', fontSize: 24 }}>{i.quantity}</Text>
                    <Text style={{ fontSize: 13 }}> {i.medicine.unit}</Text>
                  </Text>
                </View>
                {i.medicine.activeIngredient ? <Muted>Hoạt chất: {i.medicine.activeIngredient}</Muted> : null}
                <Text style={{ color: colors.text, fontSize: 14.5, lineHeight: 21 }}>{usage(i)}</Text>
              </View>
            ))}
            {p.advice ? (
              <View style={{ backgroundColor: colors.bg, borderRadius: 10, padding: 12, marginTop: 4 }}>
                <Text style={{ color: colors.text, lineHeight: 20 }}>Lời dặn: {p.advice}</Text>
              </View>
            ) : null}
            <View style={{ marginTop: 10 }}>
              <Muted>Đưa màn hình này cho nhân viên nhà thuốc để mua đúng thuốc và số lượng.</Muted>
            </View>
          </View>
        </View>
      ) : v.status === 'DONE' ? (
        <Empty title="Lần khám này không kê đơn" />
      ) : null}

      {r && (
        <Card>
          <Text style={styles.title}>Bản điện tử</Text>
          <Muted>Bệnh án và đơn thuốc theo mẫu in của phòng khám. Xem trước rồi tải về để lưu, in hoặc gửi cho bác sĩ khác.</Muted>
          <Button title="Xem trước" variant="secondary" icon="eye" onPress={() => router.push({ pathname: '/preview/[id]', params: { id: v.id, date: v.date } })} />
          <RecordActions visitId={v.id} visitDate={v.date} />
        </Card>
      )}
    </Screen>
  );
}
