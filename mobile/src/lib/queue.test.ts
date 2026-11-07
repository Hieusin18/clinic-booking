import { describe, expect, it } from 'vitest';
import { standingNotice, waitHint } from './queue';

const pos = (over: {
  status?: 'WAITING' | 'IN_PROGRESS' | 'AWAITING_RESULTS' | 'DONE' | 'LEFT';
  source?: 'ONLINE' | 'WALK_IN';
  appointmentAt?: string | null;
  peopleAhead?: number;
  due?: boolean;
  resultMode?: 'RETURN' | 'ONLINE' | null;
  resultsReadyAt?: string | null;
}) => ({
  peopleAhead: over.peopleAhead ?? 3,
  due: over.due ?? false,
  estimatedCallAt: '2026-11-09T01:22:00.000Z',
  visit: {
    status: over.status ?? 'WAITING',
    source: over.source ?? 'WALK_IN',
    appointmentAt: over.appointmentAt ?? null,
    resultMode: over.resultMode ?? null,
    resultsReadyAt: over.resultsReadyAt ?? null,
  },
});

describe('câu nhắc trên phiếu số', () => {
  it('người vãng lai: số người là ước tính, có thể bị lùi khi người đặt lịch đến giờ', () => {
    const h = waitHint(pos({}));
    expect(h.text).toBe('Còn khoảng 3 người phía trước. Dự kiến được gọi khoảng 08:22.');
    expect(h.note).toMatch(/lịch hẹn đến giờ sẽ được ưu tiên/);
  });
  it('người đặt lịch đã đến giờ hẹn', () => {
    expect(waitHint(pos({ source: 'ONLINE', appointmentAt: '2026-11-09T01:15:00.000Z', due: true, peopleAhead: 1 })).text).toBe(
      'Còn 1 người phía trước. Dự kiến được gọi khoảng 08:22.',
    );
  });
  it('người đặt lịch đến sớm: báo giờ dự kiến và sẽ được ưu tiên khi gần giờ hẹn', () => {
    const h = waitHint(pos({ source: 'ONLINE', appointmentAt: '2026-11-09T01:30:00.000Z' }));
    expect(h.text).toBe('Bạn đến sớm hơn giờ hẹn 08:30. Dự kiến được gọi khoảng 08:22.');
    expect(h.note).toMatch(/ưu tiên/);
  });
  it('là người tiếp theo', () => expect(waitHint(pos({ peopleAhead: 0 })).text).toMatch(/người tiếp theo/));
  it('đến lượt', () => expect(waitHint(pos({ status: 'IN_PROGRESS' })).text).toMatch(/mời vào phòng khám/));
  it('đi làm cận lâm sàng rồi quay lại: giữ số, có kết quả được gọi trước', () => {
    const h = waitHint(pos({ status: 'AWAITING_RESULTS', resultMode: 'RETURN' }));
    expect(h.text).toMatch(/quay lại khu chờ và giữ nguyên số/);
    expect(h.note).toMatch(/gọi vào trước/);
    expect(waitHint(pos({ status: 'WAITING', resultsReadyAt: '2026-11-09T02:00:00.000Z' })).text).toMatch(/Đã có kết quả cận lâm sàng/);
  });
  it('nhận kết quả online: được ra về, xem trong Lịch sử', () => {
    const h = waitHint(pos({ status: 'AWAITING_RESULTS', resultMode: 'ONLINE' }));
    expect(h.text).toMatch(/ra về/);
    expect(h.note).toMatch(/tab Lịch sử/);
  });
  it('đã khám xong thì nhắc xem đơn thuốc', () => expect(waitHint(pos({ status: 'DONE' })).text).toMatch(/đơn thuốc/));
});

describe('cảnh báo khi đặt lịch', () => {
  const base = { limit: 3, windowDays: 30, lockedUntil: null };
  it('chưa có lần không đến nào thì không cảnh báo', () => expect(standingNotice({ ...base, recentNoShows: 0 })).toBeNull());
  it('còn 1 lần nữa là bị khóa thì nhắc trước', () => {
    expect(standingNotice({ ...base, recentNoShows: 2 })).toMatchObject({ blocked: false, text: expect.stringMatching(/thêm 1 lần nữa/) });
  });
  it('đang bị khóa thì không cho đặt và báo ngày mở lại', () => {
    expect(standingNotice({ ...base, recentNoShows: 3, lockedUntil: '2026-11-21' })).toMatchObject({
      blocked: true,
      text: expect.stringMatching(/đến hết ngày 21\/11\/2026.*lấy số trực tiếp/),
    });
  });
});
