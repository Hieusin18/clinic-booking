import { describe, expect, it } from 'vitest';
import { waitHint } from './queue';

describe('câu nhắc trên phiếu số', () => {
  it('còn người phía trước', () => expect(waitHint('WAITING', 3)).toBe('Còn 3 người phía trước.'));
  it('là người tiếp theo', () => expect(waitHint('WAITING', 0)).toMatch(/người tiếp theo/));
  it('đến lượt', () => expect(waitHint('IN_PROGRESS', 0)).toMatch(/mời vào phòng khám/));
  it('đã khám xong thì nhắc xem đơn thuốc', () => expect(waitHint('DONE', 0)).toMatch(/đơn thuốc/));
});
