import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Flex, Popconfirm, Rate, Segmented, Select, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { api } from '../../lib/api';
import { doctorName, formatDate, formatTime } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import type { AdminReview, Page } from '../../lib/types';
import { useDoctorOptions } from '../reception/useDoctorOptions';

const PAGE_SIZE = 20;
type Filter = 'all' | 'low' | 'hidden';

/**
 * Admin kiểm duyệt đánh giá của bệnh nhân. Góp ý có từ ngữ không phù hợp đã bị chặn ngay khi gửi; góp ý lọt bộ lọc
 * thì ẩn ở đây: không còn hiện trên hồ sơ bác sĩ và không tính vào điểm trung bình.
 */
export function ReviewsPage() {
  const doctors = useDoctorOptions();
  const [filter, setFilter] = useState<Filter>('all');
  const [doctorId, setDoctorId] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const params = {
    page,
    pageSize: PAGE_SIZE,
    ...(doctorId ? { doctorId } : {}),
    ...(filter === 'low' ? { maxRating: 2 } : filter === 'hidden' ? { hidden: true } : {}),
  };
  const list = useQuery({
    queryKey: ['admin-reviews', params],
    queryFn: async () => (await api.get<Page<AdminReview>>('/admin/reviews', { params })).data,
    placeholderData: (prev) => prev,
  });
  const toggle = useAction(
    ({ id, hidden }: { id: string; hidden: boolean }) => api.patch(`/admin/reviews/${id}`, { hidden, reason: hidden ? 'Nội dung không phù hợp' : undefined }),
    { success: 'Đã cập nhật đánh giá', invalidate: ['admin-reviews'] },
  );

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Đánh giá của bệnh nhân
          </Typography.Title>
          <Typography.Text type="secondary">
            Góp ý có từ ngữ không phù hợp bị chặn ngay khi gửi. Góp ý lọt bộ lọc thì ẩn ở đây: không hiện trên hồ sơ bác sĩ, không tính điểm.
          </Typography.Text>
        </div>
        <Flex gap={8} wrap>
          <Segmented<Filter>
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'low', label: '1–2 sao' },
              { value: 'hidden', label: 'Đã ẩn' },
            ]}
          />
          <Select
            aria-label="Bác sĩ"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Tất cả bác sĩ"
            value={doctorId}
            onChange={(v) => {
              setDoctorId(v);
              setPage(1);
            }}
            options={doctors.options}
            style={{ width: 220 }}
          />
        </Flex>
      </Flex>
      <Card styles={{ body: { padding: 0 } }}>
        <Table<AdminReview>
          rowKey="id"
          loading={list.isFetching}
          dataSource={list.data?.items}
          locale={{ emptyText: 'Chưa có đánh giá nào' }}
          pagination={{ current: page, pageSize: PAGE_SIZE, total: list.data?.total ?? 0, onChange: setPage, showSizeChanger: false, showTotal: (t) => `${t} đánh giá` }}
          columns={[
            {
              title: 'Ngày',
              width: 120,
              render: (_, r) => (
                <div>
                  <div>{formatDate(r.createdAt)}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                    {formatTime(r.createdAt)}
                  </Typography.Text>
                </div>
              ),
            },
            { title: 'Bệnh nhân', width: 170, render: (_, r) => r.patient.fullName },
            { title: 'Bác sĩ', width: 180, render: (_, r) => doctorName(r.doctor) },
            { title: 'Số sao', width: 150, render: (_, r) => <Rate disabled value={r.rating} style={{ fontSize: 15 }} /> },
            {
              title: 'Góp ý',
              render: (_, r) =>
                r.comment ? (
                  <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', opacity: r.hidden ? 0.55 : 1 }} ellipsis={{ rows: 3, expandable: true, symbol: 'xem thêm' }}>
                    {r.comment}
                  </Typography.Paragraph>
                ) : (
                  <Typography.Text type="secondary">Chỉ chấm sao</Typography.Text>
                ),
            },
            {
              title: '',
              width: 150,
              render: (_, r) =>
                r.hidden ? (
                  <Flex vertical gap={4} align="flex-start">
                    <Tag color="warning">Đã ẩn</Tag>
                    <Button size="small" icon={<EyeOutlined />} onClick={() => toggle.mutate({ id: r.id, hidden: false })}>
                      Hiện lại
                    </Button>
                  </Flex>
                ) : (
                  <Popconfirm
                    title="Ẩn đánh giá này?"
                    description="Góp ý không hiện trên hồ sơ bác sĩ và không tính vào điểm trung bình."
                    okText="Ẩn"
                    cancelText="Hủy"
                    onConfirm={() => toggle.mutate({ id: r.id, hidden: true })}
                  >
                    <Button size="small" icon={<EyeInvisibleOutlined />}>
                      Ẩn
                    </Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      </Card>
    </Flex>
  );
}
