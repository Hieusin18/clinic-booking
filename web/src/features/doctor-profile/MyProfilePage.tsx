import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Divider, Form, Row, Typography } from 'antd';
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import type { Doctor } from '../../lib/types';
import { AvatarField, ProfileFields } from './ProfileFields';
import { ProfilePreview } from './ProfilePreview';
import { toProfileForm, toProfilePayload, type ProfileFormValues } from './profileForm';

/** Bác sĩ tự cập nhật hồ sơ mà bệnh nhân xem trên app trước khi đặt lịch. */
export function MyProfilePage() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ProfileFormValues>();
  const watched = Form.useWatch([], form) as ProfileFormValues | undefined;
  const me = useQuery({ queryKey: ['doctor', 'me'], queryFn: async () => (await api.get<Doctor>('/doctors/me')).data });
  const save = useAction(async (v: ProfileFormValues) => (await api.patch<Doctor>('/doctors/me', toProfilePayload(v))).data, {
    success: 'Đã lưu hồ sơ',
  });

  useEffect(() => {
    if (me.data) form.setFieldsValue(toProfileForm(me.data));
  }, [me.data, form]);

  if (!me.data) return <Card loading={me.isLoading}>{me.isError && <Alert type="error" title="Không tải được hồ sơ" />}</Card>;
  const d = me.data;

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} xl={15}>
        <Card>
          <Typography.Title level={3} style={{ marginTop: 0 }}>
            Hồ sơ của tôi
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            Bệnh nhân xem các thông tin này trên app trước khi đặt lịch với bạn. Học vị, họ tên và chuyên khoa do quản trị viên cập nhật.
          </Typography.Paragraph>
          <AvatarField doctor={d} endpoint="/doctors/me/avatar" onChange={(next) => queryClient.setQueryData(['doctor', 'me'], next)} />
          <Typography.Title level={4} style={{ marginBottom: 0, marginTop: 16 }}>
            {d.title ? `${d.title} ` : ''}
            {d.user.fullName}
          </Typography.Title>
          <Typography.Text type="secondary">{d.specialty.name}</Typography.Text>
          <Divider />
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            onFinish={(v) => save.mutate(v, { onSuccess: (next) => queryClient.setQueryData(['doctor', 'me'], next) })}
          >
            <ProfileFields />
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              Lưu hồ sơ
            </Button>
          </Form>
        </Card>
      </Col>
      <Col xs={24} xl={9}>
        <ProfilePreview doctor={d} values={watched ?? toProfileForm(d)} />
      </Col>
    </Row>
  );
}
