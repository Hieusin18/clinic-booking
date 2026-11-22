import { Card, Divider, Flex, Switch, Typography } from 'antd';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { useClinicSettings, type ClinicSettings } from '../../lib/settings';

const RULES: { key: keyof ClinicSettings; title: string; text: string }[] = [
  {
    key: 'walkInLimit',
    title: 'Chỉ nhận khách vãng lai khi bác sĩ có ca và còn thời gian rảnh',
    text: 'Bật: lễ tân và app không cấp số cho bác sĩ chưa mở ca, đã hết ca hoặc đã kín lịch (lễ tân vẫn nhận được khi bác sĩ đồng ý khám thêm giờ).',
  },
  {
    key: 'vitalsBeforeExam',
    title: 'Bác sĩ chỉ gọi bệnh nhân đã đo sinh hiệu',
    text: 'Bật: điều dưỡng gọi bệnh nhân vào đo, đo xong bác sĩ mới gọi được vào khám (bác sĩ vẫn gọi không chờ đo được khi cấp cứu). Tắt khi hôm đó không có điều dưỡng trực.',
  },
];

/** Admin bật/tắt các quy định tiếp đón của phòng khám. */
export function VitalsSettingCard() {
  const settings = useClinicSettings();
  const save = useAction((v: Partial<ClinicSettings>) => api.put('/settings', v), { success: 'Đã đổi quy định', invalidate: ['settings', 'queue'] });
  return (
    <Card size="small" title="Quy định tiếp đón" style={{ marginBottom: 16 }}>
      {RULES.map((r, i) => (
        <div key={r.key}>
          {i > 0 && <Divider style={{ margin: '12px 0' }} />}
          <Flex justify="space-between" align="center" gap={16} wrap>
            <div style={{ flex: 1, minWidth: 260 }}>
              <Typography.Text strong>{r.title}</Typography.Text>
              <div>
                <Typography.Text type="secondary">{r.text}</Typography.Text>
              </div>
            </div>
            <Switch
              checked={settings.data?.[r.key] ?? false}
              loading={settings.isLoading || (save.isPending && save.variables && r.key in save.variables)}
              onChange={(v) => save.mutate({ [r.key]: v })}
              aria-label={r.title}
            />
          </Flex>
        </div>
      ))}
    </Card>
  );
}
