import { describe, expect, it } from 'vitest';
import { medicineName, usage } from './prescription';

describe('hiển thị đơn thuốc', () => {
  it('tên thuốc kèm hàm lượng', () => {
    expect(medicineName({ id: 'm', name: 'Paracetamol', strength: '500mg', unit: 'viên', activeIngredient: null })).toBe('Paracetamol 500mg');
    expect(medicineName({ id: 'm', name: 'Oresol', strength: null, unit: 'gói', activeIngredient: null })).toBe('Oresol');
  });
  it('cách dùng thành câu dễ đọc', () => {
    expect(usage({ dosePerTime: '1 viên', timesPerDay: 2, days: 5, note: 'Uống sau ăn' })).toBe('Mỗi lần 1 viên, 2 lần/ngày, trong 5 ngày. Uống sau ăn');
  });
});
