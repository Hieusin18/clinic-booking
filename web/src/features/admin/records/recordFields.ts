import type { MedicalRecord } from '../../../lib/types';

/** Tên các ô bệnh án, giống nhãn trên phiếu bác sĩ ghi */
export const FIELD_LABEL: Partial<Record<keyof MedicalRecord, string>> = {
  reason: 'Lý do đến khám',
  symptoms: 'Quá trình bệnh lý',
  personalHistory: 'Tiền sử bản thân',
  familyHistory: 'Tiền sử gia đình',
  pulse: 'Mạch',
  temperature: 'Nhiệt độ',
  bpSystolic: 'Huyết áp tâm thu',
  bpDiastolic: 'Huyết áp tâm trương',
  respiratoryRate: 'Nhịp thở',
  spo2: 'SpO₂',
  weight: 'Cân nặng',
  height: 'Chiều cao',
  generalExam: 'Khám toàn thân',
  organExam: 'Khám các bộ phận',
  labSummary: 'Tóm tắt kết quả cận lâm sàng',
  orders: 'Chỉ định cận lâm sàng',
  diagnosis: 'Chẩn đoán bệnh chính',
  icdCode: 'Mã ICD-10',
  secondaryDiagnosis: 'Bệnh kèm theo',
  secondaryIcdCodes: 'Mã ICD-10 bệnh kèm theo',
  treatment: 'Hướng xử trí, điều trị',
  followUpDate: 'Hẹn tái khám',
};

const UNIT: Partial<Record<keyof MedicalRecord, string>> = {
  pulse: ' l/ph',
  temperature: ' °C',
  bpSystolic: ' mmHg',
  bpDiastolic: ' mmHg',
  respiratoryRate: ' l/ph',
  spo2: '%',
  weight: ' kg',
  height: ' cm',
};

/** Giá trị một ô để hiển thị: số kèm đơn vị, ngày dạng dd/mm/yyyy, trống thì null */
export function fieldValue(field: keyof MedicalRecord, v: string | number | null): string | null {
  if (v === null || v === '') return null;
  if (typeof v === 'number') return `${v.toLocaleString('vi-VN')}${UNIT[field] ?? ''}`;
  if (field === 'followUpDate') {
    const [y, m, d] = v.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return v;
}
