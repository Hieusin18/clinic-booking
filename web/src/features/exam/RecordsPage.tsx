import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, DatePicker, Drawer, Flex, Input, Table, Tag, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api } from '../../lib/api';
import { age, formatDay, GENDER_LABEL, ticketLabel } from '../../lib/format';
import { C } from '../../lib/theme';
import type { MedicalRecord, Page, Prescription, Visit } from '../../lib/types';
import { VisitPanel } from './ExamPage';

/** Một dòng trong danh sách bệnh án đã khám */
export type ExaminedVisit = Visit & {
  medicalRecord: Pick<MedicalRecord, 'diagnosis' | 'icdCode' | 'followUpDate'> | null;
  prescription: Prescription | null;
};

const PAGE_SIZE = 20;

/**
 * Bác sĩ tra cứu bệnh án các lượt đã khám xong (mọi ngày): tìm theo tên, SĐT, chẩn đoán hoặc mã ICD,
 * lọc theo ngày khám; bấm một dòng để xem đầy đủ bệnh án, kết quả cận lâm sàng, đơn thuốc và tải bản in.
 */
export function RecordsPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const params = {
    page,
    pageSize: PAGE_SIZE,
    ...(q ? { q } : {}),
    ...(range ? { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } : {}),
  };
  const list = useQuery({
    queryKey: ['examined', params],
    queryFn: async () => (await api.get<Page<ExaminedVisit>>('/visits/examined', { params })).data,
    placeholderData: (prev) => prev,
  });

  const close = () => {
    setOpenId(null);
    // Bệnh án hoặc đơn có thể vừa được sửa trong ngăn chi tiết
    void queryClient.invalidateQueries({ queryKey: ['examined'] });
  };

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Bệnh án đã khám
          </Typography.Title>
          <Typography.Text type="secondary">Các lượt bạn đã khám xong, mới nhất trước. Bấm một dòng để xem lại hoặc tải bệnh án.</Typography.Text>
        </div>
        <Flex gap={8} wrap>
          <Input.Search
            aria-label="Tìm bệnh án"
            allowClear
            placeholder="Tên, SĐT, chẩn đoán, mã ICD"
            onSearch={(v) => {
              setQ(v.trim());
              setPage(1);
            }}
            style={{ width: 300 }}
          />
          <DatePicker.RangePicker
            aria-label="Khoảng ngày khám"
            format="DD/MM/YYYY"
            value={range}
            onChange={(v) => {
              setRange(v && v[0] && v[1] ? [v[0], v[1]] : null);
              setPage(1);
            }}
            presets={[
              { label: '7 ngày qua', value: [dayjs().subtract(6, 'day'), dayjs()] },
              { label: '30 ngày qua', value: [dayjs().subtract(29, 'day'), dayjs()] },
              { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs()] },
            ]}
          />
        </Flex>
      </Flex>

      <Card styles={{ body: { padding: 0 } }}>
        <Table<ExaminedVisit>
          rowKey="id"
          loading={list.isFetching}
          dataSource={list.data?.items}
          locale={{ emptyText: q || range ? 'Không có bệnh án khớp điều kiện tìm' : 'Chưa có lượt khám nào hoàn tất' }}
          onRow={(v) => ({ onClick: () => setOpenId(v.id), style: { cursor: 'pointer' } })}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: list.data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `${t} lượt khám`,
          }}
          columns={[
            {
              title: 'Ngày khám',
              width: 120,
              render: (_, v) => (
                <span className="num" style={{ fontSize: 18, fontWeight: 600 }}>
                  {formatDay(v.date)}
                </span>
              ),
            },
            {
              title: 'Số',
              width: 64,
              render: (_, v) => (
                <span className="num" style={{ fontSize: 18, color: C.muted }}>
                  {ticketLabel(v)}
                </span>
              ),
            },
            {
              title: 'Bệnh nhân',
              render: (_, v) => (
                <div>
                  <Typography.Text strong>{v.patient.fullName}</Typography.Text>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {GENDER_LABEL[v.patient.gender]} · {age(v.patient.dateOfBirth)} tuổi · {v.patient.phone}
                    </Typography.Text>
                  </div>
                </div>
              ),
            },
            {
              title: 'Chẩn đoán',
              render: (_, v) =>
                v.medicalRecord ? (
                  <span>
                    {v.medicalRecord.diagnosis}
                    {v.medicalRecord.icdCode && <Tag style={{ marginLeft: 6 }}>{v.medicalRecord.icdCode}</Tag>}
                  </span>
                ) : (
                  <Typography.Text type="secondary">Không có bệnh án</Typography.Text>
                ),
            },
            {
              title: 'Cận lâm sàng',
              width: 130,
              render: (_, v) => (v.labOrders?.length ? <Tag color="purple">{v.labOrders.length} chỉ định</Tag> : <Typography.Text type="secondary">—</Typography.Text>),
            },
            {
              title: 'Đơn thuốc',
              width: 120,
              render: (_, v) =>
                v.prescription ? <Tag color="success">{v.prescription.items.length} thuốc</Tag> : <Typography.Text type="secondary">Không kê đơn</Typography.Text>,
            },
            {
              title: 'Tái khám',
              width: 110,
              render: (_, v) => (v.medicalRecord?.followUpDate ? formatDay(v.medicalRecord.followUpDate) : <Typography.Text type="secondary">—</Typography.Text>),
            },
          ]}
        />
      </Card>

      <Drawer title="Chi tiết lượt khám" open={!!openId} onClose={close} width="min(1040px, 100vw)" destroyOnHidden styles={{ body: { background: C.paper } }}>
        {openId && <VisitPanel visitId={openId} onDone={close} />}
      </Drawer>
    </Flex>
  );
}
