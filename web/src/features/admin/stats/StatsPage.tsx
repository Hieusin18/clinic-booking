import { ArrowDownOutlined, ArrowUpOutlined, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, DatePicker, Flex, Popover, Segmented, Skeleton, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState, type ReactNode } from 'react';
import { api } from '../../../lib/api';
import { errorMessage } from '../../../lib/api';
import { C, NUM } from '../../../lib/theme';
import { BarList, Legend, StackedBars } from './charts';
import { change, fmt, fmtMinutes, fmtPercent, longDate, presets, SOURCE_SERIES, shortDate, toCsv, type StatsOverview } from './stats';

const grid = (min: number) => ({ display: 'grid', gap: 16, gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` }) as const;

/** Ô chỉ số: số lớn, so với kỳ trước (mũi tên + chữ, không chỉ dựa vào màu), dòng phụ. */
function Kpi({ label, value, delta, sub }: { label: string; value: ReactNode; delta: ReturnType<typeof change>; sub?: ReactNode }) {
  const tone = delta?.better === true ? C.good : delta?.better === false ? C.amber : C.muted;
  return (
    <Card size="small" styles={{ body: { padding: '14px 16px' } }}>
      <div style={{ color: C.muted, fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div className="num" style={{ fontFamily: NUM, fontSize: 38, fontWeight: 700, lineHeight: 1.15, color: C.ink }}>
        {value}
      </div>
      <Flex vertical gap={2} style={{ fontSize: 12.5 }}>
        {delta && (
          <span style={{ color: tone, fontWeight: 600 }}>
            {delta.up === true && <ArrowUpOutlined />} {delta.up === false && <ArrowDownOutlined />} {delta.text}
            <span style={{ color: C.muted, fontWeight: 400 }}> so với kỳ trước</span>
          </span>
        )}
        {sub && <span style={{ color: C.muted }}>{sub}</span>}
      </Flex>
    </Card>
  );
}

const DEFINITIONS = (
  <div style={{ maxWidth: 360, fontSize: 13 }}>
    <p style={{ margin: '0 0 6px' }}>
      <b>Trung vị</b>: một nửa số lượt thấp hơn mức này (không bị vài lượt quá lâu kéo lệch như số trung bình).
    </p>
    <p style={{ margin: '0 0 6px' }}>
      <b>Thời gian chờ</b>: từ lúc lấy số tới lúc được gọi. Người đặt online đến sớm thì tính từ giờ hẹn.
    </p>
    <p style={{ margin: '0 0 6px' }}>
      <b>Thời gian khám</b>: từ lúc được gọi tới lúc bác sĩ hoàn tất, không tính lượt đi cận lâm sàng.
    </p>
    <p style={{ margin: 0 }}>
      <b>Tỷ lệ không đến</b>: lịch hẹn quá giờ check-in mà không đến / lịch hẹn đã tới giờ và không bị hủy.
    </p>
  </div>
);

/** Trang Thống kê cho admin: số liệu thật từ dữ liệu khám, chọn khoảng thời gian, so với kỳ trước, tải CSV. */
export function StatsPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => presets()[1].value);
  const [dailyView, setDailyView] = useState<'chart' | 'table'>('chart');
  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');
  const q = useQuery({
    queryKey: ['stats', from, to],
    queryFn: async () => (await api.get<StatsOverview>('/stats/overview', { params: { from, to } })).data,
    placeholderData: (prev) => prev,
  });
  const s = q.data;

  const download = () => {
    if (!s) return;
    const url = URL.createObjectURL(new Blob([toCsv(s)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `thong-ke-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Thống kê
          </Typography.Title>
          {s && (
            <Typography.Text type="secondary">
              {longDate(s.range.from)} – {longDate(s.range.to)} · so với {longDate(s.previousRange.from)} – {longDate(s.previousRange.to)}{' '}
              <Popover content={DEFINITIONS} title="Cách tính">
                <InfoCircleOutlined aria-label="Cách tính các chỉ số" style={{ color: C.stamp, cursor: 'help' }} />
              </Popover>
            </Typography.Text>
          )}
        </div>
        <Flex gap={8} wrap>
          <DatePicker.RangePicker
            aria-label="Khoảng thời gian"
            value={range}
            onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])}
            presets={presets()}
            format="DD/MM/YYYY"
            allowClear={false}
            disabledDate={(d) => d.isAfter(dayjs(), 'day')}
          />
          <Button icon={<DownloadOutlined />} onClick={download} disabled={!s}>
            Tải CSV
          </Button>
        </Flex>
      </Flex>

      {q.error && <Alert type="warning" showIcon title={errorMessage(q.error)} />}
      {!s ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <>
          <div className="kpi-grid">
            <Kpi
              label="Lượt khám xong"
              value={fmt(s.kpis.completed)}
              delta={change(s.kpis.completed, s.previous.completed, { kind: 'count' })}
              sub={`${fmt(s.kpis.visits)} lượt lấy số · ${fmt(s.kpis.left)} bỏ về`}
            />
            <Kpi
              label="Bệnh nhân"
              value={fmt(s.kpis.patients)}
              delta={change(s.kpis.patients, s.previous.patients, { kind: 'count' })}
              sub={`${fmt(s.kpis.newPatients)} bệnh nhân mới`}
            />
            <Kpi
              label="Đặt lịch online"
              value={fmtPercent(s.kpis.onlineShare)}
              delta={change(s.kpis.onlineShare, s.previous.onlineShare, { kind: 'percent' })}
              sub="trên tổng lượt lấy số"
            />
            <Kpi
              label="Chờ đến lượt (trung vị)"
              value={fmtMinutes(s.kpis.waitMedian)}
              delta={change(s.kpis.waitMedian, s.previous.waitMedian, { kind: 'minutes', lowerIsBetter: true })}
              sub={`Online ${fmtMinutes(s.kpis.waitOnlineMedian)} · Vãng lai ${fmtMinutes(s.kpis.waitWalkInMedian)}`}
            />
            <Kpi
              label="Thời gian khám (trung vị)"
              value={fmtMinutes(s.kpis.examMedian)}
              delta={change(s.kpis.examMedian, s.previous.examMedian, { kind: 'minutes', neutral: true })}
              sub="không tính lượt đi cận lâm sàng"
            />
            <Kpi
              label="Lịch hẹn không đến"
              value={fmtPercent(s.kpis.noShowRate)}
              delta={change(s.kpis.noShowRate, s.previous.noShowRate, { kind: 'percent', lowerIsBetter: true })}
              sub={`${fmt(s.appointments.noShow)} / ${fmt(s.appointments.total - s.appointments.cancelled - s.appointments.upcoming)} lịch đã tới giờ`}
            />
          </div>

          <Card
            title="Lượt lấy số theo ngày"
            extra={
              <Segmented
                size="small"
                value={dailyView}
                onChange={(v) => setDailyView(v as 'chart' | 'table')}
                options={[
                  { label: 'Biểu đồ', value: 'chart' },
                  { label: 'Bảng', value: 'table' },
                ]}
              />
            }
          >
            {dailyView === 'chart' ? (
              <Flex vertical gap={8}>
                <Legend series={SOURCE_SERIES} />
                <StackedBars
                  ariaLabel={`Lượt lấy số theo ngày, ${s.range.days} ngày, chia đặt online và vãng lai. Xem dạng bảng để đọc từng số.`}
                  categories={s.daily.map((d) => shortDate(d.date))}
                  series={SOURCE_SERIES.map((x) => ({ name: x.name, color: x.color, values: s.daily.map((d) => d[x.key]) }))}
                  tooltipTitle={(i) => dayjs(s.daily[i].date).format('dddd, DD/MM/YYYY')}
                />
              </Flex>
            ) : (
              <Table
                size="small"
                rowKey="date"
                dataSource={s.daily}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                columns={[
                  { title: 'Ngày', dataIndex: 'date', render: (d: string) => dayjs(d).format('dd, DD/MM/YYYY') },
                  { title: 'Đặt online', dataIndex: 'online', align: 'right' },
                  { title: 'Vãng lai', dataIndex: 'walkIn', align: 'right' },
                  { title: 'Khám xong', dataIndex: 'completed', align: 'right' },
                ]}
              />
            )}
          </Card>

          <div style={grid(380)}>
            <Card title="Giờ lấy số trong ngày">
              <Flex vertical gap={8}>
                <Legend series={SOURCE_SERIES} />
                <StackedBars
                  height={220}
                  ariaLabel="Số lượt lấy số theo giờ trong ngày, chia đặt online và vãng lai"
                  categories={s.hourly.map((h) => `${h.hour}h`)}
                  series={SOURCE_SERIES.map((x) => ({ name: x.name, color: x.color, values: s.hourly.map((h) => h[x.key]) }))}
                  tooltipTitle={(i) => `${s.hourly[i].hour}:00 – ${s.hourly[i].hour + 1}:00`}
                />
              </Flex>
            </Card>
            <Card title="Chờ đến lượt theo cách đến (trung vị)">
              <Flex vertical gap={16}>
                <BarList
                  rows={[
                    {
                      key: 'online',
                      label: 'Đặt lịch online',
                      value: s.kpis.waitOnlineMedian ?? 0,
                      display: fmtMinutes(s.kpis.waitOnlineMedian),
                      color: SOURCE_SERIES[0].color,
                    },
                    {
                      key: 'walkIn',
                      label: 'Vãng lai',
                      value: s.kpis.waitWalkInMedian ?? 0,
                      display: fmtMinutes(s.kpis.waitWalkInMedian),
                      color: SOURCE_SERIES[1].color,
                    },
                  ]}
                />
                {s.kpis.waitOnlineMedian !== null && s.kpis.waitWalkInMedian !== null && s.kpis.waitOnlineMedian < s.kpis.waitWalkInMedian && (
                  <Typography.Text type="secondary">
                    Người đặt lịch online chờ ít hơn {fmtMinutes(Math.round((s.kpis.waitWalkInMedian - s.kpis.waitOnlineMedian) * 10) / 10)} so với người đến
                    trực tiếp.
                  </Typography.Text>
                )}
              </Flex>
            </Card>
          </div>

          <div style={grid(380)}>
            <Card title="Chẩn đoán thường gặp">
              <BarList
                rows={s.diagnoses.map((d) => ({
                  key: d.code ?? d.name,
                  value: d.count,
                  label: (
                    <>
                      {d.code && <Tag style={{ fontFamily: NUM, fontSize: 13 }}>{d.code}</Tag>}
                      {d.name}
                    </>
                  ),
                }))}
              />
            </Card>
            <Card title="Thuốc được kê nhiều nhất">
              <BarList
                rows={s.medicines.map((m) => ({
                  key: m.name,
                  value: m.prescriptions,
                  label: m.name,
                  display: `${fmt(m.prescriptions)} đơn`,
                }))}
              />
            </Card>
          </div>

          <div style={grid(380)}>
            <Card title="Lịch hẹn online">
              <BarList
                rows={[
                  { key: 'done', label: 'Đến khám', value: s.appointments.completed },
                  { key: 'noshow', label: 'Không đến', value: s.appointments.noShow },
                  { key: 'cancel', label: 'Bệnh nhân hủy', value: s.appointments.cancelled },
                  { key: 'up', label: 'Chưa tới giờ', value: s.appointments.upcoming },
                ]}
              />
            </Card>
            <Card title="Cận lâm sàng">
              <div style={grid(130)}>
                <div>
                  <div style={{ color: C.muted, fontSize: 13 }}>Lượt có chỉ định</div>
                  <div style={{ fontFamily: NUM, fontSize: 30, fontWeight: 700 }}>{fmt(s.labs.visitsWithTests)}</div>
                </div>
                <div>
                  <div style={{ color: C.muted, fontSize: 13 }}>Quay lại / nhận online</div>
                  <div style={{ fontFamily: NUM, fontSize: 30, fontWeight: 700 }}>
                    {fmt(s.labs.returnMode)} / {fmt(s.labs.onlineMode)}
                  </div>
                </div>
                <div>
                  <div style={{ color: C.muted, fontSize: 13 }}>Có kết quả sau (trung vị)</div>
                  <div style={{ fontFamily: NUM, fontSize: 30, fontWeight: 700 }}>{fmtMinutes(s.labs.turnaroundMedian)}</div>
                </div>
              </div>
            </Card>
          </div>

          <Card title="Theo bác sĩ">
            <Table
              size="small"
              rowKey="id"
              dataSource={s.doctors}
              pagination={false}
              scroll={{ x: 640 }}
              columns={[
                { title: 'Bác sĩ', dataIndex: 'name' },
                { title: 'Chuyên khoa', dataIndex: 'specialty' },
                { title: 'Phòng', dataIndex: 'room', render: (r: string | null) => r ?? '—' },
                { title: 'Lượt khám xong', dataIndex: 'completed', align: 'right', sorter: (a, b) => a.completed - b.completed, defaultSortOrder: 'descend' },
                {
                  title: 'Chờ trung vị',
                  dataIndex: 'waitMedian',
                  align: 'right',
                  render: fmtMinutes,
                  sorter: (a, b) => (a.waitMedian ?? 0) - (b.waitMedian ?? 0),
                },
                {
                  title: 'Khám trung vị',
                  dataIndex: 'examMedian',
                  align: 'right',
                  render: fmtMinutes,
                  sorter: (a, b) => (a.examMedian ?? 0) - (b.examMedian ?? 0),
                },
              ]}
            />
          </Card>
        </>
      )}
    </Flex>
  );
}
