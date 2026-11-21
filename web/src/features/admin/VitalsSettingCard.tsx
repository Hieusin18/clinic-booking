import { Card, Flex, Switch, Typography } from 'antd';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { useClinicSettings } from '../../lib/settings';

/** Admin bật/tắt quy trình "điều dưỡng đo sinh hiệu xong bác sĩ mới gọi vào khám" (tắt khi không có điều dưỡng trực). */
export function VitalsSettingCard() {
  const settings = useClinicSettings();
  const save = useAction((on: boolean) => api.put('/settings', { vitalsBeforeExam: on }), { success: 'Đã đổi quy trình đo sinh hiệu', invalidate: ['settings', 'queue'] });
  const on = settings.data?.vitalsBeforeExam ?? false;
  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Flex justify="space-between" align="center" gap={16} wrap>
        <div style={{ flex: 1, minWidth: 260 }}>
          <Typography.Text strong>Bác sĩ chỉ gọi bệnh nhân đã đo sinh hiệu</Typography.Text>
          <div>
            <Typography.Text type="secondary">
              Bật: điều dưỡng gọi bệnh nhân vào đo, đo xong bác sĩ mới gọi được vào khám (bác sĩ vẫn gọi không chờ đo được khi cấp cứu). Tắt khi hôm đó không có
              điều dưỡng trực.
            </Typography.Text>
          </div>
        </div>
        <Switch checked={on} loading={settings.isLoading || save.isPending} onChange={(v) => save.mutate(v)} aria-label="Bác sĩ chỉ gọi bệnh nhân đã đo sinh hiệu" />
      </Flex>
    </Card>
  );
}
