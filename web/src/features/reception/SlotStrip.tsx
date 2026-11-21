import { Tooltip } from 'antd';
import { formatTime } from '../../lib/format';
import { C } from '../../lib/theme';
import { SLOT_STATE_LABEL, type CapacitySlot, type SlotState } from './capacity';

const STYLE: Record<SlotState, { color: string; background: string; border: string; textDecoration?: string }> = {
  FREE: { color: C.good, background: C.goodSoft, border: C.good },
  BOOKED: { color: C.muted, background: C.seg, border: C.seg },
  WALK_IN: { color: C.stamp, background: C.stampSoft, border: C.stampSoft },
  PAST: { color: C.faint, background: 'transparent', border: C.line, textDecoration: 'line-through' },
};

/** Dải khung giờ hôm nay của một bác sĩ: khung trống viền xanh, khung đã có người tô xám/tím, khung đã qua gạch ngang */
export function SlotStrip({ slots }: { slots: CapacitySlot[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {slots.map((s) => {
        const st = STYLE[s.state];
        const range = `${formatTime(s.start)}–${formatTime(s.end)}`;
        return (
          <Tooltip key={s.id} title={`${range}: ${SLOT_STATE_LABEL[s.state]}`}>
            <span
              className="num"
              aria-label={`${range} ${SLOT_STATE_LABEL[s.state]}`}
              style={{ fontSize: 14, lineHeight: '22px', padding: '0 7px', borderRadius: 6, border: `1px solid ${st.border}`, color: st.color, background: st.background, textDecoration: st.textDecoration, fontWeight: s.state === 'FREE' ? 600 : 400 }}
            >
              {formatTime(s.start)}
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Chú thích màu cho dải khung giờ */
export function SlotLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12.5, color: C.muted }}>
      {(Object.keys(STYLE) as SlotState[]).map((k) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, border: `1px solid ${STYLE[k].border}`, background: STYLE[k].background }} />
          {SLOT_STATE_LABEL[k]}
        </span>
      ))}
    </div>
  );
}
