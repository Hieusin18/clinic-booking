import type { MedicalRecord } from './types';

const num = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

/** BMI = cân nặng (kg) / chiều cao (m)², làm tròn 1 chữ số. */
export const bmi = (weight: number | null, height: number | null) =>
  weight && height ? Math.round((weight / (height / 100) ** 2) * 10) / 10 : null;

/** Các dấu hiệu sinh tồn đã đo, dạng nhãn – giá trị để hiển thị. */
export function vitals(r: MedicalRecord): { label: string; value: string }[] {
  const list: [string, string | null][] = [
    ['Mạch', r.pulse != null ? `${r.pulse} lần/phút` : null],
    ['Nhiệt độ', r.temperature != null ? `${num(r.temperature)} °C` : null],
    ['Huyết áp', r.bpSystolic != null && r.bpDiastolic != null ? `${r.bpSystolic}/${r.bpDiastolic} mmHg` : null],
    ['Nhịp thở', r.respiratoryRate != null ? `${r.respiratoryRate} lần/phút` : null],
    ['SpO₂', r.spo2 != null ? `${r.spo2} %` : null],
    ['Cân nặng', r.weight != null ? `${num(r.weight)} kg` : null],
    ['Chiều cao', r.height != null ? `${num(r.height)} cm` : null],
  ];
  const b = bmi(r.weight, r.height);
  if (b) list.push(['BMI', num(b)]);
  return list.filter((x): x is [string, string] => x[1] !== null).map(([label, value]) => ({ label, value }));
}

/** "Viêm họng cấp (J02.9)" */
export const withIcd = (text: string, code: string | null) => (code ? `${text} (${code})` : text);

export type ExportFormat = 'pdf' | 'docx';

/** Thông tin file tải về để chia sẻ/mở bằng ứng dụng khác. */
export const EXPORT_TYPES: Record<ExportFormat, { mimeType: string; uti: string; label: string }> = {
  pdf: { mimeType: 'application/pdf', uti: 'com.adobe.pdf', label: 'PDF' },
  docx: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', uti: 'org.openxmlformats.wordprocessingml.document', label: 'Word' },
};

/** Tên file: benh-an-2026-11-06.pdf */
export const exportFileName = (visitDate: string, format: ExportFormat) => `benh-an-${visitDate.slice(0, 10)}.${format}`;

/** Thông báo dễ hiểu khi tải file lỗi; expo-file-system báo lỗi kèm mã HTTP. */
export function downloadError(message: string) {
  if (/\b401\b/.test(message)) return 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại';
  if (/\b409\b/.test(message)) return 'Lượt khám chưa có bệnh án';
  if (/\b404\b/.test(message)) return 'Không tìm thấy lượt khám';
  return 'Không tải được file, kiểm tra kết nối mạng rồi thử lại';
}
