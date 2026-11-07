import { SoundOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Flex } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Announcer } from '../../lib/announcer';
import { api } from '../../lib/api';
import { doctorName, ticketLabel } from '../../lib/format';
import { useRealtime, useRealtimeEvent, type CalledEvent } from '../../lib/realtime';
import { C } from '../../lib/theme';
import type { Visit } from '../../lib/types';
import { byCallOrder } from './visitStatus';

const PANEL = '#273049';
const DIM = '#9AA3B5';
/** Số vừa gọi được làm nổi bật trong bấy nhiêu giây */
const FLASH_MS = 12_000;

/**
 * Màn hình đặt ở quầy: mã QR tự đổi (token hết hạn sau 60 giây nên ảnh chụp không dùng lại được),
 * số đang khám ở từng phòng, vài số sắp gọi, và loa đọc số mỗi khi bác sĩ gọi (qua WebSocket).
 */
export function CounterPage() {
  const navigate = useNavigate();
  const { connected } = useRealtime();
  const announcer = useRef<Announcer | null>(null);
  const [speaker, setSpeaker] = useState(false);
  const [noVoice, setNoVoice] = useState(false);
  const [flash, setFlash] = useState<CalledEvent | null>(null);

  const qr = useQuery({
    queryKey: ['qr'],
    queryFn: async () => (await api.get<{ token: string; refreshAfterSeconds: number }>('/qr/current')).data,
    refetchInterval: (q) => (q.state.data?.refreshAfterSeconds ?? 30) * 1000,
    refetchIntervalInBackground: true,
  });
  const queue = useQuery({
    queryKey: ['queue', 'today', 'counter'],
    queryFn: async () => (await api.get<Visit[]>('/queue/today')).data,
    // WebSocket báo thay đổi ngay; hỏi lại định kỳ chỉ để dự phòng khi mất kết nối
    refetchInterval: connected ? 60_000 : 5_000,
    refetchIntervalInBackground: true,
  });

  useRealtimeEvent<CalledEvent>('queue:called', (e) => {
    setFlash(e);
    if (speaker) announcer.current?.announce(e);
  });
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  const turnOnSpeaker = () => {
    announcer.current ??= new Announcer();
    announcer.current.unlock();
    setSpeaker(true);
    // Danh sách giọng đọc có thể nạp chậm vài trăm mili giây
    setTimeout(() => setNoVoice(!announcer.current?.hasVietnameseVoice()), 500);
  };

  const all = queue.data ?? [];
  const calling = all.filter((v) => v.status === 'IN_PROGRESS');
  const next = all.filter((v) => v.status === 'WAITING').sort(byCallOrder).slice(0, 6);

  return (
    <Flex style={{ minHeight: '100vh', background: C.ink, color: '#fff' }} wrap>
      <Flex vertical align="center" justify="center" gap={24} style={{ flex: '1 1 480px', padding: 48 }}>
        <h1 style={{ color: '#fff', margin: 0, textAlign: 'center', fontSize: 40, fontWeight: 700 }}>Quét mã để lấy số</h1>
        <div style={{ background: '#fff', padding: 24, borderRadius: 24 }}>
          {qr.data ? <QRCodeSVG value={qr.data.token} size={320} level="M" fgColor={C.ink} data-testid="qr" /> : <div style={{ width: 320, height: 320 }} />}
        </div>
        <div style={{ color: DIM, fontSize: 20, textAlign: 'center', maxWidth: 520 }}>
          Mở ứng dụng Phòng khám → tab <b style={{ color: '#fff' }}>Lấy số</b> → <b style={{ color: '#fff' }}>Quét mã QR</b>
          <div style={{ fontSize: 16, marginTop: 8 }}>Đã đặt lịch? Quét trong khung check-in để nhận số A và được ưu tiên.</div>
        </div>
        {qr.isError && <div style={{ color: '#F3C98B' }}>Không lấy được mã QR, đang thử lại…</div>}
      </Flex>
      <Flex vertical gap={16} style={{ flex: '1 1 400px', padding: 48, background: PANEL }}>
        {flash && (
          <div role="status" aria-live="assertive" className="counter-flash" style={{ background: C.stamp, borderRadius: 20, padding: '16px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 600, opacity: 0.9 }}>{flash.recall ? 'Mời lại số' : 'Mời số'}</div>
            <div className="num" style={{ fontSize: 110, fontWeight: 700, lineHeight: 1 }}>
              {flash.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{flash.room ? `vào ${flash.room}` : `vào phòng khám ${flash.doctorName}`}</div>
          </div>
        )}
        <div style={{ color: DIM, fontSize: 16, fontWeight: 600, letterSpacing: 1 }}>ĐANG KHÁM</div>
        {calling.length === 0 ? (
          <div style={{ color: DIM, fontSize: 20 }}>Chưa gọi số nào</div>
        ) : (
          calling.map((v) => (
            <Flex key={v.id} justify="space-between" align="center" style={{ background: '#fff', color: C.ink, borderRadius: 18, padding: '10px 24px' }}>
              <div>
                {v.doctor.room && <div style={{ fontSize: 15, fontWeight: 700, color: C.stamp, letterSpacing: 0.5 }}>{v.doctor.room.toUpperCase()}</div>}
                <div style={{ fontSize: 20, fontWeight: 700 }}>{doctorName(v.doctor)}</div>
                <div style={{ color: C.muted, fontSize: 15 }}>{v.doctor.specialty?.name}</div>
              </div>
              <div className="num" style={{ fontSize: 76, fontWeight: 700, lineHeight: 1, color: C.stamp }}>
                {ticketLabel(v)}
              </div>
            </Flex>
          ))
        )}
        {next.length > 0 && (
          <>
            <div style={{ color: DIM, fontSize: 16, fontWeight: 600, letterSpacing: 1, marginTop: 12 }}>SẮP GỌI</div>
            <Flex gap={10} wrap>
              {next.map((v) => (
                <span key={v.id} className="num" style={{ fontSize: 30, fontWeight: 600, padding: '2px 16px', borderRadius: 12, border: `2px solid ${v.source === 'ONLINE' ? '#8E92E8' : '#4A5470'}` }}>
                  {ticketLabel(v)}
                </span>
              ))}
            </Flex>
          </>
        )}
        <Flex vertical gap={10} style={{ marginTop: 'auto' }}>
          {noVoice && (
            <div style={{ color: '#F3C98B', fontSize: 14, maxWidth: 420 }}>
              Máy này chưa có giọng đọc tiếng Việt nên chỉ có chuông. Mở trang bằng Microsoft Edge, hoặc cài giọng đọc Tiếng Việt trong Cài đặt Windows → Thời gian và ngôn
              ngữ → Giọng nói.
            </div>
          )}
          <Flex gap={12} align="center" wrap>
            {speaker ? (
              <span style={{ color: '#9BD7B5', fontSize: 14, fontWeight: 600 }}>
                <SoundOutlined /> Loa đang bật
              </span>
            ) : (
              <Button ghost icon={<SoundOutlined />} onClick={turnOnSpeaker}>
                Bật loa gọi số
              </Button>
            )}
            <Button ghost onClick={() => navigate('/reception')}>
              ‹ Về trang tiếp đón
            </Button>
            <span style={{ color: connected ? '#9BD7B5' : '#F3C98B', fontSize: 13 }}>{connected ? '● Trực tiếp' : '● Đang kết nối lại…'}</span>
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
}
