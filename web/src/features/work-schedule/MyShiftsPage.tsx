import { useQuery } from '@tanstack/react-query';
import { Button, Card, Empty, Flex, List, Spin, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatTime, todayYmd } from '../../lib/format';
import { C } from '../../lib/theme';
import type { StaffShift } from '../../lib/types';
import { byDay, totalHours, weekDays } from './week';

/** Lễ tân: xem ca trực của mình theo tuần (admin xếp ca). */
export function MyShiftsPage() {
  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const from = weekStart.format('YYYY-MM-DD');
  const to = weekStart.add(6, 'day').format('YYYY-MM-DD');
  const today = todayYmd();
  const shifts = useQuery({
    queryKey: ['shifts', 'mine', from, to],
    queryFn: async () => (await api.get<StaffShift[]>('/shifts/mine', { params: { from, to } })).data,
  });
  const grouped = byDay(shifts.data ?? []);

  return (
    <Card
      title="Ca trực của tôi"
      extra={
        <Flex gap={8} align="center" wrap>
          <Button onClick={() => setWeekStart((w) => w.subtract(7, 'day'))}>‹ Tuần trước</Button>
          <Typography.Text strong>
            {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
          </Typography.Text>
          <Button onClick={() => setWeekStart((w) => w.add(7, 'day'))}>Tuần sau ›</Button>
        </Flex>
      }
    >
      {shifts.isLoading ? (
        <Spin />
      ) : !shifts.data?.length ? (
        <Empty description="Tuần này chưa được xếp ca trực" />
      ) : (
        <>
          <Typography.Paragraph type="secondary">Tổng {totalHours(shifts.data)} trong tuần.</Typography.Paragraph>
          <List
            dataSource={weekDays(weekStart)}
            renderItem={(d) => {
              const key = d.format('YYYY-MM-DD');
              const list = grouped.get(key) ?? [];
              return (
                <List.Item style={key === today ? { background: C.stampSoft, paddingInline: 12, borderRadius: 8 } : { paddingInline: 12 }}>
                  <Typography.Text strong style={{ width: 140, textTransform: 'capitalize' }}>
                    {d.format('dddd DD/MM')}
                  </Typography.Text>
                  <Flex gap={6} wrap style={{ flex: 1 }}>
                    {list.length ? (
                      list.map((s) => (
                        <Tag key={s.id} color="green" style={{ fontSize: 13 }}>
                          {formatTime(s.startTime)}–{formatTime(s.endTime)}
                          {s.note ? ` · ${s.note}` : ''}
                        </Tag>
                      ))
                    ) : (
                      <Typography.Text type="secondary">Nghỉ</Typography.Text>
                    )}
                  </Flex>
                </List.Item>
              );
            }}
          />
        </>
      )}
    </Card>
  );
}
