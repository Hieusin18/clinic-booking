import type { Vitals } from '../../lib/types';

export type VitalField = 'pulse' | 'temperature' | 'bpSystolic' | 'bpDiastolic' | 'respiratoryRate' | 'spo2' | 'weight' | 'height';
export const VITAL_FIELDS: VitalField[] = ['pulse', 'temperature', 'bpSystolic', 'bpDiastolic', 'respiratoryRate', 'spo2', 'weight', 'height'];

type Measured = Partial<Pick<Vitals, VitalField>>;

/**
 * Chỉ số bất thường ở người lớn để điều dưỡng báo bác sĩ (ngưỡng sàng lọc, không thay chẩn đoán):
 * sốt ≥ 37,5 °C (cao ≥ 38,5), SpO₂ < 95%, huyết áp ≥ 140/90 hoặc tâm thu < 90, mạch > 100 hoặc < 50, nhịp thở > 24.
 */
export function warnings(v: Measured): { text: string; severe: boolean }[] {
  const out: { text: string; severe: boolean }[] = [];
  const t = v.temperature;
  if (t != null && t >= 37.5) out.push({ text: t >= 38.5 ? 'Sốt cao' : 'Sốt', severe: t >= 38.5 });
  if (v.spo2 != null && v.spo2 < 95) out.push({ text: 'SpO₂ thấp', severe: v.spo2 < 92 });
  const s = v.bpSystolic;
  const d = v.bpDiastolic;
  if (s != null && d != null) {
    if (s >= 180 || d >= 120) out.push({ text: 'Huyết áp rất cao', severe: true });
    else if (s >= 140 || d >= 90) out.push({ text: 'Huyết áp cao', severe: false });
    else if (s < 90) out.push({ text: 'Huyết áp thấp', severe: true });
  }
  if (v.pulse != null && (v.pulse > 100 || v.pulse < 50)) out.push({ text: v.pulse > 100 ? 'Mạch nhanh' : 'Mạch chậm', severe: v.pulse > 130 || v.pulse < 40 });
  if (v.respiratoryRate != null && v.respiratoryRate > 24) out.push({ text: 'Thở nhanh', severe: v.respiratoryRate > 30 });
  return out;
}

const n = (x: number) => x.toLocaleString('vi-VN');

/** Tóm tắt một dòng: "M 88 · 38,5 °C · HA 130/85 · SpO₂ 97% · 62,5 kg" */
export function summary(v: Measured): string {
  const parts: string[] = [];
  if (v.pulse != null) parts.push(`M ${v.pulse}`);
  if (v.temperature != null) parts.push(`${n(v.temperature)} °C`);
  if (v.bpSystolic != null && v.bpDiastolic != null) parts.push(`HA ${v.bpSystolic}/${v.bpDiastolic}`);
  if (v.respiratoryRate != null) parts.push(`NT ${v.respiratoryRate}`);
  if (v.spo2 != null) parts.push(`SpO₂ ${v.spo2}%`);
  if (v.weight != null) parts.push(`${n(v.weight)} kg`);
  if (v.height != null) parts.push(`${n(v.height)} cm`);
  return parts.join(' · ');
}

/**
 * Điền sinh hiệu điều dưỡng đã đo vào bệnh án: chỉ các ô bác sĩ chưa ghi (bác sĩ đo lại thì giữ số của bác sĩ).
 * Trả về danh sách ô đã điền.
 */
export function prefill<T extends Measured>(record: T, vitals: Measured | null | undefined): { values: T; filled: VitalField[] } {
  if (!vitals) return { values: record, filled: [] };
  const values = { ...record };
  const filled: VitalField[] = [];
  for (const f of VITAL_FIELDS) {
    if ((values[f] === null || values[f] === undefined) && vitals[f] != null) {
      (values as Measured)[f] = vitals[f];
      filled.push(f);
    }
  }
  return { values, filled };
}
