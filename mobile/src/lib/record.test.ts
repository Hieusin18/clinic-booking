import { describe, expect, it } from 'vitest';
import { bmi, downloadError, exportFileName, vitals, withIcd } from './record';
import type { MedicalRecord } from './types';

const base: MedicalRecord = {
  id: 'r', reason: null, symptoms: 'Sốt', personalHistory: null, familyHistory: null, pulse: null, temperature: null, bpSystolic: null, bpDiastolic: null,
  respiratoryRate: null, spo2: null, weight: null, height: null, generalExam: null, organExam: null, labSummary: null, orders: null,
  diagnosis: 'Sốt', icdCode: null, secondaryDiagnosis: null, secondaryIcdCodes: null, treatment: null, followUpDate: null,
};

describe('bệnh án trên app', () => {
  it('chỉ hiện các chỉ số đã đo, kèm đơn vị và BMI', () => {
    expect(vitals(base)).toEqual([]);
    expect(vitals({ ...base, pulse: 88, temperature: 38.2, bpSystolic: 120, bpDiastolic: 75, weight: 68, height: 172 })).toEqual([
      { label: 'Mạch', value: '88 lần/phút' },
      { label: 'Nhiệt độ', value: '38,2 °C' },
      { label: 'Huyết áp', value: '120/75 mmHg' },
      { label: 'Cân nặng', value: '68 kg' },
      { label: 'Chiều cao', value: '172 cm' },
      { label: 'BMI', value: '23' },
    ]);
  });
  it('BMI cần đủ cân nặng và chiều cao', () => {
    expect(bmi(68, null)).toBeNull();
    expect(bmi(50, 160)).toBe(19.5);
  });
  it('chẩn đoán kèm mã ICD-10, tên file theo ngày khám', () => {
    expect(withIcd('Viêm họng cấp', 'J02.9')).toBe('Viêm họng cấp (J02.9)');
    expect(withIcd('Viêm họng cấp', null)).toBe('Viêm họng cấp');
    expect(exportFileName('2026-11-06T00:00:00.000Z', 'docx')).toBe('benh-an-2026-11-06.docx');
  });
  it('báo lỗi tải file dễ hiểu theo mã HTTP', () => {
    expect(downloadError('UnableToDownload: Unable to download file: 409')).toBe('Lượt khám chưa có bệnh án');
    expect(downloadError('Unable to download file: 401')).toBe('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại');
    expect(downloadError('Network request failed')).toBe('Không tải được file, kiểm tra kết nối mạng rồi thử lại');
  });
});
