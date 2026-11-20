import { describe, expect, it } from 'vitest';
import { prefill, summary, warnings } from './vitals';

describe('sinh hiệu', () => {
  it('tóm tắt một dòng', () => {
    expect(summary({ pulse: 88, temperature: 38.5, bpSystolic: 130, bpDiastolic: 85, spo2: 97, weight: 62.5 })).toBe('M 88 · 38,5 °C · HA 130/85 · SpO₂ 97% · 62,5 kg');
    expect(summary({})).toBe('');
  });

  it('cảnh báo chỉ số bất thường', () => {
    expect(warnings({ temperature: 36.8, spo2: 98, bpSystolic: 120, bpDiastolic: 80, pulse: 75 })).toEqual([]);
    expect(warnings({ temperature: 38.9, spo2: 91 }).map((w) => [w.text, w.severe])).toEqual([
      ['Sốt cao', true],
      ['SpO₂ thấp', true],
    ]);
    expect(warnings({ bpSystolic: 150, bpDiastolic: 95 })[0].text).toBe('Huyết áp cao');
    expect(warnings({ bpSystolic: 185, bpDiastolic: 100 })[0]).toEqual({ text: 'Huyết áp rất cao', severe: true });
    expect(warnings({ pulse: 45 })[0].text).toBe('Mạch chậm');
  });

  it('điền sẵn vào bệnh án, không đè số bác sĩ đã ghi', () => {
    const r = prefill({ pulse: 90, temperature: null, spo2: undefined }, { pulse: 88, temperature: 38.5, spo2: 97, weight: null });
    expect(r.values).toEqual({ pulse: 90, temperature: 38.5, spo2: 97 });
    expect(r.filled).toEqual(['temperature', 'spo2']);
    expect(prefill({ pulse: 1 }, null).filled).toEqual([]);
  });
});
