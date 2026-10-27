import { Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag } from 'antd';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAction, usePagedList } from '../../lib/hooks';
import type { Doctor } from '../../lib/types';
import { PageHeader } from './PageHeader';
import { useSpecialtyOptions } from './useSpecialtyOptions';

type FormValues = {
  fullName: string;
  phone?: string;
  email?: string;
  password?: string;
  specialtyId: string;
  title?: string;
  bio?: string;
};

export function DoctorsPage() {
  const [specialtyId, setSpecialtyId] = useState<string | undefined>();
  const list = usePagedList<Doctor>('doctors', '/doctors/all', specialtyId ? { specialtyId } : {});
  const specialties = useSpecialtyOptions();
  const [editing, setEditing] = useState<Doctor | 'new' | null>(null);
  const [form] = Form.useForm<FormValues>();
  const isNew = editing === 'new';

  const save = useAction(
    (v: FormValues): Promise<unknown> => {
      if (editing && editing !== 'new') {
        const { fullName, specialtyId: sid, title, bio } = v;
        return api.patch(`/doctors/${editing.id}`, { fullName, specialtyId: sid, title, bio });
      }
      return api.post('/doctors', { ...v, email: v.email || undefined });
    },
    { success: 'Đã lưu thông tin bác sĩ', invalidate: ['doctors', 'specialties'] },
  );
  const toggle = useAction((d: Doctor) => api.patch(`/doctors/${d.id}`, { isActive: !d.user.isActive }), {
    success: 'Đã cập nhật trạng thái',
    invalidate: ['doctors'],
  });

  const open = (d: Doctor | 'new') => {
    setEditing(d);
    form.resetFields();
    if (d !== 'new') {
      form.setFieldsValue({ fullName: d.user.fullName, specialtyId: d.specialty.id, title: d.title ?? '', bio: d.bio ?? '' });
    }
  };

  return (
    <Card>
      <PageHeader title="Bác sĩ" onSearch={list.search} searchPlaceholder="Tìm theo tên" onAdd={() => open('new')} addLabel="Thêm bác sĩ" />
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
          { title: 'Họ tên', render: (_, d) => <span>{d.title ? `${d.title} ` : ''}{d.user.fullName}</span> },
          { title: 'Chuyên khoa', render: (_, d) => <Tag color="cyan">{d.specialty.name}</Tag> },
          { title: 'Số điện thoại (đăng nhập)', render: (_, d) => d.user.phone },
          {
            title: 'Hoạt động',
            width: 110,
            align: 'center',
            render: (_, d) => <Switch checked={d.user.isActive} loading={toggle.isPending && toggle.variables?.id === d.id} onChange={() => toggle.mutate(d)} />,
          },
          { title: '', width: 80, render: (_, d) => <Button size="small" onClick={() => open(d)}>Sửa</Button> },
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
        destroyOnHidden
      >
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
          <Form.Item label="Giới thiệu" name="bio">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
