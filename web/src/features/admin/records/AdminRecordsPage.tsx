import { HistoryOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, DatePicker, Descriptions, Drawer, Empty, Flex, Input, Select, Spin, Table, Tabs, Tag, Timeline, Tooltip, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { api, errorMessage } from '../../../lib/api';
import { age, doctorName, formatDate, formatDay, formatTime, GENDER_LABEL } from '../../../lib/format';
import { C } from '../../../lib/theme';
import type { AdminRecordRow, Page, RecordEvent, Visit } from '../../../lib/types';
import { DownloadButtons } from '../../exam/RecordCard';
import { useDoctorOptions } from '../../reception/useDoctorOptions';
import { VISIT_STATUS } from '../../reception/visitStatus';
import { FIELD_LABEL, fieldValue } from './recordFields';

const PAGE_SIZE = 20;
const at = (iso: string) => `${formatTime(iso)} · ${formatDate(iso)}`;

const ACTION_LABEL = {
  CREATE: 'Ghi bệnh án lần đầu',
  UPDATE: 'Sửa bệnh án',
  BASELINE: 'Nội dung trước khi bật lịch sử',
  FINALIZED: 'Hoàn tất đơn thuốc',
  REPLACED: 'Kê đơn thuốc thay thế',
} as const;

/** Một lần lưu bệnh án: ô nào đổi, giá trị cũ (gạch) → giá trị mới. */
function Changes({ event }: { event: Extract<RecordEvent, { kind: 'RECORD' }> }) {
  if (event.action === 'BASELINE') {
    return <Typography.Text type="secondary">Bệnh án đã có trước khi hệ thống ghi lịch sử; các lần sửa trước đó không còn.</Typography.Text>;
  }
  return (
    <Flex vertical gap={6} style={{ marginTop: 4 }}>
      {event.changes.map((c) => {
        const before = fieldValue(c.field, c.before);
        const after = fieldValue(c.field, c.after);
        return (
          <div key={c.field} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 190px) 1fr', gap: 8 }}>
            <Typography.Text type="secondary">{FIELD_LABEL[c.field] ?? c.field}</Typography.Text>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {event.action === 'UPDATE' && (
                <>
                  <span style={{ textDecoration: before ? 'line-through' : undefined, color: C.muted }}>{before ?? '(trống)'}</span>
                  <span style={{ color: C.faint }}> → </span>
                </>
              )}
              <span style={{ fontWeight: 500 }}>{after ?? '(xóa trống)'}</span>
            </div>
          </div>
        );
      })}
    </Flex>
  );
}

/** Dòng thời gian: các lần bác sĩ lưu bệnh án và các mốc đơn thuốc, mới nhất trên cùng. */
export function RecordHistory({ visitId }: { visitId: string }) {
  const events = useQuery({
    queryKey: ['record-history', visitId],
    queryFn: async () => (await api.get<RecordEvent[]>(`/visits/${visitId}/record/history`)).data,
  });
  if (events.isLoading) return <Spin />;
  if (events.isError) return <Alert type="error" showIcon title={errorMessage(events.error)} />;
  if (!events.data?.length) return <Empty description="Chưa có lịch sử" />;
  return (
    <Timeline
      style={{ marginTop: 8 }}
      items={[...events.data].reverse().map((e) =>
        e.kind === 'RECORD'
          ? {
              color: e.afterDone ? C.amber : e.action === 'CREATE' ? C.good : C.stamp,
              children: (
                <Flex vertical gap={2}>
                  <Flex gap={8} wrap align="center">
                    <Typography.Text strong>
                      Lần {e.version} · {ACTION_LABEL[e.action]}
                    </Typography.Text>
                    {e.afterDone && <Tag color="warning">Sửa sau khi đã hoàn tất lượt khám</Tag>}
                  </Flex>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {at(e.at)}
                    {e.editedBy ? ` · ${e.editedBy.fullName}` : ''}
                    {e.action !== 'BASELINE' ? ` · ${e.changes.length} mục` : ''}
                  </Typography.Text>
                  <Changes event={e} />
                </Flex>
              ),
            }
          : {
              color: 'gray',
              children: (
                <Flex vertical gap={2}>
                  <Typography.Text strong>
                    {ACTION_LABEL[e.action]}
                    {e.code ? ` ${e.code}` : ''}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {at(e.at)}
                  </Typography.Text>
                </Flex>
              ),
            },
      )}
    />
  );
}

/** Ngăn chi tiết (chỉ xem): thông tin lượt khám, bản bệnh án như bản in, lịch sử chỉnh sửa. */
function RecordDetail({ row }: { row: AdminRecordRow }) {
  const html = useQuery({
    queryKey: ['record-html', row.id],
    gcTime: 0,
    queryFn: async () => (await api.get<string>(`/visits/${row.id}/record.html`, { responseType: 'text' })).data,
  });
  return (
    <Flex vertical gap={16}>
      <Card size="small">
        <Descriptions
          size="small"
          column={{ xs: 1, md: 3 }}
          items={[
            { key: 'p', label: 'Bệnh nhân', children: `${row.patient.fullName} · ${GENDER_LABEL[row.patient.gender]} · ${age(row.patient.dateOfBirth)} tuổi` },
            { key: 'd', label: 'Bác sĩ', children: doctorName(row.doctor) },
            { key: 'date', label: 'Ngày khám', children: formatDay(row.date) },
            { key: 's', label: 'Trạng thái', children: <Tag color={VISIT_STATUS[row.status].color}>{VISIT_STATUS[row.status].label}</Tag> },
            { key: 'u', label: 'Sửa lần cuối', children: at(row.recordUpdatedAt) },
            { key: 'n', label: 'Số lần lưu', children: row.history.revisions },
          ]}
        />
      </Card>
      <Card size="small" styles={{ body: { paddingTop: 0 } }}>
        <Tabs
          items={[
            {
              key: 'record',
              label: 'Bệnh án',
              children: (
                <Flex vertical gap={12}>
                  <Flex justify="space-between" align="center" wrap gap={8}>
                    <Typography.Text type="secondary">Nội dung hiện tại, cùng bố cục bản in. Admin chỉ xem, không sửa được.</Typography.Text>
                    <Flex gap={8}>
                      <DownloadButtons visitId={row.id} size="small" />
                    </Flex>
                  </Flex>
                  {html.isError ? (
                    <Alert type="error" showIcon title={errorMessage(html.error)} />
                  ) : html.data ? (
                    // sandbox rỗng: không chạy script, không điều hướng; máy chủ đã thoát ký tự HTML
                    <iframe title="Bệnh án" srcDoc={html.data} sandbox="" style={{ width: '100%', height: '70vh', border: `1px solid ${C.line}`, borderRadius: 8, background: '#fff' }} />
                  ) : (
                    <Spin />
                  )}
                </Flex>
              ),
            },
            {
              key: 'history',
              label: (
                <span>
                  <HistoryOutlined /> Lịch sử chỉnh sửa ({row.history.revisions})
                </span>
              ),
              children: <RecordHistory visitId={row.id} />,
            },
          ]}
        />
      </Card>
    </Flex>
  );
}

/** Admin: tra cứu bệnh án của mọi bác sĩ và xem lịch sử bác sĩ sửa bệnh án. */
export function AdminRecordsPage() {
  const doctors = useDoctorOptions();
  const [q, setQ] = useState('');
  const [doctorId, setDoctorId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AdminRecordRow | null>(null);

  const params = {
    page,
    pageSize: PAGE_SIZE,
    ...(q ? { q } : {}),
    ...(doctorId ? { doctorId } : {}),
    ...(range ? { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } : {}),
  };
  const list = useQuery({
    queryKey: ['admin-records', params],
    queryFn: async () => (await api.get<Page<AdminRecordRow>>('/admin/records', { params })).data,
    placeholderData: (prev) => prev,
  });

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Hồ sơ bệnh án
          </Typography.Title>
          <Typography.Text type="secondary">Bệnh án của mọi bác sĩ, mới nhất trước. Bấm một dòng để xem bệnh án và các lần bác sĩ sửa.</Typography.Text>
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
            style={{ width: 260 }}
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
        <Table<AdminRecordRow>
          rowKey="id"
          loading={list.isFetching}
          dataSource={list.data?.items}
          locale={{ emptyText: q || doctorId || range ? 'Không có bệnh án khớp điều kiện tìm' : 'Chưa có bệnh án nào' }}
          onRow={(v) => ({ onClick: () => setOpen(v), style: { cursor: 'pointer' } })}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: list.data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `${t} bệnh án`,
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
              title: 'Bác sĩ',
              render: (_, v: Visit) => (
                <div>
                  <div>{doctorName(v.doctor)}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {v.doctor.specialty?.name}
                  </Typography.Text>
                </div>
              ),
            },
            {
              title: 'Chẩn đoán',
              render: (_, v) => (
                <span>
                  {v.medicalRecord.diagnosis}
                  {v.medicalRecord.icdCode && <Tag style={{ marginLeft: 6 }}>{v.medicalRecord.icdCode}</Tag>}
                </span>
              ),
            },
            {
              title: 'Trạng thái',
              width: 120,
              render: (_, v) => <Tag color={VISIT_STATUS[v.status].color}>{VISIT_STATUS[v.status].label}</Tag>,
            },
            {
              title: 'Chỉnh sửa',
              width: 190,
              render: (_, v) => (
                <Flex vertical gap={2} align="flex-start">
                  <Tooltip title={`Sửa lần cuối ${at(v.recordUpdatedAt)}`}>
                    <Typography.Text>{v.history.revisions > 1 ? `${v.history.revisions} lần lưu` : 'Ghi 1 lần'}</Typography.Text>
                  </Tooltip>
                  {v.history.editedAfterDone && <Tag color="warning">Sửa sau khi hoàn tất</Tag>}
                </Flex>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title={open ? `Bệnh án · ${open.patient.fullName}` : ''}
        open={!!open}
        onClose={() => setOpen(null)}
        width="min(1040px, 100vw)"
        destroyOnHidden
        styles={{ body: { background: C.paper } }}
      >
        {open && <RecordDetail row={open} />}
      </Drawer>
    </Flex>
  );
}
