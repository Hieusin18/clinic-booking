import { UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Card, Divider, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAction, usePagedList } from '../../lib/hooks';
import type { Doctor } from '../../lib/types';
import { AvatarField, ProfileFields } from '../doctor-profile/ProfileFields';
import { avatarUrl, toProfileForm, toProfilePayload, type ProfileFormValues } from '../doctor-profile/profileForm';
import { PageHeader } from './PageHeader';
import { useSpecialtyOptions } from './useSpecialtyOptions';

type FormValues = ProfileFormValues & {
  fullName: string;
  phone?: string;
  email?: string;
  password?: string;
  specialtyId: string;
  title?: string;
};

export function DoctorsPage() {
  const [specialtyId, setSpecialtyId] = useState<string | undefined>();
  const list = usePagedList<Doctor>('doctors', '/doctors/all', specialtyId ? { specialtyId } : {});
  const specialties = useSpecialtyOptions();
  const [editing, setEditing] = useState<Doctor | 'new' | null>(null);
  const [form] = Form.useForm<FormValues>();
  const isNew = editing === 'new';

  /** Bác sĩ đang sửa, đã tải đủ hồ sơ (quá trình đào tạo, công tác, ảnh) */
  const [full, setFull] = useState<Doctor | null>(null);

  const save = useAction(
    async (v: FormValues): Promise<unknown> => {
      const { fullName, phone, email, password, specialtyId: sid, title, ...profile } = v;
      const body = toProfilePayload(profile);
      if (editing && editing !== 'new') return api.patch(`/doctors/${editing.id}`, { fullName, specialtyId: sid, title, ...body });
      const created = (await api.post<Doctor>('/doctors', { fullName, phone, password, specialtyId: sid, title, email: email || undefined })).data;
      return api.patch(`/doctors/${created.id}`, body);
    },
    { success: 'Đã lưu thông tin bác sĩ', invalidate: ['doctors', 'specialties'] },
  );
  const toggle = useAction((d: Doctor) => api.patch(`/doctors/${d.id}`, { isActive: !d.user.isActive }), {
    success: 'Đã cập nhật trạng thái',
    invalidate: ['doctors'],
  });

  const open = async (d: Doctor | 'new') => {
    setEditing(d);
    setFull(null);
    form.resetFields();
    if (d === 'new') return;
    form.setFieldsValue({ fullName: d.user.fullName, specialtyId: d.specialty.id, title: d.title ?? '' });
    const loaded = (await api.get<Doctor>(`/doctors/${d.id}/full`)).data;
    setFull(loaded);
    form.setFieldsValue(toProfileForm(loaded));
  };

  return (
    <Card>
      <PageHeader title="Bác sĩ" onSearch={list.search} searchPlaceholder="Tìm theo tên" onAdd={() => void open('new')} addLabel="Thêm bác sĩ" />
      <Select
        allowClear
        placeholder="Lọc theo chuyên khoa"
        options={specialties.options}
        value={specialtyId}
        onChange={setSpecialtyId}
        style={{ width: 260, marginBottom: 16 }}
      />
      <Table<Doctor>
        rowKey="id"
        loading={list.isFetching}
        dataSource={list.data?.items}
        pagination={list.pagination}
        columns={[
          {
            title: 'Họ tên',
            render: (_, d) => (
              <Space>
                <Avatar src={avatarUrl(d)} icon={<UserOutlined />} />
                <span>
                  {d.title ? `${d.title} ` : ''}
                  {d.user.fullName}
                </span>
              </Space>
            ),
          },
          { title: 'Chuyên khoa', render: (_, d) => <Tag>{d.specialty.name}</Tag> },
          {
            title: 'Kinh nghiệm',
            width: 130,
            onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
            render: (_, d) =>
              d.experienceYears != null ? (
                <span aria-label={`${d.experienceYears} năm kinh nghiệm`}>
                  <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{d.experienceYears}</span> năm
                </span>
              ) : (
                <Typography.Text type="secondary">—</Typography.Text>
              ),
          },
          {
            title: 'Công việc hiện tại',
            render: (_, d) => (d.currentPosition ? d.currentPosition : <Typography.Text type="secondary">Chưa cập nhật</Typography.Text>),
          },
          { title: 'Số điện thoại (đăng nhập)', render: (_, d) => d.user.phone },
          {
            title: 'Hoạt động',
            width: 110,
            align: 'center',
            render: (_, d) => <Switch checked={d.user.isActive} loading={toggle.isPending && toggle.variables?.id === d.id} onChange={() => toggle.mutate(d)} />,
          },
          { title: '', width: 80, render: (_, d) => <Button size="small" onClick={() => void open(d)}>Sửa</Button> },
        ]}
      />
      <Modal
        title={isNew ? 'Thêm bác sĩ' : 'Sửa thông tin bác sĩ'}
        open={editing !== null}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={save.isPending}
        onCancel={() => setEditing(null)}
        onOk={() => form.validateFields().then((v) => save.mutateAsync(v)).then(() => setEditing(null)).catch(() => {})}
        width={900}
        destroyOnHidden
      >
        {full && (
          <>
            <AvatarField doctor={full} endpoint={`/doctors/${full.id}/avatar`} onChange={(next) => { setFull(next); void list.refetch(); }} />
            <Divider />
          </>
        )}
        <Form form={form} layout="vertical" requiredMark={false}>
          <Space.Compact block>
            <Form.Item label="Học vị" name="title" style={{ width: 130 }}>
              <Input placeholder="ThS.BS" />
            </Form.Item>
            <Form.Item label="Họ tên" name="fullName" rules={[{ required: true, min: 2, message: 'Nhập họ tên' }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Form.Item label="Chuyên khoa" name="specialtyId" rules={[{ required: true, message: 'Chọn chuyên khoa' }]}>
            <Select options={specialties.options} loading={specialties.isLoading} />
          </Form.Item>
          {isNew && (
            <>
              <Form.Item
                label="Số điện thoại (dùng để đăng nhập)"
                name="phone"
                rules={[{ required: true, pattern: /^0\d{9}$/, message: 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0' }]}
              >
                <Input inputMode="tel" />
              </Form.Item>
              <Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
                <Input />
              </Form.Item>
              <Form.Item label="Mật khẩu ban đầu" name="password" rules={[{ required: true, min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' }]}>
                <Input.Password />
              </Form.Item>
            </>
          )}
          <Divider />
          <Typography.Title level={5} style={{ marginTop: 0 }}>Hồ sơ hiện cho bệnh nhân</Typography.Title>
          <ProfileFields />
        </Form>
      </Modal>
    </Card>
  );
}
