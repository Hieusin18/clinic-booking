import { describe, expect, it, vi } from 'vitest';
import { Announcer, announcement, pickVietnameseVoice, spellLabel } from './announcer';

const voice = (name: string, lang: string, localService = true) => ({ name, lang, localService }) as SpeechSynthesisVoice;

describe('Loa gọi số', () => {
  it('đọc số không kèm số 0 ở đầu', () => {
    expect(spellLabel('A07')).toBe('A 7');
    expect(spellLabel('B12')).toBe('B 12');
    expect(spellLabel('B100')).toBe('B 100');
    expect(spellLabel('xyz')).toBe('xyz');
  });

  it('câu mời đọc tên phòng, chưa đặt phòng thì đọc tên bác sĩ không kèm học vị viết tắt', () => {
    expect(announcement({ label: 'A07', room: 'Phòng 2', doctorName: 'BS An' })).toBe('Mời bệnh nhân số A 7, vào Phòng 2.');
    expect(announcement({ label: 'B01', room: '  ', doctorName: 'BSCKI Trần Thị Bình', doctorFullName: 'Trần Thị Bình' })).toBe(
      'Mời bệnh nhân số B 1, vào phòng khám bác sĩ Trần Thị Bình.',
    );
    expect(announcement({ label: 'B03', room: null, doctorName: 'An' })).toBe('Mời bệnh nhân số B 3, vào phòng khám bác sĩ An.');
  });

  it('chọn giọng tiếng Việt, ưu tiên giọng Natural/Online', () => {
    const an = voice('Microsoft An - Vietnamese (Vietnam)', 'vi-VN');
    const hoaiMy = voice('Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)', 'vi-VN', false);
    const en = voice('Google US English', 'en-US');
    expect(pickVietnameseVoice([en, an, hoaiMy])).toBe(hoaiMy);
    expect(pickVietnameseVoice([en, an])).toBe(an);
    expect(pickVietnameseVoice([voice('Linh', 'vi_VN', false)])?.name).toBe('Linh');
    expect(pickVietnameseVoice([en])).toBeUndefined();
  });

  it('đọc câu mời hai lần bằng tiếng Việt', () => {
    vi.useFakeTimers();
    class Utterance {
      lang = '';
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    const speak = vi.fn();
    const vi_ = voice('HoaiMy Natural', 'vi-VN');
    const a = new Announcer({ speak, getVoices: () => [vi_] } as unknown as SpeechSynthesis);
    expect(a.hasVietnameseVoice()).toBe(true);
    expect(a.announce({ label: 'A07', room: 'Phòng 2', doctorName: 'BS An' })).toBe('Mời bệnh nhân số A 7, vào Phòng 2.');
    vi.runAllTimers();
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[0][0]).toMatchObject({ text: 'Mời bệnh nhân số A 7, vào Phòng 2.', lang: 'vi-VN', voice: vi_ });
    expect(new Announcer(undefined).hasVietnameseVoice()).toBe(false);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
