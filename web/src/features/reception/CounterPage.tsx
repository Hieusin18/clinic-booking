import { useQuery } from '@tanstack/react-query';
import { Button, Flex, Typography } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { doctorName } from '../../lib/format';
import type { Visit } from '../../lib/types';

/**
 * Màn hình đặt ở quầy: mã QR tự đổi (token hết hạn sau 60 giây nên ảnh chụp không dùng lại được)
 * và các số đang được gọi vào khám.
 */
export function CounterPage() {
  const navigate = useNavigate();
  const qr = useQuery({
    queryKey: ['qr'],
    queryFn: async () => (await api.get<{ token: string; refreshAfterSeconds: number }>('/qr/current')).data,
    refetchInterval: (q) => (q.state.data?.refreshAfterSeconds ?? 30) * 1000,
    refetchIntervalInBackground: true,
  });
  const queue = useQuery({
    queryKey: ['queue', 'today', 'counter'],
    queryFn: async () => (await api.get<Visit[]>('/queue/today')).data,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
  const calling = (queue.data ?? []).filter((v) => v.status === 'IN_PROGRESS');

  return (
    <Flex style={{ minHeight: '100vh', background: '#0f766e', color: '#fff' }} wrap>
      <Flex vertical align="center" justify="center" gap={24} style={{ flex: '1 1 480px', padding: 48 }}>
        <Typography.Title style={{ color: '#fff', margin: 0, textAlign: 'center' }}>Quét mã để lấy số</Typography.Title>
        <div style={{ background: '#fff', padding: 24, borderRadius: 24 }}>
          {qr.data ? <QRCodeSVG value={qr.data.token} size={320} level="M" data-testid="qr" /> : <div style={{ width: 320, height: 320 }} />}
        </div>
        <Typography.Text style={{ color: '#ccfbf1', fontSize: 20, textAlign: 'center' }}>
          Mở ứng dụng Phòng khám → tab <b>Lấy số</b> → <b>Quét mã QR</b>
        </Typography.Text>
        {qr.isError && <Typography.Text style={{ color: '#fecaca' }}>Không lấy được mã QR, đang thử lại…</Typography.Text>}
      </Flex>
      <Flex vertical gap={16} style={{ flex: '1 1 360px', padding: 48, background: '#115e59' }}>
        <Typography.Title level={2} style={{ color: '#fff', margin: 0 }}>Đang khám</Typography.Title>
        {calling.length === 0 ? (
          <Typography.Text style={{ color: '#99f6e4', fontSize: 20 }}>Chưa gọi số nào</Typography.Text>
        ) : (
          calling.map((v) => (
            <Flex key={v.id} justify="space-between" align="center" style={{ background: '#0f766e', borderRadius: 16, padding: '16px 24px' }}>
              <Typography.Text style={{ color: '#fff', fontSize: 22 }}>{doctorName(v.doctor)}</Typography.Text>
              <Typography.Text style={{ color: '#fff', fontSize: 48, fontWeight: 800 }}>{v.queueNumber}</Typography.Text>
            </Flex>
          ))
        )}
        <Button ghost style={{ marginTop: 'auto', alignSelf: 'flex-start' }} onClick={() => navigate('/reception')}>
          ‹ Về trang tiếp đón
        </Button>
      </Flex>
    </Flex>
  );
}
