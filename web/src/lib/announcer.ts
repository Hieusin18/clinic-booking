/**
 * Loa gọi số ở màn hình quầy: tiếng chuông "ding-dong" rồi đọc câu mời bằng giọng tiếng Việt của trình duyệt
 * (Web Speech API). Trình duyệt chỉ cho phát âm thanh sau khi người dùng bấm vào trang, nên màn hình quầy
 * có nút "Bật loa" để mở khóa một lần.
 */

/** "A07" → "A 7" để giọng đọc nói "A bảy" thay vì "A không bảy". */
export function spellLabel(label: string) {
  const m = /^([A-Z])0*(\d+)$/.exec(label);
  return m ? `${m[1]} ${m[2]}` : label;
}

/** Câu mời: "Mời bệnh nhân số A 7, vào Phòng 2." (chưa đặt phòng thì đọc tên bác sĩ). */
export function announcement(e: { label: string; room: string | null; doctorName: string }) {
  return `Mời bệnh nhân số ${spellLabel(e.label)}, vào ${e.room?.trim() || `phòng khám ${e.doctorName}`}.`;
}

/** Giọng tiếng Việt tốt nhất có trên máy: ưu tiên giọng "Natural"/"Online" (Edge), rồi giọng có sẵn. */
export function pickVietnameseVoice(voices: readonly SpeechSynthesisVoice[]) {
  const vi = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('vi'));
  return vi.find((v) => /natural|online/i.test(v.name)) ?? vi.find((v) => v.localService) ?? vi[0];
}

/** Chuông hai nốt bằng Web Audio (không cần tệp âm thanh). Trả về thời gian chuông kéo dài (giây). */
export function chime(ctx: AudioContext) {
  const notes: [number, number][] = [
    [880, 0],
    [660, 0.45],
  ];
  for (const [freq, at] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = ctx.currentTime + at;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1);
  }
  return 1.1;
}

export class Announcer {
  private ctx: AudioContext | null = null;
  private readonly synth: SpeechSynthesis | undefined;

  constructor(synth: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined) {
    this.synth = synth;
  }

  /** Có đọc được tiếng Việt không (để báo người dùng mở bằng Edge hoặc cài giọng đọc tiếng Việt). */
  hasVietnameseVoice() {
    return !!this.synth && !!pickVietnameseVoice(this.synth.getVoices());
  }

  /** Gọi trong sự kiện bấm nút: mở khóa âm thanh của trình duyệt. */
  unlock() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx && !this.ctx) this.ctx = new Ctx();
    void this.ctx?.resume();
    // Một câu rỗng để Chrome cho phép đọc về sau
    if (typeof SpeechSynthesisUtterance !== 'undefined') this.synth?.speak(new SpeechSynthesisUtterance(''));
  }

  /** Chuông rồi đọc câu mời hai lần. */
  announce(e: { label: string; room: string | null; doctorName: string }) {
    const delay = this.ctx ? chime(this.ctx) * 1000 : 0;
    const text = announcement(e);
    setTimeout(() => {
      if (!this.synth || typeof SpeechSynthesisUtterance === 'undefined') return;
      const voice = pickVietnameseVoice(this.synth.getVoices());
      for (let i = 0; i < 2; i++) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'vi-VN';
        if (voice) u.voice = voice;
        u.rate = 0.9;
        this.synth.speak(u);
      }
    }, delay);
    return text;
  }
}
